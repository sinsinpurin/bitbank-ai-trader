import Anthropic from "@anthropic-ai/sdk";
import type { PnlReview, PnlSummary } from "@bitbank-ai-trader/shared";
import { config } from "../config";
import { prisma } from "../db/prisma";
import { estimateCostJpy } from "./pricing";

const anthropic = new Anthropic({ apiKey: config.anthropic.apiKey });

// レビューは自由文の一回応答なので、戦略生成(tool_use)ほどのトークン数は不要
const REVIEW_MAX_TOKENS = 1024;
// プロンプトが肥大化しすぎないよう、直近の決済履歴はこの件数までに絞る
const MAX_POSITIONS_IN_PROMPT = 30;

const SYSTEM_PROMPT = `あなたはBTC/JPYのペーパートレードBotの運用成績をレビューするアナリストです。
与えられた損益データ(全体サマリ・決済理由別内訳・戦略別内訳・直近の決済履歴)から、
このBotの売買が実際に利益を生めているかを日本語で評価してください。

## 観点
- 勝率(winRate)だけでなく、平均利益/平均損失やprofit factorとのバランスを見ること
- 手数料・スリッページ等の取引コストが利益を圧迫していないか(値動きの方向は合っているのに
  コスト負けして赤字になっている取引がないか、entryPrice/closePriceの差とpnlを見比べて判断すること)
- 決済理由(bot_strategy/take_profit/trailing_stop/stop_loss/ai_decision)ごとの成績差
- 戦略ごとの成績差(複数戦略がある場合)
- サンプル数が少ない場合は統計的に断定しすぎず、その旨を明記すること

## 出力形式(日本語、Markdownの見出し不要、絵文字不要)
1. 総評(2〜3文)
2. 良い点(箇条書き、無ければ「特になし」)
3. 懸念点(箇条書き、具体的な数値を根拠として引用すること)
4. 改善提案(箇条書き、パラメータ調整など実行可能な提案。断定的な投資助言(「買うべき」等)はしないこと)`;

function formatPositions(summary: PnlSummary): string {
  return summary.closedPositions
    .slice(0, MAX_POSITIONS_IN_PROMPT)
    .map((p) => {
      const holdMin = p.closedAt ? ((p.closedAt - p.openedAt) / 60_000).toFixed(1) : "?";
      const changePct = p.closePrice != null ? (((p.closePrice - p.entryPrice) / p.entryPrice) * 100).toFixed(3) : "?";
      return `- ${p.side} entry=${p.entryPrice.toFixed(0)} close=${p.closePrice?.toFixed(0) ?? "?"} (値動き${changePct}%) pnl=${p.pnl?.toFixed(0) ?? "?"}円 fee=${p.totalFeeJpy.toFixed(0)}円 reason=${p.closeReason ?? "?"} 保有${holdMin}分`;
    })
    .join("\n");
}

function buildUserPrompt(summary: PnlSummary): string {
  const byReason = summary.byReason
    .map((r) => `- ${r.reason}: ${r.count}件 (勝${r.winCount}) pnl合計=${r.pnl.toFixed(0)}円`)
    .join("\n");
  const byStrategy = summary.byStrategy
    .map(
      (s) =>
        `- ${s.strategyName} (${s.pair ?? "複数ペア"}, ${s.isActive ? "稼働中" : "停止中"}): ${s.closedCount}件 (勝${s.winCount}) pnl合計=${s.realizedPnl.toFixed(0)}円`
    )
    .join("\n");

  return `## 全体サマリ
決済件数: ${summary.winCount + summary.lossCount}件 (勝${summary.winCount} / 負${summary.lossCount})
勝率: ${summary.winRate != null ? (summary.winRate * 100).toFixed(1) + "%" : "N/A"}
平均利益: ${summary.avgWin?.toFixed(0) ?? "N/A"}円 / 平均損失: ${summary.avgLoss?.toFixed(0) ?? "N/A"}円
Profit Factor: ${summary.profitFactor?.toFixed(2) ?? "N/A"}
実現損益合計: ${summary.realizedPnl.toFixed(0)}円 / 支払手数料合計: ${summary.totalFeesJpy.toFixed(0)}円
最大ドローダウン: ${summary.maxDrawdown.toFixed(0)}円

## 決済理由別
${byReason || "(データなし)"}

## 戦略別
${byStrategy || "(データなし)"}

## 取引コスト設定(参考。全取引に一律で適用される)
往復の取引コスト概算: 手数料${(config.fees.takerFeePct * 2).toFixed(2)}% + スリッページ${(config.fees.slippagePct * 2).toFixed(2)}% ≈ ${(config.fees.takerFeePct * 2 + config.fees.slippagePct * 2).toFixed(2)}%(この値幅を超えないと往復で赤字になる)

## 直近の決済履歴(新しい順、最大${MAX_POSITIONS_IN_PROMPT}件)
${formatPositions(summary) || "(データなし)"}`;
}

/**
 * 損益サマリ(getPnlSummaryと同じデータ)をClaudeにレビューさせる。
 * 戦略生成と同じくユーザー操作起点の単発呼び出しなので、高精度モデル(config.ai.strategyModel)を使う。
 */
export async function generateTradeReview(summary: PnlSummary): Promise<PnlReview> {
  const model = config.ai.strategyModel;
  const userPrompt = buildUserPrompt(summary);
  const message = await anthropic.messages.create({
    model,
    max_tokens: REVIEW_MAX_TOKENS,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userPrompt }],
  });

  const review = message.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();

  if (!review) {
    throw new Error("Claudeからのレビュー応答が空でした");
  }

  const inputTokens = message.usage.input_tokens;
  const outputTokens = message.usage.output_tokens;

  // 設定画面の使用量集計向けにトークン消費を記録する(失敗してもレビュー結果は返す)
  await prisma.aiGenerationLog
    .create({
      data: {
        prompt: userPrompt,
        name: "取引レビュー",
        model,
        inputTokens,
        outputTokens,
      },
    })
    .catch((err) => console.error("[reviewGenerator] レビューログの保存に失敗しました", err));

  return {
    review,
    usage: {
      inputTokens,
      outputTokens,
      model,
      estimatedCostJpy: estimateCostJpy(inputTokens, outputTokens, model),
    },
    generatedAt: Date.now(),
  };
}
