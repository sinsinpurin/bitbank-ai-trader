import { describe, expect, it } from "vitest";
import { config } from "../config";
import { validateRiskSettings } from "./routes";

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

describe("validateRiskSettings / other fields unaffected", () => {
  it("still validates maxOpenPositions independently of the positionSizeJpy cap", () => {
    expect(validateRiskSettings({ maxOpenPositions: 0 })).not.toBeNull();
    expect(validateRiskSettings({ maxOpenPositions: 1.5 })).not.toBeNull();
    expect(validateRiskSettings({ maxOpenPositions: 3 })).toBeNull();
  });
});
