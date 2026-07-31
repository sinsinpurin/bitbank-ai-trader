import { describe, expect, it } from "vitest";
import { EMPTY_RISK_FORM, riskFormFromStrategy, riskFormToInput } from "./RiskSettingsPanel";

const MAX = 30_000;

describe("riskFormToInput / positionSizeJpy cap", () => {
  it("accepts a positionSizeJpy at or below the cap", () => {
    const result = riskFormToInput({ ...EMPTY_RISK_FORM, positionSizeJpy: String(MAX) }, MAX);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.positionSizeJpy).toBe(MAX);
  });

  it("rejects a positionSizeJpy above the cap, mentioning the cap in the error", () => {
    const result = riskFormToInput({ ...EMPTY_RISK_FORM, positionSizeJpy: String(MAX + 1) }, MAX);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain(MAX.toLocaleString("ja-JP"));
  });

  it("leaves positionSizeJpy as null (global fallback) when the field is blank", () => {
    const result = riskFormToInput(EMPTY_RISK_FORM, MAX);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.positionSizeJpy).toBeNull();
  });

  it("still rejects a non-positive positionSizeJpy regardless of the cap", () => {
    expect(riskFormToInput({ ...EMPTY_RISK_FORM, positionSizeJpy: "0" }, MAX).ok).toBe(false);
    expect(riskFormToInput({ ...EMPTY_RISK_FORM, positionSizeJpy: "-1" }, MAX).ok).toBe(false);
  });
});

describe("riskFormFromStrategy", () => {
  it("round-trips a saved positionSizeJpy back into form state", () => {
    const form = riskFormFromStrategy({
      positionSizeJpy: 15_000,
      maxOpenPositions: null,
      stopLossPct: null,
      takeProfitPct: null,
      trailingStopPct: null,
    });
    expect(form.positionSizeJpy).toBe("15000");
    expect(form.maxOpenPositions).toBe("");
  });
});
