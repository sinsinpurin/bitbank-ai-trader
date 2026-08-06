import { beforeEach, describe, expect, it, vi } from "vitest";

const findFirst = vi.fn();
const deleteMany = vi.fn();
const createMany = vi.fn();
const count = vi.fn();
const fetchHistoricalCandles = vi.fn();

vi.mock("../db/prisma", () => ({
  prisma: {
    historicalCandle: {
      findFirst: (...args: unknown[]) => findFirst(...args),
      deleteMany: (...args: unknown[]) => deleteMany(...args),
      createMany: (...args: unknown[]) => createMany(...args),
      count: (...args: unknown[]) => count(...args),
    },
  },
}));

vi.mock("./botEngine", () => ({
  fetchHistoricalCandles: (...args: unknown[]) => fetchHistoricalCandles(...args),
}));

const { syncHistoricalCandles } = await import("./historicalCandleStore");

function makeCandle(time: number) {
  return { time, open: 1, high: 1, low: 1, close: 1, volume: 1 };
}

beforeEach(() => {
  findFirst.mockReset();
  deleteMany.mockReset().mockResolvedValue(undefined);
  createMany.mockReset().mockResolvedValue(undefined);
  count.mockReset().mockResolvedValue(0);
  fetchHistoricalCandles.mockReset();
  // an existing snapshot, so the refresh path (not the full 90-day resync) is used
  findFirst.mockImplementation(({ orderBy }: { orderBy: { time: "asc" | "desc" } }) =>
    Promise.resolve({ time: orderBy.time === "asc" ? 0 : 1_000_000 })
  );
});

describe("syncHistoricalCandles", () => {
  it("replaces the fetched range when every requested day comes back", async () => {
    const candles = [makeCandle(100), makeCandle(200)];
    fetchHistoricalCandles.mockResolvedValue({ candles, complete: true });

    await syncHistoricalCandles("btc_jpy");

    expect(deleteMany).toHaveBeenCalledWith({
      where: { pair: "btc_jpy", time: { gte: 100 } },
    });
    expect(createMany).toHaveBeenCalled();
  });

  it("does not touch the DB when a day silently failed to fetch (partial result)", async () => {
    // e.g. today's request failed transiently: only yesterday's candles came back
    const candles = [makeCandle(100)];
    fetchHistoricalCandles.mockResolvedValue({ candles, complete: false });

    await syncHistoricalCandles("btc_jpy");

    expect(deleteMany).not.toHaveBeenCalled();
    expect(createMany).not.toHaveBeenCalled();
  });
});
