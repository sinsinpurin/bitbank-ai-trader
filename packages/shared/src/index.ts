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
  /** このポジションを建てたBot戦略ID(AI判断の場合はnull) */
  strategyId?: string | null;
}

/** 約定の発生理由。AIの売買判断・Bot戦略・リスク管理の自動決済(損切り/利確/トレーリング) */
export type TradeReason =
  | "ai_decision"
  | "stop_loss"
  | "bot_strategy"
  | "take_profit"
  | "trailing_stop";

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

/** 戦略ごとのリスク設定。nullはサーバーのグローバル設定にフォールバック */
export interface StrategyRiskSettings {
  /** 1回の買いで投入する金額(円) */
  positionSizeJpy: number | null;
  /** この戦略が同時に持てる未決済ポジション数 */
  maxOpenPositions: number | null;
  /** 損切り率(%) */
  stopLossPct: number | null;
  /** 利確率(%)。建値からこの%上昇したら自動決済 */
  takeProfitPct: number | null;
  /** トレーリングストップ幅(%)。建玉後の最高値からこの%下落したら自動決済 */
  trailingStopPct: number | null;
}

export interface Strategy extends StrategyRiskSettings {
  id: string;
  name: string;
  /** 対象ペア(例: "btc_jpy")。このペアの1分足でグラフが評価される */
  pair: Pair;
  description: string;
  graph: StrategyGraph;
  isActive: boolean;
  createdAt: number;
  updatedAt: number;
}

/** POST /api/strategies/generate のレスポンス(AIによる戦略グラフの自動生成結果) */
export interface GeneratedStrategy {
  name: string;
  description: string;
  graph: StrategyGraph;
  usage: {
    inputTokens: number;
    outputTokens: number;
    model: string;
    estimatedCostJpy: number;
  };
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

// ---------------------------------------------------------------------------
// アプリ設定・AI使用量
// ---------------------------------------------------------------------------

/** ランタイムで変更できるアプリ設定 */
export interface AppSettings {
  /** AI売買判断ループ(Claude定期呼び出し)を有効にするか */
  aiDecisionEnabled: boolean;
  /** サーキットブレーカー(日次最大損失・連敗自動停止)を有効にするか */
  circuitBreakerEnabled: boolean;
  /** 本日(JST)の実現損失がこの額を超えたら全Botの新規買いを停止する(円) */
  dailyMaxLossJpy: number;
  /** 戦略がこの回数連続で負けたら自動でStandbyにする */
  maxConsecutiveLosses: number;
}

/** サーキットブレーカーの発動状態 */
export interface CircuitBreakerStatus {
  /** 本日の新規買いが停止中か */
  halted: boolean;
  /** 停止理由(未発動ならnull) */
  reason: string | null;
  /** 発動日時(エポックms、未発動ならnull) */
  haltedAt: number | null;
}

/** JST日別のAIトークン使用量(売買判断+戦略生成の合算) */
export interface AiUsageDay {
  date: string; // "YYYY-MM-DD" (JST基準)
  decisionCalls: number;
  generationCalls: number;
  inputTokens: number;
  outputTokens: number;
  estimatedCostJpy: number;
}

/** GET /api/settings が返すAI使用量サマリ */
export interface AiUsageSummary {
  decisionModel: string;
  strategyModel: string;
  dailyBudgetJpy: number;
  /** 本日(JST)の売買判断ループ分の推定コスト。日次予算の判定対象はこちらのみ */
  todayDecisionCostJpy: number;
  budgetExceeded: boolean;
  /** 直近30日(JST)の日別使用量。新しい日が先頭 */
  days: AiUsageDay[];
  /** daysに含まれる期間の合計 */
  totals: {
    decisionCalls: number;
    generationCalls: number;
    inputTokens: number;
    outputTokens: number;
    estimatedCostJpy: number;
  };
}

export interface SettingsResponse {
  settings: AppSettings;
  circuitBreaker: CircuitBreakerStatus;
  usage: AiUsageSummary;
}

// ---------------------------------------------------------------------------
// 損益ダッシュボード
// ---------------------------------------------------------------------------

/** 累積実現損益カーブの1点(timeはUNIX秒) */
export interface PnlCurvePoint {
  time: number;
  value: number;
}

/** JST日次の実現損益 */
export interface PnlDailyPoint {
  date: string; // "YYYY-MM-DD" (JST基準)
  pnl: number;
  tradeCount: number;
}

/** 決済理由(≒発注経路)ごとの実現損益内訳 */
export interface PnlReasonBreakdown {
  reason: TradeReason;
  pnl: number;
  count: number;
  winCount: number;
}

/** 決済済みポジション+決済理由 */
export interface ClosedPositionRecord extends Position {
  closeReason: TradeReason | null;
}

/** 戦略ごとの実現損益サマリ */
export interface PnlStrategyBreakdown {
  /** 戦略ID。AI判断など戦略に紐づかないものはnull */
  strategyId: string | null;
  /** 戦略名(削除済みは"(削除済み)"、null枠は"AI判断・その他") */
  strategyName: string;
  pair: Pair | null;
  isActive: boolean;
  closedCount: number;
  winCount: number;
  realizedPnl: number;
}

/** GET /api/pairs が返す取引対象ペア情報 */
export interface PairsInfo {
  pairs: Pair[];
  /** メインペア。AI売買判断ループの対象 */
  primaryPair: Pair;
}

/** GET /api/pnl が返す損益サマリ(全ペア合算) */
export interface PnlSummary {
  /** ペアごとの最新価格(1分足終値ベース)。履歴が無いペアは含まれない */
  currentPrices: Record<Pair, number>;
  /** 決済済みポジションの損益合計 */
  realizedPnl: number;
  /** 未決済ポジションの現在値評価損益(currentPrice不明時は0) */
  unrealizedPnl: number;
  totalPnl: number;
  winCount: number;
  lossCount: number;
  /** 勝率0-1。決済0件ならnull */
  winRate: number | null;
  avgWin: number | null;
  avgLoss: number | null;
  /** 総利益/総損失。損失0なら null */
  profitFactor: number | null;
  /** 累積実現損益カーブ上の最大ドローダウン(正の値) */
  maxDrawdown: number;
  balanceJpy: number;
  /** JPY以外の仮想残高(通貨コード→数量)。例: { btc: 0.003, eth: 0.1 } */
  assetBalances: Record<string, number>;
  /** JPY残高 + BTC残高の現在値評価 */
  equityJpy: number;
  initialBalanceJpy: number;
  equityCurve: PnlCurvePoint[];
  dailyPnl: PnlDailyPoint[];
  byReason: PnlReasonBreakdown[];
  /** 戦略別の実現損益(損益の大きい順) */
  byStrategy: PnlStrategyBreakdown[];
  openPositions: Position[];
  /** 直近の決済済みポジション(新しい順) */
  closedPositions: ClosedPositionRecord[];
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
