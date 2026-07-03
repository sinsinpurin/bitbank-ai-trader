import "dotenv/config";

function requireEnv(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined) {
    throw new Error(`環境変数 ${name} が設定されていません`);
  }
  return value;
}

// Anthropic公式のリスト価格(USD / 1Mトークン、2026年時点)。
// Sonnet 5には2026-08-31までの導入価格(input $2.00 / output $10.00)があるが、
// コスト見積もりは保守的にリスト価格を使う。
export const MODEL_PRICING: Record<string, { inputPerMTok: number; outputPerMTok: number }> = {
  "claude-haiku-4-5": { inputPerMTok: 1.0, outputPerMTok: 5.0 },
  "claude-sonnet-5": { inputPerMTok: 3.0, outputPerMTok: 15.0 },
};

const DEFAULT_AI_MODEL = "claude-haiku-4-5";

function resolveAiModel(): string {
  const model = process.env.AI_MODEL ?? DEFAULT_AI_MODEL;
  if (!MODEL_PRICING[model]) {
    console.warn(
      `[config] 未知のAIモデル "${model}" が指定されました。料金見積もりはHaiku 4.5の単価で代用します。`
    );
  }
  return model;
}

export const config = {
  port: Number(process.env.PORT ?? 4000),
  targetPair: process.env.TARGET_PAIR ?? "btc_jpy",
  bitbank: {
    apiKey: process.env.BITBANK_API_KEY ?? "",
    apiSecret: process.env.BITBANK_API_SECRET ?? "",
  },
  anthropic: {
    apiKey: requireEnv("ANTHROPIC_API_KEY", ""),
  },
  ai: {
    model: resolveAiModel(),
    maxTokens: Number(process.env.AI_MAX_TOKENS ?? 512),
    // ループが状態をチェックする間隔(Claude実呼び出しとは別、軽量なので短くてよい)
    pollIntervalMs: Number(process.env.AI_POLL_INTERVAL_MS ?? 15_000),
    // Claude実呼び出しの最短間隔
    minCallIntervalMs: Number(process.env.AI_MIN_CALL_INTERVAL_MS ?? 180_000),
    // 値動きが無くてもこの間隔で強制的に1回呼ぶ
    maxCallIntervalMs: Number(process.env.AI_MAX_CALL_INTERVAL_MS ?? 900_000),
    // 前回判断時の価格からこの%以上動いたら最短間隔を待たず早めに呼ぶ
    priceChangeThresholdPct: Number(process.env.AI_PRICE_CHANGE_THRESHOLD_PCT ?? 0.15),
    // 1日の推定コスト(JPY)がこれを超えたらその日はAI呼び出しを停止する
    dailyBudgetJpy: Number(process.env.AI_DAILY_BUDGET_JPY ?? 100),
    // 円換算用の概算レート(正確な現在レートではなく見積もり用の概算値)
    usdJpyRate: Number(process.env.AI_USD_JPY_RATE ?? 155),
  },
  bot: {
    // 同一戦略が連続発火するのを防ぐ最短間隔
    cooldownMs: Number(process.env.BOT_COOLDOWN_MS ?? 60_000),
  },
  risk: {
    // 1ポジションあたりの上限金額(円)。この金額をもとに購入数量を算出する
    maxPositionJpy: Number(process.env.AI_MAX_POSITION_JPY ?? 30_000),
    // 同時に保有できる未決済ポジション数の上限
    maxOpenPositions: Number(process.env.AI_MAX_OPEN_POSITIONS ?? 3),
    // この含み損率(%)に達したらAIの判断を待たず自動的に成行決済する
    stopLossPct: Number(process.env.AI_STOP_LOSS_PCT ?? 3),
  },
};
