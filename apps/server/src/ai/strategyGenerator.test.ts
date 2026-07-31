import { describe, expect, it } from "vitest";
import { buildUserMessage } from "./strategyGenerator";

describe("buildUserMessage", () => {
  it("returns just the request when no review context is given", () => {
    const message = buildUserMessage("RSIが30を下回ったら買い");
    expect(message).toContain("要望: RSIが30を下回ったら買い");
    expect(message).not.toContain("取引レビュー");
  });

  it("treats an empty/whitespace-only review context the same as none", () => {
    expect(buildUserMessage("要望テキスト", "")).not.toContain("取引レビュー");
    expect(buildUserMessage("要望テキスト", "   ")).not.toContain("取引レビュー");
  });

  it("includes the review context verbatim when provided", () => {
    const review = "懸念点: 手数料負けしている取引が複数ある。改善提案: 利確ラインを設定する。";
    const message = buildUserMessage("トレンド追随の戦略にして", review);
    expect(message).toContain("要望: トレンド追随の戦略にして");
    expect(message).toContain(review);
    expect(message).toContain("取引レビュー");
  });

  it("trims surrounding whitespace on the review context", () => {
    const message = buildUserMessage("要望", "  レビュー本文  \n");
    expect(message).toContain("レビュー本文");
    expect(message).not.toContain("  レビュー本文  ");
  });
});
