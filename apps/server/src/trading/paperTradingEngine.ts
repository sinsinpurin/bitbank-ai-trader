import { randomUUID } from "node:crypto";
import { prisma } from "../db/prisma";
import { config } from "../config";
import type { Position } from "@prisma/client";
import type { TradeReason } from "@noctas/shared";
import { isBuyHalted, onPositionClosed } from "./circuitBreaker";

export const INITIAL_JPY_BALANCE = 1_000_000;

/** ペアから資産通貨(base currency)を導出する。例: "eth_jpy" → "eth" */
export function assetCurrencyOf(pair: string): string {
  return pair.split("_")[0];
}

/**
 * 成行想定の約定価格(スリッページ反映)。買いは不利に高く、売りは不利に安く約定する。
 * 実運用との乖離を減らすためのシミュレーションで、TRADE_SLIPPAGE_PCT で調整できる。
 * strategy/backtestEngine.ts からも同じ計算式で再利用する(重複実装しない)。
 */
export function executionPrice(marketPrice: number, side: "buy" | "sell"): number {
  const slip = config.fees.slippagePct / 100;
  return side === "buy" ? marketPrice * (1 + slip) : marketPrice * (1 - slip);
}

/**
 * 約定金額に対する手数料(円)。bitbank現物taker 0.12% 相当(TRADE_FEE_PCT)。
 * strategy/backtestEngine.ts からも同じ計算式で再利用する(重複実装しない)。
 */
export function feeOf(notionalJpy: number): number {
  return notionalJpy * (config.fees.takerFeePct / 100);
}

/**
 * ペーパートレードの状態(約定履歴・ポジション・仮想残高・Botシグナル履歴)を全て消去し、
 * 初期残高(JPY)から再開できる状態に戻す。戦略定義・AI利用ログ・アプリ設定は対象外。
 * 呼び出し元(設定ルート)でconfig.tradingModeが"paper"であることを確認すること。
 */
export async function resetPaperTrading() {
  const currencies = new Set(config.targetPairs.map(assetCurrencyOf));
  await prisma.$transaction([
    prisma.trade.deleteMany({}),
    prisma.position.deleteMany({}),
    prisma.botSignalLog.deleteMany({}),
    prisma.virtualBalance.deleteMany({}),
    prisma.virtualBalance.createMany({
      data: [
        { currency: "jpy", amount: INITIAL_JPY_BALANCE },
        ...[...currencies].map((currency) => ({ currency, amount: 0 })),
      ],
    }),
  ]);
}

async function ensureInitialBalance(pair: string) {
  await prisma.virtualBalance.upsert({
    where: { currency: "jpy" },
    update: {},
    create: { currency: "jpy", amount: INITIAL_JPY_BALANCE },
  });
  await prisma.virtualBalance.upsert({
    where: { currency: assetCurrencyOf(pair) },
    update: {},
    create: { currency: assetCurrencyOf(pair), amount: 0 },
  });
}

/** 建玉・決済時に指定できるオプション(Bot戦略のリスク設定など) */
export interface OpenPositionOptions {
  aiDecisionLogId?: string;
  /** 発注元のBot戦略ID */
  strategyId?: string;
  /** 1回の投入額(円)。未指定はconfig.risk.maxPositionJpy */
  sizeJpy?: number | null;
  /** この戦略の最大同時ポジション数。未指定はconfig.risk.maxOpenPositions(ペア全体) */
  maxOpenPositions?: number | null;
  /** 出口条件のスナップショット(nullはグローバル設定にフォールバック) */
  stopLossPct?: number | null;
  takeProfitPct?: number | null;
  trailingStopPct?: number | null;
}

/**
 * 未決済ポジションを現在値で成行決済する。AIの売り判断・自動決済(損切り/利確/トレーリング)・
 * Bot戦略の売りシグナルから呼ばれる共通処理。
 */
export async function closePosition(
  position: Position,
  currentPrice: number,
  reason: TradeReason,
  aiDecisionLogId?: string,
  closedByStrategyId?: string
) {
  // スリッページ込みの約定価格で受渡し、手数料を差し引く。
  // pnlは建玉手数料+決済手数料を控除したネット値(戦略評価を実運用に近づけるため)
  const execPrice = executionPrice(currentPrice, "sell");
  const proceeds = execPrice * position.amount;
  const exitFee = feeOf(proceeds);
  const pnl =
    (execPrice - position.entryPrice) * position.amount - position.entryFee - exitFee;

  const [, , trade] = await prisma.$transaction([
    prisma.virtualBalance.update({
      where: { currency: "jpy" },
      data: { amount: { increment: proceeds - exitFee } },
    }),
    prisma.virtualBalance.update({
      where: { currency: assetCurrencyOf(position.pair) },
      data: { amount: { decrement: position.amount } },
    }),
    prisma.trade.create({
      data: {
        pair: position.pair,
        side: "sell",
        price: execPrice,
        amount: position.amount,
        reason,
        fee: exitFee,
        aiDecisionId: aiDecisionLogId,
        positionId: position.id,
        strategyId: closedByStrategyId ?? position.strategyId,
      },
    }),
  ]);

  const updatedPosition = await prisma.position.update({
    where: { id: position.id },
    data: { closedAt: new Date(), closePrice: execPrice, pnl },
  });

  // サーキットブレーカー(日次損失・戦略連敗)の判定
  await onPositionClosed(updatedPosition).catch((err) =>
    console.error("[paperTradingEngine] サーキットブレーカー判定に失敗しました", err)
  );

  return { trade, position: updatedPosition };
}

/**
 * 未決済の最古ポジションを現在値で成行決済する。
 * strategyIdを指定するとその戦略が建てたポジションのみが対象になる(Bot戦略の売りシグナル)。
 * ポジションが無い場合は何もしない。
 */
export async function closeOldestPosition(
  pair: string,
  currentPrice: number,
  reason: TradeReason,
  options: { aiDecisionLogId?: string; strategyId?: string } = {}
) {
  const openPosition = await prisma.position.findFirst({
    where: {
      pair,
      side: "buy",
      closedAt: null,
      ...(options.strategyId ? { strategyId: options.strategyId } : {}),
    },
    orderBy: { openedAt: "asc" },
  });

  if (!openPosition) {
    return { trade: null, position: null };
  }

  return closePosition(openPosition, currentPrice, reason, options.aiDecisionLogId, options.strategyId);
}

/**
 * 新規の買いポジションを建てる。
 * リスク管理(ポジションサイズ・最大同時保有数・残高・サーキットブレーカー)の制約に
 * 掛かった場合は何もせず null を返す。
 */
export async function openBuyPosition(
  pair: string,
  currentPrice: number,
  reason: TradeReason,
  options: OpenPositionOptions = {}
) {
  // サーキットブレーカー発動中は新規買いを止める(決済は止めない)
  if (isBuyHalted()) {
    return { trade: null, position: null };
  }

  await ensureInitialBalance(pair);

  // 戦略ごとの上限が指定されていればその戦略のポジション数、無ければペア全体で数える
  const openPositionCount = await prisma.position.count({
    where: {
      pair,
      side: "buy",
      closedAt: null,
      ...(options.strategyId && options.maxOpenPositions != null
        ? { strategyId: options.strategyId }
        : {}),
    },
  });
  const maxOpenPositions = options.maxOpenPositions ?? config.risk.maxOpenPositions;

  if (openPositionCount >= maxOpenPositions) {
    return { trade: null, position: null };
  }

  // スリッページ込みの約定価格で建玉し、手数料は現金から追加で差し引く
  const execPrice = executionPrice(currentPrice, "buy");
  // 戦略ごとの投入額はAPI側(strategy/routes.ts)でAI_MAX_POSITION_JPY以下に検証済みだが、
  // 環境変数側の上限が後から引き下げられた場合などに備え、実行時にも念のため上限でクランプする
  const sizeJpy = Math.min(options.sizeJpy ?? config.risk.maxPositionJpy, config.risk.maxPositionJpy);
  const amount = sizeJpy / execPrice;
  const cost = execPrice * amount;
  const entryFee = feeOf(cost);

  const jpyBalance = await prisma.virtualBalance.findUniqueOrThrow({
    where: { currency: "jpy" },
  });

  if (jpyBalance.amount < cost + entryFee) {
    return { trade: null, position: null };
  }

  // position.create/trade.createを同一トランザクション内の配列として並べているため、
  // 片方の結果(自動生成id)をもう片方のdataから参照できない。決済側のTradeは既存の
  // position.idにpositionIdを設定できているのに対し、ここではその参照ができず、
  // 建玉側のTradeがpositionに紐付かなくなる不具合があったため、idを先に採番して両方に渡す。
  const positionId = randomUUID();

  const [, , position, trade] = await prisma.$transaction([
    prisma.virtualBalance.update({
      where: { currency: "jpy" },
      data: { amount: { decrement: cost + entryFee } },
    }),
    prisma.virtualBalance.update({
      where: { currency: assetCurrencyOf(pair) },
      data: { amount: { increment: amount } },
    }),
    prisma.position.create({
      data: {
        id: positionId,
        pair,
        side: "buy",
        entryPrice: execPrice,
        amount,
        strategyId: options.strategyId,
        stopLossPct: options.stopLossPct,
        takeProfitPct: options.takeProfitPct,
        trailingStopPct: options.trailingStopPct,
        highestPrice: execPrice,
        entryFee,
      },
    }),
    prisma.trade.create({
      data: {
        pair,
        side: "buy",
        price: execPrice,
        amount,
        reason,
        fee: entryFee,
        aiDecisionId: options.aiDecisionLogId,
        strategyId: options.strategyId,
        positionId,
      },
    }),
  ]);

  return { trade, position };
}
