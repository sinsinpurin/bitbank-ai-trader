export * from "./indicators";
export * from "./evaluator";

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

/** 約定の発生理由。AIの売買判断・リスク管理の自動損切り・Bot戦略のいずれか */
export type TradeReason = "ai_decision" | "stop_loss" | "bot_strategy";

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

// ---------------------------------------------------------------------------
// Bot戦略(ブループリント型ノードグラフ)
// ---------------------------------------------------------------------------

/**
 * 戦略グラフのノード種別。
 * - source: price(終値シリーズ), constant(定数)
 * - indicator: sma / ema / rsi(数値シリーズ → 数値シリーズ)
 * - condition: compare(大小比較), cross(クロス判定)
 * - logic: and / or / not(真偽シリーズの合成)
 * - action: buy / sell(条件の立ち上がりで発注)
 */
export type StrategyNodeType =
  | "price"
  | "constant"
  | "sma"
  | "ema"
  | "rsi"
  | "compare"
  | "cross"
  | "logic"
  | "buy"
  | "sell";

export type CompareOp = "gt" | "lt" | "gte" | "lte";
export type CrossOp = "cross_above" | "cross_below";
export type LogicOp = "and" | "or" | "not";

/** ノードのパラメータ。種別ごとに使用するキーが異なる(例: sma→period, compare→op) */
export type StrategyNodeParams = Record<string, number | string>;

export interface StrategyNode {
  id: string;
  type: StrategyNodeType;
  params: StrategyNodeParams;
  /** エディタ(React Flow)上の表示座標 */
  position: { x: number; y: number };
}

export interface StrategyEdge {
  id: string;
  source: string;
  /** 出力ハンドルID(通常 "out") */
  sourceHandle?: string | null;
  target: string;
  /** 入力ハンドルID("in" | "a" | "b" | "condition") */
  targetHandle?: string | null;
}

export interface StrategyGraph {
  nodes: StrategyNode[];
  edges: StrategyEdge[];
}

export interface Strategy {
  id: string;
  name: string;
  description: string;
  graph: StrategyGraph;
  isActive: boolean;
  createdAt: number;
  updatedAt: number;
}

/** Bot戦略が発火したシグナル。executed=falseはリスク制約等で発注を見送ったことを示す */
export interface BotSignal {
  id: string;
  strategyId: string;
  strategyName: string;
  pair: Pair;
  action: OrderSide;
  price: number;
  triggeredAt: number;
  executed: boolean;
  note: string;
}

/** WebSocketでサーバーからフロントへ配信するメッセージの共通形式 */
export type ServerEvent =
  | { type: "ticker"; payload: Ticker }
  | { type: "ai_decision"; payload: AiDecision }
  | { type: "trade"; payload: Trade }
  | { type: "position_update"; payload: Position }
  | { type: "usage_stats"; payload: AiUsageStats }
  | { type: "bot_signal"; payload: BotSignal }
  | { type: "strategy_update"; payload: Strategy };
