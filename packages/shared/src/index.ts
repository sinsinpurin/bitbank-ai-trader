export type Pair = string; // 例: "btc_jpy"

export type OrderSide = "buy" | "sell";

export type AiAction = "buy" | "sell" | "hold";

/** bitbank Public Stream の ticker_{pair} イベントを正規化したもの */
export interface Ticker {
  pair: Pair;
  sell: number;
  buy: number;
  high: number;
  low: number;
  last: number;
  vol: number;
  timestamp: number;
}

export interface OrderBookLevel {
  price: number;
  amount: number;
}

export interface OrderBook {
  pair: Pair;
  asks: OrderBookLevel[];
  bids: OrderBookLevel[];
  timestamp: number;
}

/** ペーパートレードにおける仮想ポジション */
export interface Position {
  id: string;
  pair: Pair;
  side: OrderSide;
  entryPrice: number;
  amount: number;
  openedAt: number;
  closedAt: number | null;
  closePrice: number | null;
  pnl: number | null;
}

/** 約定の発生理由。AIの売買判断によるものか、リスク管理の自動損切りによるものか */
export type TradeReason = "ai_decision" | "stop_loss";

/** ペーパートレードにおける仮想約定履歴 */
export interface Trade {
  id: string;
  pair: Pair;
  side: OrderSide;
  price: number;
  amount: number;
  executedAt: number;
  aiDecisionId: string | null;
  reason: TradeReason;
}

/** Claudeによる売買判断結果 */
export interface AiDecision {
  id: string;
  pair: Pair;
  action: AiAction;
  confidence: number; // 0.0 - 1.0
  reasoning: string;
  createdAt: number;
}

/** その日のAIトークン利用量・推定コストのサマリ */
export interface AiUsageStats {
  date: string; // "YYYY-MM-DD" (JST基準)
  model: string;
  callCount: number;
  inputTokens: number;
  outputTokens: number;
  estimatedCostJpy: number;
  dailyBudgetJpy: number;
  budgetExceeded: boolean;
}

/** WebSocketでサーバーからフロントへ配信するメッセージの共通形式 */
export type ServerEvent =
  | { type: "ticker"; payload: Ticker }
  | { type: "ai_decision"; payload: AiDecision }
  | { type: "trade"; payload: Trade }
  | { type: "position_update"; payload: Position }
  | { type: "usage_stats"; payload: AiUsageStats };
