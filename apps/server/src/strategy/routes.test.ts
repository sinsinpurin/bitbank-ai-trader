import Fastify from "fastify";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { config } from "../config";
import type { CandleBucket } from "./botEngine";
import { strategyRoutes, validateRiskSettings } from "./routes";

// /api/strategies/backtest (period: "three_months") pulls in several other domain modules purely
// through routes.ts's top-level imports; none of them are exercised by this route, so they're
// mocked with minimal stubs (matches the "prisma: {}" pattern in backtestEngine.test.ts) purely to
// avoid constructing a real PrismaClient / calling live AI or WebSocket code during the test run.
vi.mock("../db/prisma", () => ({ prisma: {} }));
vi.mock("../ws/relay", () => ({ broadcast: vi.fn() }));
vi.mock("../ai/strategyGenerator", () => ({ generateStrategyFromPrompt: vi.fn() }));
vi.mock("../ai/anthropicClient", () => ({ getAnthropicApiKey: vi.fn(() => "test-key") }));

const aggregateCandles = vi.fn<(source: CandleBucket[], minutes: number) => CandleBucket[]>();
const reloadActiveStrategies = vi.fn();
vi.mock("./botEngine", () => ({
  aggregateCandles: (...args: [CandleBucket[], number]) => aggregateCandles(...args),
  reloadActiveStrategies: (...args: []) => reloadActiveStrategies(...args),
}));

const getHistoricalCandles = vi.fn<(pair: string) => Promise<CandleBucket[]>>();
vi.mock("./historicalCandleStore", () => ({
  getHistoricalCandles: (...args: [string]) => getHistoricalCandles(...args),
}));

// runBacktest itself is stubbed out (its own O(n²) behavior/correctness is covered by
// backtestEngine.test.ts); THREE_MONTH_BACKTEST_MAX_CANDLES is imported for real from the actual
// module so the test asserts against the same threshold routes.ts enforces, not a duplicated copy.
const runBacktest = vi.fn();
vi.mock("./backtestEngine", async () => {
  const actual = await vi.importActual<typeof import("./backtestEngine")>("./backtestEngine");
  return {
    ...actual,
    runBacktest: (...args: unknown[]) => runBacktest(...args),
  };
});
const { THREE_MONTH_BACKTEST_MAX_CANDLES } = await import("./backtestEngine");

function candle(time: number): CandleBucket {
  return { time, open: 100, high: 100, low: 100, close: 100, volume: 0 };
}

function candles(count: number): CandleBucket[] {
  return Array.from({ length: count }, (_, i) => candle(i * 60));
}

async function buildApp() {
  const app = Fastify();
  await app.register(strategyRoutes);
  return app;
}

function basicGraph() {
  return {
    nodes: [{ id: "buy1", type: "buy", params: {}, position: { x: 0, y: 0 } }],
    edges: [],
  };
}

describe("validateRiskSettings / positionSizeJpy cap", () => {
  it("accepts a positionSizeJpy at or below the AI_MAX_POSITION_JPY cap", () => {
    expect(validateRiskSettings({ positionSizeJpy: config.risk.maxPositionJpy })).toBeNull();
    expect(validateRiskSettings({ positionSizeJpy: 1 })).toBeNull();
  });

  it("rejects a positionSizeJpy above the AI_MAX_POSITION_JPY cap", () => {
    const error = validateRiskSettings({ positionSizeJpy: config.risk.maxPositionJpy + 1 });
    expect(error).not.toBeNull();
    expect(error).toContain("positionSizeJpy");
  });

  it("does not enforce the cap when positionSizeJpy is unset (falls back to global default)", () => {
    expect(validateRiskSettings({})).toBeNull();
    expect(validateRiskSettings({ positionSizeJpy: null })).toBeNull();
  });

  it("still rejects a non-positive positionSizeJpy regardless of the cap", () => {
    expect(validateRiskSettings({ positionSizeJpy: 0 })).not.toBeNull();
    expect(validateRiskSettings({ positionSizeJpy: -100 })).not.toBeNull();
  });
});

describe("validateRiskSettings / takeProfitPct round-trip cost floor", () => {
  it("accepts a takeProfitPct at or above the round-trip cost", () => {
    expect(validateRiskSettings({ takeProfitPct: config.fees.roundTripCostPct })).toBeNull();
    expect(validateRiskSettings({ takeProfitPct: config.fees.roundTripCostPct + 1 })).toBeNull();
  });

  it("rejects a takeProfitPct below the round-trip cost", () => {
    const error = validateRiskSettings({ takeProfitPct: config.fees.roundTripCostPct / 2 });
    expect(error).not.toBeNull();
    expect(error).toContain("利確%");
  });

  it("does not enforce the floor when takeProfitPct is unset (falls back to global default)", () => {
    expect(validateRiskSettings({ takeProfitPct: null })).toBeNull();
  });

  it("accepts 0 as an explicit 'no take profit' setting, but still rejects negatives", () => {
    expect(validateRiskSettings({ takeProfitPct: 0 })).toBeNull();
    expect(validateRiskSettings({ takeProfitPct: -1 })).not.toBeNull();
  });
});

describe("validateRiskSettings / other fields unaffected", () => {
  it("still validates maxOpenPositions independently of the positionSizeJpy cap", () => {
    expect(validateRiskSettings({ maxOpenPositions: 0 })).not.toBeNull();
    expect(validateRiskSettings({ maxOpenPositions: 1.5 })).not.toBeNull();
    expect(validateRiskSettings({ maxOpenPositions: 3 })).toBeNull();
  });
});

describe("POST /api/strategies/backtest (period: three_months) / candle count guard", () => {
  beforeEach(() => {
    aggregateCandles.mockReset();
    reloadActiveStrategies.mockReset();
    getHistoricalCandles.mockReset();
    runBacktest.mockReset();
    getHistoricalCandles.mockResolvedValue([]);
  });

  it("rejects with 400 and never calls runBacktest when the aggregated candle count exceeds the threshold (e.g. 1min)", async () => {
    aggregateCandles.mockReturnValue(candles(THREE_MONTH_BACKTEST_MAX_CANDLES + 1));
    const app = await buildApp();

    const res = await app.inject({
      method: "POST",
      url: "/api/strategies/backtest",
      payload: { graph: basicGraph(), pair: config.targetPair, timeframe: "1min", period: "three_months" },
    });

    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.error).toContain("時間足");
    expect(runBacktest).not.toHaveBeenCalled();
    await app.close();
  });

  it("runs the backtest and returns 200 when the aggregated candle count is at or below the threshold (e.g. 5min)", async () => {
    aggregateCandles.mockReturnValue(candles(100));
    runBacktest.mockReturnValue({
      candleCount: 100,
      warnings: [],
      realizedPnl: 0,
      winCount: 0,
      lossCount: 0,
      winRate: null,
      avgWin: null,
      avgLoss: null,
      profitFactor: null,
      maxDrawdown: 0,
      totalFeesJpy: 0,
      grossPnlJpy: 0,
      feeLossCount: 0,
      equityCurve: [],
      trades: [],
      period: "three_months",
    });
    const app = await buildApp();

    const res = await app.inject({
      method: "POST",
      url: "/api/strategies/backtest",
      payload: { graph: basicGraph(), pair: config.targetPair, timeframe: "5min", period: "three_months" },
    });

    expect(res.statusCode).toBe(200);
    expect(runBacktest).toHaveBeenCalledTimes(1);
    await app.close();
  });

  it("returns 503 (snapshot not ready) when there are fewer than 2 aggregated candles, without calling runBacktest", async () => {
    aggregateCandles.mockReturnValue(candles(1));
    const app = await buildApp();

    const res = await app.inject({
      method: "POST",
      url: "/api/strategies/backtest",
      payload: { graph: basicGraph(), pair: config.targetPair, timeframe: "5min", period: "three_months" },
    });

    expect(res.statusCode).toBe(503);
    expect(runBacktest).not.toHaveBeenCalled();
    await app.close();
  });
});
