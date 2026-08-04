import { describe, expect, it } from "vitest";
import { ema, latestValue, rsi, sma } from "./indicators";

describe("sma", () => {
  it("fills NaN until enough history, then averages the trailing window", () => {
    const result = sma([1, 2, 3, 4, 5], 3);
    expect(result[0]).toBeNaN();
    expect(result[1]).toBeNaN();
    expect(result[2]).toBeCloseTo((1 + 2 + 3) / 3);
    expect(result[3]).toBeCloseTo((2 + 3 + 4) / 3);
    expect(result[4]).toBeCloseTo((3 + 4 + 5) / 3);
  });

  it("returns all-NaN for a non-positive period", () => {
    const result = sma([1, 2, 3], 0);
    expect(result.every((v) => Number.isNaN(v))).toBe(true);
  });
});

describe("ema", () => {
  it("seeds the first value with the SMA of the warmup window", () => {
    const values = [1, 2, 3, 4, 5];
    const result = ema(values, 3);
    expect(result[0]).toBeNaN();
    expect(result[1]).toBeNaN();
    expect(result[2]).toBeCloseTo((1 + 2 + 3) / 3);
  });

  it("weights the latest value more than a plain SMA once warmed up", () => {
    const values = [1, 1, 1, 1, 100];
    const smaResult = sma(values, 3);
    const emaResult = ema(values, 3);
    expect(emaResult[4]).toBeGreaterThan(smaResult[4]);
  });

  it("returns all-NaN when there isn't enough history for the period", () => {
    const result = ema([1, 2], 5);
    expect(result.every((v) => Number.isNaN(v))).toBe(true);
  });
});

describe("rsi", () => {
  it("returns 100 for a strictly rising series (no losses)", () => {
    const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
    const result = rsi(values, 14);
    expect(result[14]).toBe(100);
  });

  it("returns a mid-range value for a mixed up/down series", () => {
    const values = [10, 11, 10, 11, 10, 11, 10, 11, 10, 11, 10, 11, 10, 11, 10];
    const result = rsi(values, 14);
    expect(result[14]).toBeGreaterThan(0);
    expect(result[14]).toBeLessThan(100);
  });

  it("returns all-NaN when the series isn't longer than the period", () => {
    const result = rsi([1, 2, 3], 14);
    expect(result.every((v) => Number.isNaN(v))).toBe(true);
  });
});

describe("latestValue", () => {
  it("returns null when the last element is NaN", () => {
    expect(latestValue(sma([1, 2], 3))).toBeNull();
  });

  it("returns the last element when it's a real number", () => {
    expect(latestValue(sma([1, 2, 3, 4, 5], 3))).toBeCloseTo((3 + 4 + 5) / 3);
  });

  it("returns null for an empty array", () => {
    expect(latestValue([])).toBeNull();
  });
});
