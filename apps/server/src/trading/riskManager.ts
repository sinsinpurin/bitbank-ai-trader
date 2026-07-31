import { prisma } from "../db/prisma";
import { broadcast } from "../ws/relay";
import { config } from "../config";
import { closePosition } from "./paperTradingEngine";
import { toPositionEvent, toTradeEvent } from "./mappers";
import type { TradeReason } from "@noctas/shared";

// 決済処理が完了するまでの間、同一ポジションを二重に決済しないためのガード
const closingInFlight = new Set<string>();

/**
 * 保有中の全ポジションを現在値で評価し、出口条件に達していれば自動決済する。
 * 優先順: 利確(take_profit) → トレーリングストップ(trailing_stop) → 損切り(stop_loss)。
 * 損切り率はポジションに記録された戦略別設定を優先し、無ければグローバル設定を使う。
 * 利確・トレーリングはポジションに設定がある場合のみ有効。
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

    const stopLossPct = position.stopLossPct ?? config.risk.stopLossPct;
    const takeProfitPct = position.takeProfitPct;
    const trailingStopPct = position.trailingStopPct;

    let reason: TradeReason | null = null;
    if (
      takeProfitPct != null &&
      currentPrice >= position.entryPrice * (1 + takeProfitPct / 100)
    ) {
      reason = "take_profit";
    } else if (
      trailingStopPct != null &&
      currentPrice <= highestPrice * (1 - trailingStopPct / 100)
    ) {
      reason = "trailing_stop";
    } else if (currentPrice <= position.entryPrice * (1 - stopLossPct / 100)) {
      reason = "stop_loss";
    }

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
