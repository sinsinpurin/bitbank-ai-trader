import { describe, expect, it } from "vitest";
import {
  formatCostJpy,
  formatDateTime,
  formatDuration,
  formatJpy,
  formatSignedJpy,
  LOSS_COLOR,
  pnlColor,
  PROFIT_COLOR,
} from "./format";

describe("formatJpy", () => {
  it("rounds and adds thousands separators", () => {
    expect(formatJpy(1234.6)).toBe("¥1,235");
    expect(formatJpy(0)).toBe("¥0");
  });

  it("does not add a sign for negative values", () => {
    expect(formatJpy(-500)).toBe("¥-500");
  });
});

describe("formatSignedJpy", () => {
  it("always shows an explicit + or - sign", () => {
    expect(formatSignedJpy(313)).toBe("+¥313");
    expect(formatSignedJpy(-313)).toBe("-¥313");
    expect(formatSignedJpy(0)).toBe("+¥0");
  });
});

describe("pnlColor", () => {
  it("is the profit color for zero and positive values, loss color for negative", () => {
    expect(pnlColor(1)).toBe(PROFIT_COLOR);
    expect(pnlColor(0)).toBe(PROFIT_COLOR);
    expect(pnlColor(-1)).toBe(LOSS_COLOR);
  });
});

describe("formatDuration", () => {
  it("renders minutes-only under an hour", () => {
    expect(formatDuration(45 * 60_000)).toBe("45m");
  });

  it("renders hours and minutes under a day", () => {
    expect(formatDuration((3 * 60 + 12) * 60_000)).toBe("3h 12m");
  });

  it("renders days and hours at or above a day", () => {
    expect(formatDuration((2 * 24 * 60 + 3 * 60) * 60_000)).toBe("2d 3h");
  });

  it("floors negative/zero durations at 0m", () => {
    expect(formatDuration(-1000)).toBe("0m");
    expect(formatDuration(0)).toBe("0m");
  });
});

describe("formatCostJpy", () => {
  it("shows 2 decimal places for sub-100-yen amounts", () => {
    expect(formatCostJpy(4.481)).toBe("¥4.48");
  });

  it("rounds to whole yen once the amount reaches 100", () => {
    expect(formatCostJpy(1234.6)).toBe("¥1,235");
  });
});

describe("formatDateTime", () => {
  it("formats as MM/DD HH:MM in 24h notation", () => {
    // constructed in local time to match how the app renders timestamps
    const ts = new Date(2026, 6, 31, 9, 5).getTime();
    expect(formatDateTime(ts)).toBe("07/31 09:05");
  });
});
