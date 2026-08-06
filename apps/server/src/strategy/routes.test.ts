import { describe, expect, it } from "vitest";
import { config } from "../config";
import { estimateThreeMonthCandleCount, validateRiskSettings } from "./routes";

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

describe("estimateThreeMonthCandleCount", () => {
  it("estimates a 1min candle count that exceeds the three-month backtest cap", () => {
    expect(estimateThreeMonthCandleCount("1min")).toBeGreaterThan(
      config.candles.maxThreeMonthBacktestCandles
    );
  });

  it("estimates a 5min candle count that stays within the three-month backtest cap", () => {
    expect(estimateThreeMonthCandleCount("5min")).toBeLessThanOrEqual(
      config.candles.maxThreeMonthBacktestCandles
    );
  });

  it("estimates fewer candles for coarser timeframes", () => {
    expect(estimateThreeMonthCandleCount("1day")).toBeLessThan(estimateThreeMonthCandleCount("1hour"));
    expect(estimateThreeMonthCandleCount("1hour")).toBeLessThan(estimateThreeMonthCandleCount("1min"));
  });
});
