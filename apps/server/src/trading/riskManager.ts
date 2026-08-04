import { prisma } from "../db/prisma";
import { broadcast } from "../ws/relay";
import { config } from "../config";
import { closePosition } from "./paperTradingEngine";
import { toPositionEvent, toTradeEvent } from "./mappers";
import type { TradeReason } from "@noctas/shared";

// 決済処理が完了するまでの間、同一ポジションを二重に決済しないためのガード。
// 自動決済(このファイル)と手動決済(trading/routes.ts)の両方が同じSetを共有することで、
// 「損切り条件に達した瞬間に手動決済ボタンも押された」ような競合を防ぐ
const closingInFlight = new Set<string>();

export function isClosingInFlight(positionId: string): boolean {
  return closingInFlight.has(positionId);
}

export function markClosingStart(positionId: string): void {
  closingInFlight.add(positionId);
}

export function markClosingDone(positionId: string): void {
  closingInFlight.delete(positionId);
}

/** resolveExitReason の入力。DBのPosition行から必要な値だけを取り出したもの */
export interface ExitCheckInput {
  entryPrice: number;
  currentPrice: number;
  /** トレーリングストップの基準となる、建玉後の最高値 */
  highestPrice: number;
  /** ポジションに記録された戦略別設定(nullはグローバル設定にフォールバック) */
  stopLossPct: number | null;
  /** 0は「利確を使わない」の明示指定(グローバル既定へはフォールバックしない) */
  takeProfitPct: number | null;
  /** nullはトレーリングストップ無効(グローバル既定へのフォールバックは無い) */
  trailingStopPct: number | null;
}

export interface ExitEvaluation {
  reason: TradeReason | null;
  /** reasonが成立した判定基準価格(stop_loss/trailing_stopは下限、take_profitは上限)。reasonがnullの場合はnull */
  triggerPrice: number | null;
}

/**
 * ストップロス/テイクプロフィット/トレーリングストップの発火判定(純粋関数、DBアクセスなし)。
 * 優先順: 利確(take_profit) → トレーリングストップ(trailing_stop) → 損切り(stop_loss)。
 * 損切り率・利確率はポジションに記録された戦略別設定を優先し、無ければグローバル設定を使う。
 * 利確率は往復コスト(手数料+スリッページ×2)を下回らないよう切り上げる。
 * ただし利確率が明示的に0のポジションは「利確なし」の指定として利確判定自体を行わない。
 * トレーリングはポジションに設定がある場合のみ有効。
 * checkExits(自動決済)とstrategy/backtestEngine.ts(バックテスト)の両方から呼ばれる。
 */
export function resolveExitReason(input: ExitCheckInput): ExitEvaluation {
  const stopLossPct = input.stopLossPct ?? config.risk.stopLossPct;
  // 0は「利確を使わない(トレーリング/損切りだけで運用する)」という明示指定。
  // 未設定(null)のときだけグローバル既定へフォールバックし、往復コストを下回る
  // 利確ラインは安全マージンを割るため実効値をコスト分まで切り上げる
  const takeProfitPct =
    input.takeProfitPct === 0
      ? null
      : Math.max(input.takeProfitPct ?? config.risk.takeProfitPct, config.fees.roundTripCostPct);
  const trailingStopPct = input.trailingStopPct;

  if (takeProfitPct !== null && input.currentPrice >= input.entryPrice * (1 + takeProfitPct / 100)) {
    return { reason: "take_profit", triggerPrice: input.entryPrice * (1 + takeProfitPct / 100) };
  }
  if (
    trailingStopPct != null &&
    input.currentPrice <= input.highestPrice * (1 - trailingStopPct / 100)
  ) {
    return {
      reason: "trailing_stop",
      triggerPrice: input.highestPrice * (1 - trailingStopPct / 100),
    };
  }
  if (input.currentPrice <= input.entryPrice * (1 - stopLossPct / 100)) {
    return { reason: "stop_loss", triggerPrice: input.entryPrice * (1 - stopLossPct / 100) };
  }
  return { reason: null, triggerPrice: null };
}

/**
 * 保有中の全ポジションを現在値で評価し、出口条件に達していれば自動決済する。
 * 判定ロジック自体はresolveExitReason()を参照。
 * Claude APIは呼ばないためトークン課金は発生しない。
 */
export async function checkExits(pair: string, currentPrice: number) {
  const openPositions = await prisma.position.findMany({
    where: { pair, side: "buy", closedAt: null },
  });

  for (const position of openPositions) {
    if (closingInFlight.has(position.id)) continue;

    // トレーリング用の最高値を更新(上昇時のみ書き込み)
    let highestPrice = position.highestPrice ?? position.entryPrice;
    if (currentPrice > highestPrice) {
      highestPrice = currentPrice;
      await prisma.position
        .update({ where: { id: position.id }, data: { highestPrice } })
        .catch(() => {});
    }

    const { reason } = resolveExitReason({
      entryPrice: position.entryPrice,
      currentPrice,
      highestPrice,
      stopLossPct: position.stopLossPct,
      takeProfitPct: position.takeProfitPct,
      trailingStopPct: position.trailingStopPct,
    });

    if (!reason) continue;

    closingInFlight.add(position.id);
    try {
      const result = await closePosition(position, currentPrice, reason);
      const changePct =
        ((currentPrice - position.entryPrice) / position.entryPrice) * 100;
      console.info(
        `[riskManager] ${reason} 執行: position=${position.id} entry=${position.entryPrice} current=${currentPrice} (${changePct.toFixed(2)}%)`
      );
      broadcast({ type: "trade", payload: toTradeEvent(result.trade) });
      broadcast({ type: "position_update", payload: toPositionEvent(result.position) });
    } catch (err) {
      console.error(`[riskManager] ${reason} 執行中にエラーが発生しました`, err);
    } finally {
      closingInFlight.delete(position.id);
    }
  }
}
