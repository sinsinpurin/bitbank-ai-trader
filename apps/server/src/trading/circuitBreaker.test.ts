import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Position as PrismaPosition, Strategy as PrismaStrategy } from "@prisma/client";

// circuitBreaker.ts keeps its halt/settings state in module-scope variables (mirroring how
// it runs as a singleton in the real server), so every test resets that state via the public
// API in beforeEach rather than relying on test execution order.

const upsert = vi.fn();
const positionAggregate = vi.fn();
const positionFindMany = vi.fn();
const strategyFindUnique = vi.fn();
const strategyUpdate = vi.fn();

vi.mock("../db/prisma", () => ({
  prisma: {
    appSetting: { upsert: (...args: unknown[]) => upsert(...args) },
    position: {
      aggregate: (...args: unknown[]) => positionAggregate(...args),
      findMany: (...args: unknown[]) => positionFindMany(...args),
    },
    strategy: {
      findUnique: (...args: unknown[]) => strategyFindUnique(...args),
      update: (...args: unknown[]) => strategyUpdate(...args),
    },
  },
}));

const {
  getCircuitBreakerStatus,
  isBuyHalted,
  onPositionClosed,
  resumeTrading,
  updateCircuitBreakerSettings,
} = await import("./circuitBreaker");

function makePosition(overrides: Partial<PrismaPosition> = {}): PrismaPosition {
  return {
    id: "pos1",
    pair: "btc_jpy",
    side: "buy",
    entryPrice: 10_000_000,
    amount: 0.001,
    openedAt: new Date(),
    closedAt: new Date(),
    closePrice: 9_900_000,
    pnl: -100,
    strategyId: null,
    stopLossPct: null,
    takeProfitPct: null,
    trailingStopPct: null,
    highestPrice: null,
    entryFee: 12,
    ...overrides,
  };
}

beforeEach(async () => {
  upsert.mockReset().mockResolvedValue(undefined);
  positionAggregate.mockReset().mockResolvedValue({ _sum: { pnl: 0 } });
  positionFindMany.mockReset().mockResolvedValue([]);
  strategyFindUnique.mockReset();
  strategyUpdate.mockReset().mockResolvedValue(undefined);
  // known-good baseline before every test: enabled, generous thresholds, not halted
  await updateCircuitBreakerSettings({ enabled: true, dailyMaxLossJpy: 1_000_000, maxConsecutiveLosses: 5 });
  await resumeTrading();
});

describe("daily max loss", () => {
  it("halts new buys once today's realized loss reaches the configured limit", async () => {
    await updateCircuitBreakerSettings({ dailyMaxLossJpy: 1 });
    positionAggregate.mockResolvedValue({ _sum: { pnl: -100 } });

    expect(isBuyHalted()).toBe(false);
    await onPositionClosed(makePosition({ pnl: -100 }));

    expect(isBuyHalted()).toBe(true);
    expect(getCircuitBreakerStatus().reason).toContain("実現損失");
  });

  it("does not halt while today's realized loss is still within the limit", async () => {
    await updateCircuitBreakerSettings({ dailyMaxLossJpy: 1_000 });
    positionAggregate.mockResolvedValue({ _sum: { pnl: -100 } });

    await onPositionClosed(makePosition({ pnl: -100 }));
    expect(isBuyHalted()).toBe(false);
  });

  it("resumeTrading manually clears an active halt", async () => {
    await updateCircuitBreakerSettings({ dailyMaxLossJpy: 1 });
    positionAggregate.mockResolvedValue({ _sum: { pnl: -100 } });
    await onPositionClosed(makePosition({ pnl: -100 }));
    expect(isBuyHalted()).toBe(true);

    await resumeTrading();
    expect(isBuyHalted()).toBe(false);
    expect(getCircuitBreakerStatus().halted).toBe(false);
  });

  it("does nothing at all when the circuit breaker is disabled", async () => {
    await updateCircuitBreakerSettings({ enabled: false, dailyMaxLossJpy: 1 });
    positionAggregate.mockResolvedValue({ _sum: { pnl: -1_000_000 } });

    await onPositionClosed(makePosition({ pnl: -1_000_000 }));
    expect(isBuyHalted()).toBe(false);
    expect(positionAggregate).not.toHaveBeenCalled();
  });
});

describe("consecutive-loss auto-standby", () => {
  it("sets a strategy to standby after it loses maxConsecutiveLosses times in a row", async () => {
    await updateCircuitBreakerSettings({ maxConsecutiveLosses: 2 });
    positionFindMany.mockResolvedValue([{ pnl: -10 }, { pnl: -10 }]);
    strategyFindUnique.mockResolvedValue({ id: "s1", name: "Test Strategy", isActive: true } as PrismaStrategy);

    await onPositionClosed(makePosition({ strategyId: "s1", pnl: -10 }));

    expect(strategyUpdate).toHaveBeenCalledWith({ where: { id: "s1" }, data: { isActive: false } });
  });

  it("does not touch the strategy if one of the recent closes was a win", async () => {
    await updateCircuitBreakerSettings({ maxConsecutiveLosses: 2 });
    positionFindMany.mockResolvedValue([{ pnl: -10 }, { pnl: 50 }]);
    strategyFindUnique.mockResolvedValue({ id: "s1", name: "Test Strategy", isActive: true } as PrismaStrategy);

    await onPositionClosed(makePosition({ strategyId: "s1", pnl: -10 }));
    expect(strategyUpdate).not.toHaveBeenCalled();
  });

  it("does not touch a strategy that is already on standby", async () => {
    await updateCircuitBreakerSettings({ maxConsecutiveLosses: 2 });
    positionFindMany.mockResolvedValue([{ pnl: -10 }, { pnl: -10 }]);
    strategyFindUnique.mockResolvedValue({ id: "s1", name: "Test Strategy", isActive: false } as PrismaStrategy);

    await onPositionClosed(makePosition({ strategyId: "s1", pnl: -10 }));
    expect(strategyUpdate).not.toHaveBeenCalled();
  });

  it("ignores positions with no strategyId (AI-decision / manual closes)", async () => {
    await onPositionClosed(makePosition({ strategyId: null, pnl: -10 }));
    expect(positionFindMany).not.toHaveBeenCalled();
    expect(strategyUpdate).not.toHaveBeenCalled();
  });
});
