import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Position as PrismaPosition } from "@prisma/client";
import { config } from "../config";

const findMany = vi.fn();
const update = vi.fn();
vi.mock("../db/prisma", () => ({
  prisma: {
    position: {
      findMany: (...args: unknown[]) => findMany(...args),
      update: (...args: unknown[]) => update(...args),
    },
  },
}));

const closePosition = vi.fn();
vi.mock("./paperTradingEngine", () => ({
  closePosition: (...args: unknown[]) => closePosition(...args),
}));

vi.mock("../ws/relay", () => ({ broadcast: vi.fn() }));

const { checkExits, isClosingInFlight, markClosingStart, markClosingDone } = await import(
  "./riskManager"
);

function makePosition(overrides: Partial<PrismaPosition> = {}): PrismaPosition {
  return {
    id: "p1",
    pair: "btc_jpy",
    side: "buy",
    entryPrice: 10_000_000,
    amount: 0.001,
    openedAt: new Date("2026-07-30T09:00:00.000Z"),
    closedAt: null,
    closePrice: null,
    pnl: null,
    strategyId: null,
    stopLossPct: null,
    takeProfitPct: null,
    trailingStopPct: null,
    highestPrice: null,
    entryFee: 12,
    ...overrides,
  };
}

beforeEach(() => {
  findMany.mockReset();
  update.mockReset();
  closePosition.mockReset();
  update.mockResolvedValue(undefined);
  // Real (unmocked) toTradeEvent/toPositionEvent run on whatever closePosition "returns",
  // so this needs fully-shaped fixtures - not just `{ id: ... }` - or those mappers throw.
  closePosition.mockResolvedValue({
    trade: {
      id: "t1",
      pair: "btc_jpy",
      side: "sell",
      price: 10_000_000,
      amount: 0.001,
      reason: "stop_loss",
      executedAt: new Date(),
      strategyId: null,
      fee: 12,
      aiDecisionId: null,
      positionId: "p1",
    },
    position: makePosition({ closedAt: new Date(), closePrice: 10_000_000, pnl: 0 }),
  });
});

describe("checkExits / take profit", () => {
  it("closes with take_profit once price reaches the position's take-profit line", async () => {
    findMany.mockResolvedValue([makePosition({ takeProfitPct: 0.5 })]);
    await checkExits("btc_jpy", 10_050_000); // exactly +0.5%
    expect(closePosition).toHaveBeenCalledTimes(1);
    expect(closePosition.mock.calls[0][2]).toBe("take_profit");
  });

  it("does not close when price is still below the take-profit line", async () => {
    findMany.mockResolvedValue([makePosition({ takeProfitPct: 0.5 })]);
    await checkExits("btc_jpy", 10_049_000);
    expect(closePosition).not.toHaveBeenCalled();
  });

  it("falls back to the global take-profit %% when the position has no override", async () => {
    findMany.mockResolvedValue([makePosition({ takeProfitPct: null })]);
    const belowGlobal = 10_000_000 * (1 + (config.risk.takeProfitPct - 0.5) / 100);
    await checkExits("btc_jpy", belowGlobal);
    expect(closePosition).not.toHaveBeenCalled(); // no upside protection would close here previously

    const triggerPrice = 10_000_000 * (1 + config.risk.takeProfitPct / 100);
    await checkExits("btc_jpy", triggerPrice);
    expect(closePosition).toHaveBeenCalledTimes(1);
    expect(closePosition.mock.calls[0][2]).toBe("take_profit");
  });

  it("uses the position's own take-profit %% when set, instead of the global default", async () => {
    const override = config.risk.takeProfitPct + 10;
    findMany.mockResolvedValue([makePosition({ takeProfitPct: override })]);
    const globalTriggerPrice = 10_000_000 * (1 + config.risk.takeProfitPct / 100);
    await checkExits("btc_jpy", globalTriggerPrice);
    expect(closePosition).not.toHaveBeenCalled(); // global threshold alone must not fire

    const overrideTriggerPrice = 10_000_000 * (1 + override / 100);
    await checkExits("btc_jpy", overrideTriggerPrice);
    expect(closePosition).toHaveBeenCalledTimes(1);
    expect(closePosition.mock.calls[0][2]).toBe("take_profit");
  });

  it("clamps a take-profit %% below the round-trip cost up to that cost", async () => {
    const tooLow = config.fees.roundTripCostPct / 2;
    findMany.mockResolvedValue([makePosition({ takeProfitPct: tooLow })]);
    // the position's own (fee-losing) line is cleared here, but the clamp must hold the exit back
    await checkExits("btc_jpy", 10_000_000 * (1 + tooLow / 100));
    expect(closePosition).not.toHaveBeenCalled();

    const clampedTrigger = 10_000_000 * (1 + config.fees.roundTripCostPct / 100);
    await checkExits("btc_jpy", clampedTrigger);
    expect(closePosition).toHaveBeenCalledTimes(1);
    expect(closePosition.mock.calls[0][2]).toBe("take_profit");
  });

  it("treats takeProfitPct 0 as 'disabled' and never takes profit, however far price rises", async () => {
    findMany.mockResolvedValue([makePosition({ takeProfitPct: 0 })]);
    // 0 must NOT fall back to the global default nor to the round-trip cost floor
    await checkExits("btc_jpy", 10_000_000 * (1 + (config.risk.takeProfitPct + 50) / 100));
    expect(closePosition).not.toHaveBeenCalled();
  });

  it("still honors trailing stop and stop loss when take profit is disabled with 0", async () => {
    findMany.mockResolvedValue([
      makePosition({ takeProfitPct: 0, trailingStopPct: 0.3, highestPrice: 10_200_000 }),
    ]);
    await checkExits("btc_jpy", 10_200_000 * (1 - 0.3 / 100));
    expect(closePosition.mock.calls[0][2]).toBe("trailing_stop");

    closePosition.mockClear();
    findMany.mockResolvedValue([makePosition({ takeProfitPct: 0, stopLossPct: 3 })]);
    await checkExits("btc_jpy", 10_000_000 * (1 - 3 / 100));
    expect(closePosition.mock.calls[0][2]).toBe("stop_loss");
  });
});

describe("checkExits / trailing stop", () => {
  it("closes with trailing_stop once price pulls back from the recorded peak by the trailing %", async () => {
    // peak already reached 10,200,000; a 0.3% pullback from there is the trigger
    findMany.mockResolvedValue([makePosition({ trailingStopPct: 0.3, highestPrice: 10_200_000 })]);
    const triggerPrice = 10_200_000 * (1 - 0.3 / 100);
    await checkExits("btc_jpy", triggerPrice);
    expect(closePosition).toHaveBeenCalledTimes(1);
    expect(closePosition.mock.calls[0][2]).toBe("trailing_stop");
  });

  it("updates the recorded highest price when the current tick is a new high", async () => {
    findMany.mockResolvedValue([makePosition({ trailingStopPct: 0.3, highestPrice: 10_000_000 })]);
    await checkExits("btc_jpy", 10_100_000); // new high, well above any exit threshold
    expect(update).toHaveBeenCalledWith({
      where: { id: "p1" },
      data: { highestPrice: 10_100_000 },
    });
    expect(closePosition).not.toHaveBeenCalled();
  });

  it("does not rewrite the highest price when the current tick is not a new high", async () => {
    findMany.mockResolvedValue([makePosition({ trailingStopPct: 0.3, highestPrice: 10_000_000 })]);
    await checkExits("btc_jpy", 9_999_000);
    expect(update).not.toHaveBeenCalled();
  });

  it("take_profit wins over trailing_stop when both conditions are met on the same tick", async () => {
    findMany.mockResolvedValue([
      makePosition({ takeProfitPct: 0.5, trailingStopPct: 5, highestPrice: 10_000_000 }),
    ]);
    // +0.5% clears take-profit; it's nowhere near a 5% trailing pullback, so this also
    // isolates that take_profit is checked (and wins) before trailing is even considered
    await checkExits("btc_jpy", 10_050_000);
    expect(closePosition.mock.calls[0][2]).toBe("take_profit");
  });
});

describe("checkExits / stop loss", () => {
  it("falls back to the global stop-loss %% when the position has no override", async () => {
    findMany.mockResolvedValue([makePosition({ stopLossPct: null })]);
    const triggerPrice = 10_000_000 * (1 - config.risk.stopLossPct / 100);
    await checkExits("btc_jpy", triggerPrice);
    expect(closePosition).toHaveBeenCalledTimes(1);
    expect(closePosition.mock.calls[0][2]).toBe("stop_loss");
  });

  it("uses the position's own stop-loss %% when set, instead of the global default", async () => {
    // pick an override far from the global default so this only passes if the override is honored
    const override = config.risk.stopLossPct + 10;
    findMany.mockResolvedValue([makePosition({ stopLossPct: override })]);
    const globalTriggerPrice = 10_000_000 * (1 - config.risk.stopLossPct / 100);
    await checkExits("btc_jpy", globalTriggerPrice);
    expect(closePosition).not.toHaveBeenCalled(); // global threshold alone must not fire

    const overrideTriggerPrice = 10_000_000 * (1 - override / 100);
    await checkExits("btc_jpy", overrideTriggerPrice);
    expect(closePosition).toHaveBeenCalledTimes(1);
    expect(closePosition.mock.calls[0][2]).toBe("stop_loss");
  });

  it("trailing_stop wins over stop_loss when both would otherwise trigger", async () => {
    findMany.mockResolvedValue([
      makePosition({ trailingStopPct: 0.2, highestPrice: 10_000_000, stopLossPct: 50 }),
    ]);
    // -0.2% from the peak trips the trailing stop; a 50% stop-loss would never trip here,
    // so this mainly proves trailing_stop is still checked (and reported) ahead of stop_loss
    const triggerPrice = 10_000_000 * (1 - 0.2 / 100);
    await checkExits("btc_jpy", triggerPrice);
    expect(closePosition.mock.calls[0][2]).toBe("trailing_stop");
  });
});

describe("checkExits / no exit conditions met", () => {
  it("does not close a position comfortably within all thresholds", async () => {
    findMany.mockResolvedValue([
      makePosition({ takeProfitPct: 5, trailingStopPct: 5, highestPrice: 10_000_000, stopLossPct: 5 }),
    ]);
    await checkExits("btc_jpy", 10_010_000); // +0.1%, inside every band
    expect(closePosition).not.toHaveBeenCalled();
  });
});

describe("checkExits / multiple positions", () => {
  it("only closes the positions whose own conditions are met", async () => {
    findMany.mockResolvedValue([
      makePosition({ id: "safe", takeProfitPct: 5 }),
      makePosition({ id: "hit", takeProfitPct: 0.5 }),
    ]);
    await checkExits("btc_jpy", 10_050_000); // +0.5%: only "hit" clears its take-profit
    expect(closePosition).toHaveBeenCalledTimes(1);
    expect(closePosition.mock.calls[0][0].id).toBe("hit");
  });
});

describe("checkExits / concurrency guard skips a position already marked as closing", () => {
  it("does not attempt to close a position mid-close, even if its exit condition is met", async () => {
    findMany.mockResolvedValue([makePosition({ id: "in-flight-guard-test", takeProfitPct: 0.5 })]);
    markClosingStart("in-flight-guard-test");
    try {
      await checkExits("btc_jpy", 10_050_000); // would otherwise clear take-profit
      expect(closePosition).not.toHaveBeenCalled();
    } finally {
      markClosingDone("in-flight-guard-test");
    }
  });
});

describe("isClosingInFlight / markClosingStart / markClosingDone", () => {
  it("exposes the same in-flight guard that checkExits uses internally, for manual-close routes to share", () => {
    const id = "guard-fn-test";
    expect(isClosingInFlight(id)).toBe(false);
    markClosingStart(id);
    expect(isClosingInFlight(id)).toBe(true);
    markClosingDone(id);
    expect(isClosingInFlight(id)).toBe(false);
  });
});
