import { describe, expect, it } from "vitest";
import { tickVolumeDelta } from "./botEngine";

// tickVolumeDelta keeps its "last seen vol24h per pair" baseline in module scope, so each test
// here uses its own pair key to stay isolated from the others (matches the pattern used for
// riskManager.ts's module-scoped closingInFlight guard tests).

describe("tickVolumeDelta", () => {
  it("returns 0 for the very first tick observed for a pair (no baseline yet)", () => {
    expect(tickVolumeDelta("delta-test-first-tick", 12_345)).toBe(0);
  });

  it("returns the positive difference between consecutive ticks", () => {
    const pair = "delta-test-increasing";
    tickVolumeDelta(pair, 100);
    expect(tickVolumeDelta(pair, 130)).toBe(30);
    expect(tickVolumeDelta(pair, 130.5)).toBeCloseTo(0.5);
  });

  it("clamps a decreasing vol24h (24h rolling-window boundary) to 0 instead of going negative", () => {
    const pair = "delta-test-rollover";
    tickVolumeDelta(pair, 500);
    // the 24h cumulative counter can drop when old volume rolls out of the window;
    // that must never be reported as negative volume for the candle
    expect(tickVolumeDelta(pair, 10)).toBe(0);
  });

  it("tracks each pair's baseline independently", () => {
    tickVolumeDelta("delta-test-pair-a", 1000);
    tickVolumeDelta("delta-test-pair-b", 5000);
    expect(tickVolumeDelta("delta-test-pair-a", 1010)).toBe(10);
    expect(tickVolumeDelta("delta-test-pair-b", 5100)).toBe(100);
  });
});
