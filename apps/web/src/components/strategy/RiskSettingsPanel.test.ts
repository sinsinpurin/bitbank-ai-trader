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

describe("riskFormToInput / takeProfitPct disable-with-zero", () => {
  it("keeps blank and 0 distinct: blank means global default, 0 means take profit disabled", () => {
    const blank = riskFormToInput(EMPTY_RISK_FORM, MAX);
    expect(blank.ok).toBe(true);
    if (blank.ok) expect(blank.value.takeProfitPct).toBeNull();

    const zero = riskFormToInput({ ...EMPTY_RISK_FORM, takeProfitPct: "0" }, MAX);
    expect(zero.ok).toBe(true);
    if (zero.ok) expect(zero.value.takeProfitPct).toBe(0);
  });

  it("still rejects a negative takeProfitPct", () => {
    expect(riskFormToInput({ ...EMPTY_RISK_FORM, takeProfitPct: "-1" }, MAX).ok).toBe(false);
  });

  it("does not extend the zero exception to the other risk fields", () => {
    expect(riskFormToInput({ ...EMPTY_RISK_FORM, stopLossPct: "0" }, MAX).ok).toBe(false);
    expect(riskFormToInput({ ...EMPTY_RISK_FORM, trailingStopPct: "0" }, MAX).ok).toBe(false);
    expect(riskFormToInput({ ...EMPTY_RISK_FORM, maxOpenPositions: "0" }, MAX).ok).toBe(false);
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
