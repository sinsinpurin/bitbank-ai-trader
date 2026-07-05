import type { FastifyInstance } from "fastify";
import type { Position as PrismaPosition, Trade as PrismaTrade } from "@prisma/client";
import type {
  ClosedPositionRecord,
  PnlCurvePoint,
  PnlDailyPoint,
  PnlReasonBreakdown,
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

export async function pnlRoutes(app: FastifyInstance) {
  app.get("/api/pnl", async (): Promise<PnlSummary> => {
    const [closedRows, openRows, balances] = await Promise.all([
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
    ]);

    const candles = getCandleHistory();
    const currentPrice = candles.length > 0 ? candles[candles.length - 1].close : null;

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

    // --- 含み損益・資産評価 ---
    const openPositions = openRows.map(toPositionDto);
    const unrealizedPnl =
      currentPrice === null
        ? 0
        : openPositions.reduce((sum, p) => sum + (currentPrice - p.entryPrice) * p.amount, 0);

    const balanceJpy =
      balances.find((b) => b.currency === "jpy")?.amount ?? INITIAL_JPY_BALANCE;
    const balanceBtc = balances.find((b) => b.currency === "btc")?.amount ?? 0;
    const equityJpy = balanceJpy + (currentPrice === null ? 0 : balanceBtc * currentPrice);

    const closedCount = winCount + lossCount;
    const dailyPnl: PnlDailyPoint[] = [...dailyMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, v]) => ({ date, pnl: v.pnl, tradeCount: v.tradeCount }));
    const byReason: PnlReasonBreakdown[] = [...reasonMap.entries()].map(
      ([reason, v]) => ({ reason, ...v })
    );

    const closedPositions: ClosedPositionRecord[] = closedRows
      .slice(-MAX_CLOSED_POSITIONS)
      .reverse()
      .map((row) => ({ ...toPositionDto(row), closeReason: closeReasonOf(row.trades) }));

    return {
      pair: config.targetPair,
      currentPrice,
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
      balanceJpy,
      balanceBtc,
      equityJpy,
      initialBalanceJpy: INITIAL_JPY_BALANCE,
      equityCurve,
      dailyPnl,
      byReason,
      openPositions,
      closedPositions,
    };
  });
}
