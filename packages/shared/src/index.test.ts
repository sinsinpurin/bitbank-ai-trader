import { describe, expect, it } from "vitest";
import { CANDLE_TIMEFRAMES, isCandleTimeframe, minutesOfTimeframe } from "./index";

describe("minutesOfTimeframe", () => {
  it("returns the configured minutes for every known timeframe", () => {
    for (const option of CANDLE_TIMEFRAMES) {
      expect(minutesOfTimeframe(option.value)).toBe(option.minutes);
    }
  });

  it("falls back to 1 minute for an unrecognized timeframe", () => {
    expect(minutesOfTimeframe("bogus" as never)).toBe(1);
  });
});

describe("isCandleTimeframe", () => {
  it("accepts every known timeframe value", () => {
    for (const option of CANDLE_TIMEFRAMES) {
      expect(isCandleTimeframe(option.value)).toBe(true);
    }
  });

  it("rejects unknown strings", () => {
    expect(isCandleTimeframe("2min")).toBe(false);
    expect(isCandleTimeframe("")).toBe(false);
  });
});
