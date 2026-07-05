import { config, MODEL_PRICING } from "../config";

/** モデル別単価(未知のモデルはHaiku 4.5の単価で代用) */
export function pricingFor(model: string) {
  return MODEL_PRICING[model] ?? MODEL_PRICING["claude-haiku-4-5"];
}

/** トークン数から推定コスト(JPY)を求める。レートはconfigの概算値を使う */
export function estimateCostJpy(
  inputTokens: number,
  outputTokens: number,
  model: string
): number {
  const pricing = pricingFor(model);
  const usd =
    (inputTokens / 1_000_000) * pricing.inputPerMTok +
    (outputTokens / 1_000_000) * pricing.outputPerMTok;
  return usd * config.ai.usdJpyRate;
}
