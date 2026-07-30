import type { Position as PrismaPosition, Trade as PrismaTrade } from "@prisma/client";
import type {
  ClosedPositionRecord,
  PnlCurvePoint,
  PnlDailyPoint,
  PnlReasonBreakdown,
  PnlStrategyBreakdown,
  PnlSummary,
  Position,
  TradeReason,
} from "@bitbank-ai-trader/shared";
import { prisma } from "../db/prisma";
import { config } from "../config";
import { getCandleHistory } from "../strategy/botEngine";
import { INITIAL_JPY_BALANCE } from "../trading/paperTradingEngine";

const MAX_CLOSED_POSITIONS = 50;

function toPositionDto(row: PrismaPosition): Position {
  return {
    id: row.id,
    pair: row.pair,
    side: row.side as Position["side"],
    entryPrice: row.entryPrice,
    amount: row.amount,
    openedAt: row.openedAt.getTime(),
    closedAt: row.closedAt?.getTime() ?? null,
    closePrice: row.closePrice,
    pnl: row.pnl,
    strategyId: row.strategyId ?? null,
  };
}

/** JST基準の日付キー("YYYY-MM-DD")。decisionLoopのJST日境界と同じ+9h方式 */
function jstDateKey(date: Date): string {
  return new Date(date.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** ポジションを閉じた売り約定のreasonを決済理由として取り出す */
function closeReasonOf(trades: PrismaTrade[]): TradeReason | null {
  const closeTrade = trades.find((t) => t.side === "sell");
  return closeTrade ? (closeTrade.reason as TradeReason) : null;
}

/**
 * GET /api/pnl とPOST /api/pnl/review(AIレビュー)が共有する損益サマリの集計。
 * ダッシュボードのPnLページに表示する数字と、AIレビューに渡す数字を必ず一致させるため
 * ここを唯一の集計元にする。
 */
export async function getPnlSummary(): Promise<PnlSummary> {
  const [closedRows, openRows, balances, feeAgg] = await Promise.all([
    prisma.position.findMany({
      where: { closedAt: { not: null } },
      orderBy: { closedAt: "asc" },
      include: { trades: true },
    }),
    prisma.position.findMany({
      where: { closedAt: null },
      orderBy: { openedAt: "asc" },
    }),
    prisma.virtualBalance.findMany(),
    prisma.trade.aggregate({ _sum: { fee: true } }),
  ]);
  const totalFeesJpy = feeAgg._sum.fee ?? 0;

  // ペアごとの最新価格(1分足終値ベース)
  const currentPrices: Record<string, number> = {};
  for (const pair of config.targetPairs) {
    const candles = getCandleHistory(pair);
    if (candles.length > 0) {
      currentPrices[pair] = candles[candles.length - 1].close;
    }
  }

  // --- 実現損益の集計 ---
  let realizedPnl = 0;
  let winCount = 0;
  let lossCount = 0;
  let grossProfit = 0;
  let grossLoss = 0; // 正の値で保持

  const equityCurve: PnlCurvePoint[] = [];
  const dailyMap = new Map<string, { pnl: number; tradeCount: number }>();
  const reasonMap = new Map<TradeReason, { pnl: number; count: number; winCount: number }>();

  let peak = 0;
  let maxDrawdown = 0;

  for (const row of closedRows) {
    const pnl = row.pnl ?? 0;
    realizedPnl += pnl;

    if (pnl >= 0) {
      winCount += 1;
      grossProfit += pnl;
    } else {
      lossCount += 1;
      grossLoss += -pnl;
    }

    // 累積カーブ(同一秒に複数決済がある場合は最後の値で上書き)
    const time = Math.floor((row.closedAt as Date).getTime() / 1000);
    const last = equityCurve[equityCurve.length - 1];
    if (last && last.time === time) {
      last.value = realizedPnl;
    } else {
      equityCurve.push({ time, value: realizedPnl });
    }

    peak = Math.max(peak, realizedPnl);
    maxDrawdown = Math.max(maxDrawdown, peak - realizedPnl);

    const dateKey = jstDateKey(row.closedAt as Date);
    const daily = dailyMap.get(dateKey) ?? { pnl: 0, tradeCount: 0 };
    daily.pnl += pnl;
    daily.tradeCount += 1;
    dailyMap.set(dateKey, daily);

    const reason = closeReasonOf(row.trades) ?? "ai_decision";
    const byReason = reasonMap.get(reason) ?? { pnl: 0, count: 0, winCount: 0 };
    byReason.pnl += pnl;
    byReason.count += 1;
    if (pnl >= 0) byReason.winCount += 1;
    reasonMap.set(reason, byReason);
  }

  // --- 含み損益・資産評価(ペアごとの最新価格で評価。価格不明のペアは0扱い) ---
  const openPositions = openRows.map(toPositionDto);
  const unrealizedPnl = openPositions.reduce((sum, p) => {
    const price = currentPrices[p.pair];
    return price === undefined ? sum : sum + (price - p.entryPrice) * p.amount;
  }, 0);

  const balanceJpy =
    balances.find((b) => b.currency === "jpy")?.amount ?? INITIAL_JPY_BALANCE;
  const assetBalances = Object.fromEntries(
    balances.filter((b) => b.currency !== "jpy").map((b) => [b.currency, b.amount])
  );
  // JPY残高 + 各暗号資産残高の現在値評価(通貨→ペアは "{currency}_jpy" で引く)
  const equityJpy = balances.reduce((sum, b) => {
    if (b.currency === "jpy") return sum + b.amount;
    const price = currentPrices[`${b.currency}_jpy`];
    return price === undefined ? sum : sum + b.amount * price;
  }, balances.some((b) => b.currency === "jpy") ? 0 : INITIAL_JPY_BALANCE);

  const closedCount = winCount + lossCount;
  const dailyPnl: PnlDailyPoint[] = [...dailyMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, v]) => ({ date, pnl: v.pnl, tradeCount: v.tradeCount }));
  const byReason: PnlReasonBreakdown[] = [...reasonMap.entries()].map(
    ([reason, v]) => ({ reason, ...v })
  );

  // --- 戦略別の実現損益 ---
  const strategyAgg = new Map<
    string | null,
    { pnl: number; count: number; winCount: number; pair: string | null }
  >();
  for (const row of closedRows) {
    const key = row.strategyId ?? null;
    const agg = strategyAgg.get(key) ?? { pnl: 0, count: 0, winCount: 0, pair: row.pair };
    agg.pnl += row.pnl ?? 0;
    agg.count += 1;
    if ((row.pnl ?? 0) >= 0) agg.winCount += 1;
    if (agg.pair !== row.pair) agg.pair = null; // 複数ペアにまたがる場合はnull
    strategyAgg.set(key, agg);
  }

  const strategyIds = [...strategyAgg.keys()].filter((id): id is string => id !== null);
  const strategyRows =
    strategyIds.length > 0
      ? await prisma.strategy.findMany({
          where: { id: { in: strategyIds } },
          select: { id: true, name: true, pair: true, isActive: true },
        })
      : [];
  const strategyById = new Map(strategyRows.map((s) => [s.id, s]));

  const byStrategy: PnlStrategyBreakdown[] = [...strategyAgg.entries()]
    .map(([strategyId, agg]) => {
      const strategy = strategyId ? strategyById.get(strategyId) : undefined;
      return {
        strategyId,
        strategyName:
          strategyId === null
            ? "AI判断・その他"
            : strategy?.name ?? "(削除済み)",
        pair: strategy?.pair ?? agg.pair,
        isActive: strategy?.isActive ?? false,
        closedCount: agg.count,
        winCount: agg.winCount,
        realizedPnl: agg.pnl,
      };
    })
    .sort((a, b) => b.realizedPnl - a.realizedPnl);

  const closedPositions: ClosedPositionRecord[] = closedRows
    .slice(-MAX_CLOSED_POSITIONS)
    .reverse()
    .map((row) => ({
      ...toPositionDto(row),
      closeReason: closeReasonOf(row.trades),
      totalFeeJpy: row.trades.reduce((sum, t) => sum + t.fee, 0),
    }));

  return {
    currentPrices,
    realizedPnl,
    unrealizedPnl,
    totalPnl: realizedPnl + unrealizedPnl,
    winCount,
    lossCount,
    winRate: closedCount > 0 ? winCount / closedCount : null,
    avgWin: winCount > 0 ? grossProfit / winCount : null,
    avgLoss: lossCount > 0 ? -(grossLoss / lossCount) : null,
    profitFactor: grossLoss > 0 ? grossProfit / grossLoss : null,
    maxDrawdown,
    totalFeesJpy,
    balanceJpy,
    assetBalances,
    equityJpy,
    initialBalanceJpy: INITIAL_JPY_BALANCE,
    equityCurve,
    dailyPnl,
    byReason,
    byStrategy,
    openPositions,
    closedPositions,
  };
}
