import { describe, expect, it } from "vitest";
import type { Position as PrismaPosition, Trade as PrismaTrade } from "@prisma/client";
import { toPositionEvent, toTradeEvent } from "./mappers";

function makeTrade(overrides: Partial<PrismaTrade> = {}): PrismaTrade {
  return {
    id: "t1",
    pair: "btc_jpy",
    side: "buy",
    price: 10_000_000,
    amount: 0.001,
    reason: "bot_strategy",
    executedAt: new Date("2026-07-30T09:00:00.000Z"),
    strategyId: null,
    fee: 12,
    aiDecisionId: null,
    positionId: null,
    ...overrides,
  };
}

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

describe("toTradeEvent", () => {
  it("converts Date fields to epoch ms and passes the rest through", () => {
    const trade = makeTrade();
    const event = toTradeEvent(trade);
    expect(event.executedAt).toBe(trade.executedAt.getTime());
    expect(event.id).toBe("t1");
    expect(event.side).toBe("buy");
    expect(event.reason).toBe("bot_strategy");
    expect(event.fee).toBe(12);
  });
});

describe("toPositionEvent", () => {
  it("maps an open position with null close fields", () => {
    const event = toPositionEvent(makePosition());
    expect(event.closedAt).toBeNull();
    expect(event.closePrice).toBeNull();
    expect(event.pnl).toBeNull();
    expect(event.openedAt).toBe(makePosition().openedAt.getTime());
  });

  it("maps a closed position's Date fields to epoch ms", () => {
    const closedAt = new Date("2026-07-30T10:00:00.000Z");
    const event = toPositionEvent(
      makePosition({ closedAt, closePrice: 9_950_000, pnl: -50, strategyId: "s1" })
    );
    expect(event.closedAt).toBe(closedAt.getTime());
    expect(event.closePrice).toBe(9_950_000);
    expect(event.pnl).toBe(-50);
    expect(event.strategyId).toBe("s1");
  });
});
