import "dotenv/config";
import type { TradingMode } from "@bitbank-ai-trader/shared";

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
  "claude-opus-4-8": { inputPerMTok: 5.0, outputPerMTok: 25.0 },
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

/** 取引対象ペア。TARGET_PAIRS(カンマ区切り)優先、無ければ旧TARGET_PAIR、既定はbtc_jpy */
function resolveTargetPairs(): string[] {
  const raw = process.env.TARGET_PAIRS ?? process.env.TARGET_PAIR ?? "btc_jpy";
  const pairs = [...new Set(raw.split(",").map((p) => p.trim().toLowerCase()).filter(Boolean))];
  for (const pair of pairs) {
    if (!/^[a-z0-9]+_jpy$/.test(pair)) {
      console.warn(
        `[config] ペア "${pair}" はJPY建てではありません。ペーパートレードの損益計算はJPY建てペアのみ対応しています`
      );
    }
  }
  return pairs.length > 0 ? pairs : ["btc_jpy"];
}

const targetPairs = resolveTargetPairs();

export const config = {
  port: Number(process.env.PORT ?? 4000),
  // "paper"のみ対応(実運用注文APIは呼び出さない)。ペーパートレードのリセットはpaperモードでのみ許可する
  tradingMode: (process.env.TRADING_MODE === "live" ? "live" : "paper") as TradingMode,
  /** 全取引対象ペア */
  targetPairs,
  /** メインペア(先頭)。AI売買判断ループはこのペアのみを対象にする */
  targetPair: targetPairs[0],
  bitbank: {
    apiKey: process.env.BITBANK_API_KEY ?? "",
    apiSecret: process.env.BITBANK_API_SECRET ?? "",
  },
  anthropic: {
    apiKey: requireEnv("ANTHROPIC_API_KEY", ""),
  },
  ai: {
    model: resolveAiModel(),
    // 戦略グラフの自動生成用モデル。ユーザー操作起点の単発呼び出しなので、
    // 常駐の売買判断ループより高性能なモデルをデフォルトにする
    strategyModel: process.env.AI_STRATEGY_MODEL ?? "claude-opus-4-8",
    strategyMaxTokens: Number(process.env.AI_STRATEGY_MAX_TOKENS ?? 4096),
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
  candles: {
    // 起動時にbitbank公開RESTから取得する1分足の日数(1〜7)。
    // チャート表示と指標のウォームアップを起動直後から使えるようにする
    seedDays: Math.min(7, Math.max(1, Number(process.env.CANDLE_SEED_DAYS ?? 3))),
  },
  bot: {
    // 同一戦略が連続発火するのを防ぐ最短間隔
    cooldownMs: Number(process.env.BOT_COOLDOWN_MS ?? 60_000),
  },
  fees: {
    // ペーパートレードに反映する取引手数料(%)。bitbank現物のtaker手数料は0.12%
    takerFeePct: Number(process.env.TRADE_FEE_PCT ?? 0.12),
    // 成行想定のスリッページ(%)。買いは高く、売りは安く約定する
    slippagePct: Number(process.env.TRADE_SLIPPAGE_PCT ?? 0.02),
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
