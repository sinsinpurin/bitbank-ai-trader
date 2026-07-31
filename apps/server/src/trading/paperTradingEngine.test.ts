import { beforeEach, describe, expect, it, vi } from "vitest";

// Regression test for a real bug: openBuyPosition created the entry (buy) Trade without
// linking positionId, because position.create/trade.create were both built as plain data
// objects before being handed to $transaction([...]) as an array - so the entry Trade could
// never reference the not-yet-created Position's id. Fixed by generating the id upfront.

const positionCreate = vi.fn();
const tradeCreate = vi.fn();
const virtualBalanceUpdate = vi.fn();
const virtualBalanceUpsert = vi.fn();
const virtualBalanceFindUniqueOrThrow = vi.fn();
const positionCount = vi.fn();

vi.mock("../db/prisma", () => ({
  prisma: {
    virtualBalance: {
      update: (...args: unknown[]) => virtualBalanceUpdate(...args),
      upsert: (...args: unknown[]) => virtualBalanceUpsert(...args),
      findUniqueOrThrow: (...args: unknown[]) => virtualBalanceFindUniqueOrThrow(...args),
    },
    position: {
      create: (...args: unknown[]) => positionCreate(...args),
      count: (...args: unknown[]) => positionCount(...args),
    },
    trade: {
      create: (...args: unknown[]) => tradeCreate(...args),
    },
    $transaction: (ops: Promise<unknown>[]) => Promise.all(ops),
  },
}));

vi.mock("./circuitBreaker", () => ({
  isBuyHalted: () => false,
  onPositionClosed: vi.fn(),
}));

const { openBuyPosition } = await import("./paperTradingEngine");

beforeEach(() => {
  positionCreate.mockReset().mockImplementation(({ data }: { data: Record<string, unknown> }) =>
    Promise.resolve({ ...data })
  );
  tradeCreate.mockReset().mockImplementation(({ data }: { data: Record<string, unknown> }) =>
    Promise.resolve({ ...data })
  );
  virtualBalanceUpdate.mockReset().mockResolvedValue(undefined);
  virtualBalanceUpsert.mockReset().mockResolvedValue(undefined);
  virtualBalanceFindUniqueOrThrow.mockReset().mockResolvedValue({ currency: "jpy", amount: 1_000_000 });
  positionCount.mockReset().mockResolvedValue(0);
});

describe("openBuyPosition / entry trade <-> position linkage", () => {
  it("links the entry (buy) trade to the newly created position via positionId", async () => {
    await openBuyPosition("btc_jpy", 10_000_000, "bot_strategy");

    expect(positionCreate).toHaveBeenCalledTimes(1);
    expect(tradeCreate).toHaveBeenCalledTimes(1);

    const positionArg = positionCreate.mock.calls[0][0].data as { id: string };
    const tradeArg = tradeCreate.mock.calls[0][0].data as { positionId: string };

    expect(positionArg.id).toEqual(expect.any(String));
    expect(positionArg.id.length).toBeGreaterThan(0);
    expect(tradeArg.positionId).toBe(positionArg.id);
  });

  it("does not open a position (or create a trade) when the risk checks reject it", async () => {
    positionCount.mockResolvedValue(999); // already at/above max open positions
    const result = await openBuyPosition("btc_jpy", 10_000_000, "bot_strategy");

    expect(result).toEqual({ trade: null, position: null });
    expect(positionCreate).not.toHaveBeenCalled();
    expect(tradeCreate).not.toHaveBeenCalled();
  });
});
