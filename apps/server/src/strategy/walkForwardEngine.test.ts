import { beforeEach, describe, expect, it, vi } from "vitest";
import type { StrategyGraph, WalkForwardParamGrid } from "@noctas/shared";
import type { CandleBucket } from "./botEngine";

// walkForwardEngine.ts imports backtestEngine.ts, which pulls in strategy/botEngine.ts only for
// getCandlesForTimeframe() (never actually called here since every runBacktest call below always
// passes an explicit candlesOverride). Stub it out so the test doesn't depend on the live candle
// buffer / bitbank REST seeding, matching the pattern in backtestEngine.test.ts.
const getCandlesForTimeframe = vi.fn<(pair: string, timeframe: string) => CandleBucket[]>();
vi.mock("./botEngine", () => ({
  getCandlesForTimeframe: (...args: [string, string]) => getCandlesForTimeframe(...args),
}));

// resolveExitReason / executionPrice / feeOf (pulled in transitively via backtestEngine.ts) still
// import ../db/prisma at module scope; mock it purely to avoid constructing a real PrismaClient.
vi.mock("../db/prisma", () => ({ prisma: {} }));

const { buildWindows, runWalkForwardForStrategy, maxWindowsForBatch, MIN_WINDOWS, MAX_WINDOWS } =
  await import("./walkForwardEngine");

function candle(time: number, close: number, overrides: Partial<CandleBucket> = {}): CandleBucket {
  return {
    time,
    open: overrides.open ?? close,
    high: overrides.high ?? close,
    low: overrides.low ?? close,
    close,
    volume: overrides.volume ?? 0,
  };
}

/**
 * price > 100 で買う(sellノード無し)、価格が上下に振動するとその都度立ち上がりエッジで
 * 買おうとするグラフ。SL/TP/トレーリングだけで手仕舞いするシナリオを組み立てるための専用グラフ
 * (apps/server/src/strategy/backtestEngine.test.ts の buyOnlyOscillatingGraph と同じ形)。
 */
function oscillatingBuyGraph(): StrategyGraph {
  return {
    nodes: [
      { id: "price", type: "price", params: {}, position: { x: 0, y: 0 } },
      { id: "const100", type: "constant", params: { value: 100 }, position: { x: 0, y: 0 } },
      { id: "gt100", type: "compare", params: { op: "gt" }, position: { x: 0, y: 0 } },
      { id: "buy1", type: "buy", params: {}, position: { x: 0, y: 0 } },
    ],
    edges: [
      { id: "e1", source: "price", target: "gt100", targetHandle: "a" },
      { id: "e2", source: "const100", target: "gt100", targetHandle: "b" },
      { id: "e3", source: "gt100", target: "buy1", targetHandle: "condition" },
    ],
  };
}

beforeEach(() => {
  getCandlesForTimeframe.mockReset();
});

describe("buildWindows", () => {
  function seq(length: number): CandleBucket[] {
    return Array.from({ length }, (_, i) => candle(i * 60, i));
  }

  it("tiles non-overlapping out-of-sample windows forward, preceded by a sliding in-sample window", () => {
    // isCandles=100, oosCandles=50 -> exactly 3 possible windows for 250 candles
    const windows = buildWindows(seq(250), 100, 50, 6);
    expect(windows).toHaveLength(3);
    expect(windows[0].is).toHaveLength(100);
    expect(windows[0].oos).toHaveLength(50);
    expect(windows[0].is[0].time).toBe(0);
    expect(windows[0].oos[0].time).toBe(100 * 60);
    expect(windows[1].is[0].time).toBe(50 * 60);
    expect(windows[1].oos[0].time).toBe(150 * 60);
    expect(windows[2].is[0].time).toBe(100 * 60);
    expect(windows[2].oos[0].time).toBe(200 * 60);
    // out-of-sample windows never overlap
    expect(windows[0].oos[windows[0].oos.length - 1].time).toBeLessThan(windows[1].oos[0].time);
    expect(windows[1].oos[windows[1].oos.length - 1].time).toBeLessThan(windows[2].oos[0].time);
  });

  it("keeps only the most recent windows when more fit than maxWindows allows", () => {
    // 5 possible windows (350 candles), but capped to 3 -> should keep windows 2,3,4 (skip=2)
    const windows = buildWindows(seq(350), 100, 50, 3);
    expect(windows).toHaveLength(3);
    expect(windows[0].is[0].time).toBe(100 * 60);
    expect(windows[0].oos[0].time).toBe(200 * 60);
  });

  it("returns an empty array when fewer than MIN_WINDOWS can be built from the data", () => {
    // only 2 possible windows (200 candles) with MIN_WINDOWS=3
    const windows = buildWindows(seq(200), 100, 50, 6);
    expect(windows).toEqual([]);
  });
});

describe("maxWindowsForBatch", () => {
  it("divides MAX_WINDOWS across active strategies, never below MIN_WINDOWS", () => {
    expect(maxWindowsForBatch(1)).toBe(MAX_WINDOWS);
    expect(maxWindowsForBatch(2)).toBe(3);
    expect(maxWindowsForBatch(3)).toBe(MIN_WINDOWS);
    expect(maxWindowsForBatch(6)).toBe(MIN_WINDOWS);
    expect(maxWindowsForBatch(100)).toBe(MIN_WINDOWS);
  });
});

describe("runWalkForwardForStrategy / insufficient data", () => {
  it("returns a zero-filled summary with a warning instead of throwing when too few candles are available", () => {
    const candles = Array.from({ length: 50 }, (_, i) => candle(i * 60, 0));
    const result = runWalkForwardForStrategy(
      oscillatingBuyGraph(),
      "btc_jpy",
      "1min",
      10_000,
      3,
      candles
    );
    expect(result.windowCount).toBe(0);
    expect(result.windows).toEqual([]);
    expect(result.aggregate).toEqual({
      outOfSampleRealizedPnl: 0,
      outOfSampleWinRate: null,
      outOfSampleProfitFactor: null,
      outOfSampleMaxDrawdown: 0,
      outOfSampleTrades: 0,
      consistencyRatio: null,
    });
    expect(result.warnings.some((w) => w.includes("不足"))).toBe(true);
  });
});

describe("runWalkForwardForStrategy / deterministic best-parameter selection and OOS replay", () => {
  // 4本1サイクルのオシレーション: A(close 0, 条件false) -> B(close 150, 買いエッジ発火) ->
  // C(高値155/安値149: SL1%は安全、TP2%は確実に発火) -> D(close 0で条件を戻す。高値/低値は
  // 150に固定し、TP=100%候補でポジションが開きっぱなしでも誤ってSL/TPに触れないようにする)。
  // isCandles=1500・oosCandles=500(いずれも1min時間足の既定クランプ値)はどちらも4の倍数なので、
  // 各ウィンドウの境界は必ずサイクルの先頭(A)に一致し、境界をまたいでも判定が崩れない。
  function cycleCandles(count: number): CandleBucket[] {
    return Array.from({ length: count }, (_, i) => {
      const time = i * 60;
      const phase = i % 4;
      if (phase === 0) return candle(time, 0);
      if (phase === 1) return candle(time, 150);
      if (phase === 2) return candle(time, 155, { high: 155, low: 149 });
      return candle(time, 0, { high: 150, low: 150 });
    });
  }

  const tightGrid: WalkForwardParamGrid = {
    stopLossPct: [1],
    takeProfitPct: [2, 100],
    trailingStopPct: [null],
  };

  it("picks the take-profit parameter that produces enough qualifying in-sample trades, and replays it out-of-sample", () => {
    // isCandles(1500) + oosCandles(500) * MIN_WINDOWS(3) = 3000 candles -> exactly 3 possible windows
    const candles = cycleCandles(3000);
    const result = runWalkForwardForStrategy(
      oscillatingBuyGraph(),
      "btc_jpy",
      "1min",
      10_000,
      5,
      candles,
      3,
      tightGrid
    );

    expect(result.windowCount).toBe(3);
    for (const window of result.windows) {
      // takeProfitPct=100 never closes a trade (never clears +100%, and the SL/TP-safe filler
      // candles never breach stop_loss either), so it can never reach MIN_TRADES_IS -> disqualified.
      // takeProfitPct=2 closes on every cycle, so it's the only qualifying / selected candidate.
      expect(window.bestParams).toEqual({ stopLossPct: 1, takeProfitPct: 2, trailingStopPct: null });
      expect(window.inSample.winCount).toBeGreaterThanOrEqual(3);
      expect(window.inSample.lossCount).toBe(0);
      expect(window.outOfSample.trades.length).toBeGreaterThan(0);
      for (const trade of window.outOfSample.trades) {
        expect(trade.closeReason).toBe("take_profit");
        expect(trade.pnl).toBeGreaterThan(0);
      }
    }

    // in-sample window is 1500 candles = 375 cycles of 4 -> exactly 375 closed trades
    expect(result.windows[0].inSample.winCount).toBe(375);
    // out-of-sample window is 500 candles = 125 cycles of 4 -> exactly 125 closed trades
    expect(result.windows[0].outOfSample.trades).toHaveLength(125);

    expect(result.aggregate.outOfSampleTrades).toBe(125 * 3);
    expect(result.aggregate.outOfSampleWinRate).toBe(1);
    // no losing out-of-sample trades at all -> profitFactor is undefined-by-convention (null), not Infinity
    expect(result.aggregate.outOfSampleProfitFactor).toBeNull();
    expect(result.aggregate.outOfSampleRealizedPnl).toBeGreaterThan(0);
    expect(result.aggregate.consistencyRatio).toBe(1);
  });

  it("falls back to the highest-pnl candidate (with a low-confidence warning) when no candidate reaches MIN_TRADES_IS", () => {
    // A single deliberate buy+take-profit event living inside the in-sample slice the algorithm
    // will actually use, everything else flat at 0 (and, once a position could be open, pinned to
    // a safe 150/150 high/low so a still-open takeProfitPct=100 position never gets closed by
    // accident). isCandles=300/oosCandles=100 come from the "1day" timeframe's clamped minimums.
    const candles: CandleBucket[] = [];
    for (let i = 0; i < 600; i += 1) {
      const time = i * 60;
      if (i === 250) candles.push(candle(time, 150));
      else if (i === 251) candles.push(candle(time, 155, { high: 155, low: 149 }));
      else if (i < 250) candles.push(candle(time, 0));
      else candles.push(candle(time, 0, { high: 150, low: 150 }));
    }

    const result = runWalkForwardForStrategy(
      oscillatingBuyGraph(),
      "btc_jpy",
      "1day",
      10_000,
      5,
      candles,
      1,
      tightGrid
    );

    expect(result.windowCount).toBe(1);
    const window = result.windows[0];
    // only 1 trade total for the winning candidate (takeProfitPct=100 never trades at all), so
    // neither candidate reaches MIN_TRADES_IS=3 -> the fallback path picks by pnl alone.
    expect(window.bestParams).toEqual({ stopLossPct: 1, takeProfitPct: 2, trailingStopPct: null });
    expect(window.inSample.winCount + window.inSample.lossCount).toBe(1);
    expect(result.warnings.some((w) => w.includes("低信頼度"))).toBe(true);
  });
});
