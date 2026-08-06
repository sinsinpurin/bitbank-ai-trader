import Anthropic from "@anthropic-ai/sdk";
import type { AiAction } from "@noctas/shared";
import { config } from "../config";
import { getAnthropicClient } from "./anthropicClient";

export interface MarketSnapshot {
  pair: string;
  last: number;
  high24h: number;
  low24h: number;
  vol24h: number;
  recentPrices: number[]; // 直近の価格推移(古い順)
  indicators: {
    rsi14: number | null;
    smaDeviationPct: number | null; // (last - sma20) / sma20 * 100
    volatilityPct: number | null; // stddev20 / sma20 * 100(算出方法はaiJudgment.ts参照)
  };
  position: {
    hasOpenPosition: boolean;
    openCount: number;
    unrealizedPnlJpy: number | null; // ポジションなしはnull
    unrealizedPnlPct: number | null;
  };
  circuitBreaker: {
    buyHalted: boolean;
    reason: string | null;
  };
}

export interface AiDecisionResult {
  action: AiAction;
  confidence: number;
  reasoning: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
    model: string;
  };
}

const DECISION_TOOL = {
  name: "submit_trading_decision",
  description: "現在の相場データに基づく売買判断を送信する",
  input_schema: {
    type: "object" as const,
    properties: {
      action: {
        type: "string" as const,
        enum: ["buy", "sell", "hold"],
        description: "推奨するアクション",
      },
      confidence: {
        type: "number" as const,
        description: "判断の確信度(0.0〜1.0)",
      },
      reasoning: {
        type: "string" as const,
        description: "判断の根拠を簡潔な日本語で説明",
      },
    },
    required: ["action", "confidence", "reasoning"],
  },
};

/** null安全にパーセント表記のインジケーター値を整形する(データ不足はそれと分かる自然な日本語にする) */
function formatIndicatorPct(value: number | null): string {
  return value === null ? "データ不足のため算出不可" : `${value.toFixed(2)}%`;
}

/** 保有ポジションの文脈を1行の日本語に整形する */
function formatPositionContext(position: MarketSnapshot["position"]): string {
  if (!position.hasOpenPosition) return "なし";
  const pnlJpy = position.unrealizedPnlJpy;
  const pnlPct = position.unrealizedPnlPct;
  const pnlJpyLabel =
    pnlJpy === null ? "算出不可" : `${pnlJpy >= 0 ? "+" : "-"}¥${Math.abs(Math.round(pnlJpy)).toLocaleString("ja-JP")}`;
  const pnlPctLabel = pnlPct === null ? "算出不可" : `${pnlPct >= 0 ? "+" : ""}${pnlPct.toFixed(2)}%`;
  return `あり(${position.openCount}件, 含み損益 ${pnlJpyLabel} / ${pnlPctLabel})`;
}

/** サーキットブレーカーの発動状態を1行の日本語に整形する */
function formatCircuitBreaker(circuitBreaker: MarketSnapshot["circuitBreaker"]): string {
  if (!circuitBreaker.buyHalted) return "平常";
  return `発動中(${circuitBreaker.reason ?? "理由不明"})`;
}

/**
 * 相場スナップショットをClaudeに渡し、構造化された売買判断を取得する。
 * ここではペーパートレード用の判断のみを生成し、実際の注文は行わない。
 */
export async function getAiDecision(
  snapshot: MarketSnapshot
): Promise<AiDecisionResult> {
  const message = await getAnthropicClient().messages.create({
    model: config.ai.model,
    max_tokens: config.ai.maxTokens,
    tools: [DECISION_TOOL],
    tool_choice: { type: "tool", name: DECISION_TOOL.name },
    messages: [
      {
        role: "user",
        content: `あなたは暗号資産の短期トレードを補助するアシスタントです。以下の相場データ(ペーパートレード用途)を分析し、buy/sell/holdのいずれかを判断してください。

ペア: ${snapshot.pair}
現在値: ${snapshot.last}
24時間高値: ${snapshot.high24h}
24時間安値: ${snapshot.low24h}
24時間出来高: ${snapshot.vol24h}
直近価格推移(古い順): ${snapshot.recentPrices.join(", ")}
RSI(14): ${snapshot.indicators.rsi14?.toFixed(2) ?? "データ不足のため算出不可"}
移動平均(20)からの乖離率: ${formatIndicatorPct(snapshot.indicators.smaDeviationPct)}
ボラティリティ(20): ${formatIndicatorPct(snapshot.indicators.volatilityPct)}
保有ポジション: ${formatPositionContext(snapshot.position)}
サーキットブレーカー: ${formatCircuitBreaker(snapshot.circuitBreaker)}

submit_trading_decision ツールで結果を返してください。`,
      },
    ],
  });

  const toolUse = message.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === "tool_use"
  );

  if (!toolUse) {
    throw new Error("Claudeからの応答にtool_useブロックが見つかりませんでした");
  }

  const input = toolUse.input as Pick<AiDecisionResult, "action" | "confidence" | "reasoning">;
  return {
    action: input.action,
    confidence: input.confidence,
    reasoning: input.reasoning,
    usage: {
      inputTokens: message.usage.input_tokens,
      outputTokens: message.usage.output_tokens,
      model: config.ai.model,
    },
  };
}
