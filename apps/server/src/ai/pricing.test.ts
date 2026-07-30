import { describe, expect, it } from "vitest";
import { config, MODEL_PRICING } from "../config";
import { estimateCostJpy, pricingFor } from "./pricing";

describe("pricingFor", () => {
  it("returns the exact pricing for a known model", () => {
    expect(pricingFor("claude-sonnet-5")).toEqual(MODEL_PRICING["claude-sonnet-5"]);
  });

  it("falls back to Haiku 4.5 pricing for an unknown model", () => {
    expect(pricingFor("some-future-model")).toEqual(MODEL_PRICING["claude-haiku-4-5"]);
  });
});

describe("estimateCostJpy", () => {
  it("computes cost from input/output tokens at the model's per-million-token rate", () => {
    const { inputPerMTok, outputPerMTok } = MODEL_PRICING["claude-haiku-4-5"];
    const usd = (1_000_000 / 1_000_000) * inputPerMTok + (1_000_000 / 1_000_000) * outputPerMTok;
    const expected = usd * config.ai.usdJpyRate;
    expect(estimateCostJpy(1_000_000, 1_000_000, "claude-haiku-4-5")).toBeCloseTo(expected, 5);
  });

  it("is zero for zero tokens", () => {
    expect(estimateCostJpy(0, 0, "claude-haiku-4-5")).toBe(0);
  });

  it("scales linearly with token count", () => {
    const once = estimateCostJpy(1000, 500, "claude-sonnet-5");
    const twice = estimateCostJpy(2000, 1000, "claude-sonnet-5");
    expect(twice).toBeCloseTo(once * 2, 8);
  });

  it("charges more for a pricier model given the same token counts", () => {
    const haiku = estimateCostJpy(10_000, 10_000, "claude-haiku-4-5");
    const opus = estimateCostJpy(10_000, 10_000, "claude-opus-4-8");
    expect(opus).toBeGreaterThan(haiku);
  });
});
