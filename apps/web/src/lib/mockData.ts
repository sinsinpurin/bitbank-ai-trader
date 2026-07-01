import type { CandlestickData, UTCTimestamp } from "lightweight-charts";
import type { AiDecision, Position, Trade } from "@bitbank-ai-trader/shared";

/** ダミーのローソク足データ生成(BTC/JPY風の値動き) */
export function generateMockCandles(count = 120): CandlestickData[] {
  const candles: CandlestickData[] = [];
  let base = 9_800_000;
  const now = 1_782_900_000; // ビルド時点の固定シード(ランダム関数不使用)
  let seed = 42;

  const next = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };

  for (let i = 0; i < count; i++) {
    const open = base;
    const drift = (next() - 0.48) * 40000;
    const close = open + drift;
    const high = Math.max(open, close) + next() * 15000;
    const low = Math.min(open, close) - next() * 15000;
    base = close;

    candles.push({
      time: (now - (count - i) * 60) as UTCTimestamp,
      open,
      high,
      low,
      close,
    });
  }

  return candles;
}

export const mockAiDecisions: AiDecision[] = [
  {
    id: "1",
    pair: "btc_jpy",
    action: "buy",
    confidence: 0.78,
    reasoning:
      "直近30分で安値圏からの反発を確認。出来高増加を伴っており短期的な上昇継続を予測。",
    createdAt: 1_782_900_000_000,
  },
  {
    id: "2",
    pair: "btc_jpy",
    action: "hold",
    confidence: 0.55,
    reasoning: "レンジ相場が継続中。明確なブレイクアウトが確認できるまで待機を推奨。",
    createdAt: 1_782_900_060_000,
  },
  {
    id: "3",
    pair: "btc_jpy",
    action: "sell",
    confidence: 0.66,
    reasoning: "上位足レジスタンス付近で失速。短期的な調整局面入りと判断。",
    createdAt: 1_782_900_120_000,
  },
];

export const mockPositions: Position[] = [
  {
    id: "p1",
    pair: "btc_jpy",
    side: "buy",
    entryPrice: 9_780_500,
    amount: 0.001,
    openedAt: 1_782_899_900_000,
    closedAt: null,
    closePrice: null,
    pnl: null,
  },
];

export const mockTrades: Trade[] = [
  {
    id: "t1",
    pair: "btc_jpy",
    side: "buy",
    price: 9_780_500,
    amount: 0.001,
    executedAt: 1_782_899_900_000,
    aiDecisionId: "1",
    reason: "ai_decision",
  },
  {
    id: "t2",
    pair: "btc_jpy",
    side: "sell",
    price: 9_705_000,
    amount: 0.0009,
    executedAt: 1_782_899_600_000,
    aiDecisionId: null,
    reason: "stop_loss",
  },
];
