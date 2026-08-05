import { prisma } from "../db/prisma";
import { fetchHistoricalCandles, type CandleBucket } from "./botEngine";

const RETENTION_DAYS = 90;
const REFRESH_DAYS = 2;

function cutoffSeconds(days: number): number {
  return Math.floor(Date.now() / 1000) - days * 24 * 60 * 60;
}

/** Sync the rolling raw 1-minute snapshot used by the 3-month simulation. */
export async function syncHistoricalCandles(pair: string): Promise<{ fetched: number; stored: number }> {
  const cutoff = cutoffSeconds(RETENTION_DAYS);
  const [oldest, latest] = await Promise.all([
    prisma.historicalCandle.findFirst({ where: { pair }, orderBy: { time: "asc" }, select: { time: true } }),
    prisma.historicalCandle.findFirst({ where: { pair }, orderBy: { time: "desc" }, select: { time: true } }),
  ]);

  // A first sync (or an incomplete snapshot) fills the full window. Once the
  // window exists, only the last two days are fetched to repair gaps and add
  // new candles without repeatedly downloading 90 days.
  const daysToFetch = !latest || !oldest || oldest.time > cutoff + 24 * 60 * 60 ? RETENTION_DAYS : REFRESH_DAYS;
  const candles = await fetchHistoricalCandles(pair, daysToFetch);
  if (candles.length > 0) {
    // Replace the fetched range so SQLite does not need skipDuplicates
    // semantics (which are not available for this datasource).
    await prisma.historicalCandle.deleteMany({ where: { pair, time: { gte: candles[0].time } } });
    for (let start = 0; start < candles.length; start += 500) {
      const batch = candles.slice(start, start + 500);
      await prisma.historicalCandle.createMany({
        data: batch.map((candle) => ({
          pair,
          time: candle.time,
          open: candle.open,
          high: candle.high,
          low: candle.low,
          close: candle.close,
          volume: candle.volume,
        })),
      });
    }
    await prisma.historicalCandle.deleteMany({ where: { pair, time: { lt: cutoff } } });
  }

  const stored = await prisma.historicalCandle.count({ where: { pair, time: { gte: cutoff } } });
  return { fetched: candles.length, stored };
}

/** Read the retained snapshot without making a network request. */
export async function getHistoricalCandles(pair: string, days = RETENTION_DAYS): Promise<CandleBucket[]> {
  const rows = await prisma.historicalCandle.findMany({
    where: { pair, time: { gte: cutoffSeconds(days) } },
    orderBy: { time: "asc" },
  });
  return rows.map((row) => ({
    time: row.time,
    open: row.open,
    high: row.high,
    low: row.low,
    close: row.close,
    volume: row.volume,
  }));
}

export { RETENTION_DAYS };
