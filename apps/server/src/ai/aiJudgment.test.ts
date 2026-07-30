import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MarketSnapshot } from "./claudeService";

// This is a regression test for a real bug: refreshPair used to hardcode
// vol24h: 0 in the MarketSnapshot handed to Claude, regardless of the
// actual ticker volume tracked via recordPrice(). getAiDecision is mocked
// purely to capture the snapshot it's called with - no real API call.
const getAiDecision = vi.fn();
vi.mock("./claudeService", () => ({
  getAiDecision: (...args: [MarketSnapshot]) => getAiDecision(...args),
}));

vi.mock("../db/prisma", () => ({
  prisma: {
    aiDecisionLog: {
      create: vi.fn().mockResolvedValue({ createdAt: new Date() }),
      aggregate: vi.fn().mockResolvedValue({ _sum: { inputTokens: 0, outputTokens: 0 }, _count: { id: 0 } }),
    },
  },
}));

vi.mock("../ws/relay", () => ({ broadcast: vi.fn() }));

const { recordPrice, setWatchedPairs, startAiJudgmentLoop } = await import("./aiJudgment");
const { config } = await import("../config");

beforeEach(() => {
  getAiDecision.mockReset().mockResolvedValue({
    action: "hold",
    confidence: 0.5,
    reasoning: "test",
    usage: { inputTokens: 0, outputTokens: 0, model: config.ai.model },
  });
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

// aiJudgment.ts keeps its per-pair call-cooldown (lastCallAt/lastCallPrice) in module scope,
// so it persists across tests in this file - each test uses its own pair to stay isolated
// rather than sharing state through a reset that the module doesn't expose.

describe("aiJudgment / vol24h in the Claude snapshot", () => {
  it("uses the real ticker volume recorded via recordPrice, not a hardcoded 0", async () => {
    setWatchedPairs(new Set(["btc_jpy"]));
    recordPrice("btc_jpy", 10_000_000, 12_345);

    const stop = startAiJudgmentLoop();
    await vi.advanceTimersByTimeAsync(config.ai.pollIntervalMs);
    stop();

    expect(getAiDecision).toHaveBeenCalledTimes(1);
    const snapshot = getAiDecision.mock.calls[0][0] as MarketSnapshot;
    expect(snapshot.vol24h).toBe(12_345);
  });

  it("uses the most recently recorded volume, not a stale earlier one", async () => {
    setWatchedPairs(new Set(["eth_jpy"]));
    recordPrice("eth_jpy", 500_000, 100);
    recordPrice("eth_jpy", 501_000, 999);

    const stop = startAiJudgmentLoop();
    await vi.advanceTimersByTimeAsync(config.ai.pollIntervalMs);
    stop();

    const snapshot = getAiDecision.mock.calls[0][0] as MarketSnapshot;
    expect(snapshot.vol24h).toBe(999);
  });

  it("falls back to 0 only when no volume has ever been recorded for the pair", async () => {
    setWatchedPairs(new Set(["xrp_jpy"]));
    recordPrice("xrp_jpy", 100); // no vol24h argument at all

    const stop = startAiJudgmentLoop();
    await vi.advanceTimersByTimeAsync(config.ai.pollIntervalMs);
    stop();

    const snapshot = getAiDecision.mock.calls[0][0] as MarketSnapshot;
    expect(snapshot.vol24h).toBe(0);
  });
});
