import { describe, expect, it } from "vitest";
import type { SignalWatchConfig } from "@noctas/shared";
import { evaluateSignal, signalLabel } from "./signalEval";

describe("signalLabel", () => {
  it("renders a price/constant compare condition", () => {
    const config: SignalWatchConfig = {
      left: { type: "price" },
      op: "gt",
      right: { type: "constant", value: 10_000_000 },
    };
    expect(signalLabel(config)).toBe("価格 > 10,000,000");
  });

  it("renders an indicator with its period", () => {
    const config: SignalWatchConfig = {
      left: { type: "rsi", period: 14 },
      op: "lt",
      right: { type: "constant", value: 30 },
    };
    expect(signalLabel(config)).toBe("RSI(14) < 30");
  });

  it("renders cross operators with arrows", () => {
    const config: SignalWatchConfig = {
      left: { type: "ema", period: 9 },
      op: "cross_above",
      right: { type: "ema", period: 26 },
    };
    expect(signalLabel(config)).toBe("EMA(9) ↑上抜け EMA(26)");
  });
});

describe("evaluateSignal", () => {
  it("gt: is met when price is above the constant threshold", () => {
    const config: SignalWatchConfig = {
      left: { type: "price" },
      op: "gt",
      right: { type: "constant", value: 100 },
    };
    const result = evaluateSignal(config, [90, 95, 150]);
    expect(result.met).toBe(true);
    expect(result.leftValue).toBe(150);
    expect(result.rightValue).toBe(100);
    expect(result.errors).toEqual([]);
  });

  it("gt: is not met when price is below the threshold", () => {
    const config: SignalWatchConfig = {
      left: { type: "price" },
      op: "gt",
      right: { type: "constant", value: 100 },
    };
    const result = evaluateSignal(config, [90, 95, 99]);
    expect(result.met).toBe(false);
  });

  it("cross_above only reports met on the exact tick price crosses the threshold", () => {
    const config: SignalWatchConfig = {
      left: { type: "price" },
      op: "cross_above",
      right: { type: "constant", value: 100 },
    };
    // crosses on the last tick
    expect(evaluateSignal(config, [90, 95, 150]).met).toBe(true);
    // already above on both of the last two ticks -> no longer "crossing"
    expect(evaluateSignal(config, [90, 150, 160]).met).toBe(false);
  });

  it("returns null values when the series is too short for the indicator to warm up", () => {
    const config: SignalWatchConfig = {
      left: { type: "rsi", period: 14 },
      op: "lt",
      right: { type: "constant", value: 30 },
    };
    const result = evaluateSignal(config, [100, 101, 102]);
    expect(result.leftValue).toBeNull();
    expect(result.met).toBe(false);
  });
});
