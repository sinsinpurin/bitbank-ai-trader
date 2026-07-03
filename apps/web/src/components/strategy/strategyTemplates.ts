import type { StrategyGraph } from "@bitbank-ai-trader/shared";

/**
 * 初心者向けの戦略テンプレート集。
 * 「どんなグラフを組むとどんな戦略になるのか」の実例として、ワンクリックでキャンバスに展開できる。
 */

export interface StrategyTemplate {
  id: string;
  name: string;
  /** どんな相場観の戦略かの一言 */
  tagline: string;
  /** ノードの流れを表す簡易フロー(→区切り) */
  flow: string;
  /** 発火条件の平易な説明 */
  description: string;
  graph: StrategyGraph;
}

export const STRATEGY_TEMPLATES: StrategyTemplate[] = [
  {
    id: "sma-golden-cross",
    name: "SMA GOLDEN CROSS",
    tagline: "王道のトレンド転換狙い",
    flow: "Price → SMA(5) / SMA(20) → Cross → Buy / Sell",
    description:
      "短期SMA(5)が長期SMA(20)を上抜けた瞬間(ゴールデンクロス)に買い、下抜けた瞬間(デッドクロス)に売り。移動平均2本のクロスでトレンドの転換を捉える最も定番の型です。",
    graph: {
      nodes: [
        { id: "gc_price", type: "price", params: {}, position: { x: 0, y: 130 } },
        { id: "gc_fast", type: "sma", params: { period: 5 }, position: { x: 220, y: 30 } },
        { id: "gc_slow", type: "sma", params: { period: 20 }, position: { x: 220, y: 230 } },
        { id: "gc_up", type: "cross", params: { op: "cross_above" }, position: { x: 460, y: 70 } },
        { id: "gc_down", type: "cross", params: { op: "cross_below" }, position: { x: 460, y: 250 } },
        { id: "gc_buy", type: "buy", params: {}, position: { x: 700, y: 70 } },
        { id: "gc_sell", type: "sell", params: {}, position: { x: 700, y: 250 } },
      ],
      edges: [
        { id: "gc_e1", source: "gc_price", sourceHandle: "out", target: "gc_fast", targetHandle: "in" },
        { id: "gc_e2", source: "gc_price", sourceHandle: "out", target: "gc_slow", targetHandle: "in" },
        { id: "gc_e3", source: "gc_fast", sourceHandle: "out", target: "gc_up", targetHandle: "a" },
        { id: "gc_e4", source: "gc_slow", sourceHandle: "out", target: "gc_up", targetHandle: "b" },
        { id: "gc_e5", source: "gc_fast", sourceHandle: "out", target: "gc_down", targetHandle: "a" },
        { id: "gc_e6", source: "gc_slow", sourceHandle: "out", target: "gc_down", targetHandle: "b" },
        { id: "gc_e7", source: "gc_up", sourceHandle: "out", target: "gc_buy", targetHandle: "condition" },
        { id: "gc_e8", source: "gc_down", sourceHandle: "out", target: "gc_sell", targetHandle: "condition" },
      ],
    },
  },
  {
    id: "rsi-reversal",
    name: "RSI REVERSAL",
    tagline: "売られすぎで拾う逆張り",
    flow: "RSI(14) → Compare(30 / 70) → Buy / Sell",
    description:
      "RSI(14)が30を下回ったら「売られすぎ」と判断して買い、70を上回ったら「買われすぎ」と判断して売り。レンジ相場で反発を拾う逆張り戦略です。RSIの入力は未接続なら自動的に終値が使われます。",
    graph: {
      nodes: [
        { id: "rr_rsi", type: "rsi", params: { period: 14 }, position: { x: 0, y: 130 } },
        { id: "rr_c30", type: "constant", params: { value: 30 }, position: { x: 0, y: 300 } },
        { id: "rr_c70", type: "constant", params: { value: 70 }, position: { x: 0, y: 0 } },
        { id: "rr_low", type: "compare", params: { op: "lt" }, position: { x: 260, y: 210 } },
        { id: "rr_high", type: "compare", params: { op: "gt" }, position: { x: 260, y: 40 } },
        { id: "rr_buy", type: "buy", params: {}, position: { x: 520, y: 210 } },
        { id: "rr_sell", type: "sell", params: {}, position: { x: 520, y: 40 } },
      ],
      edges: [
        { id: "rr_e1", source: "rr_rsi", sourceHandle: "out", target: "rr_low", targetHandle: "a" },
        { id: "rr_e2", source: "rr_c30", sourceHandle: "out", target: "rr_low", targetHandle: "b" },
        { id: "rr_e3", source: "rr_rsi", sourceHandle: "out", target: "rr_high", targetHandle: "a" },
        { id: "rr_e4", source: "rr_c70", sourceHandle: "out", target: "rr_high", targetHandle: "b" },
        { id: "rr_e5", source: "rr_low", sourceHandle: "out", target: "rr_buy", targetHandle: "condition" },
        { id: "rr_e6", source: "rr_high", sourceHandle: "out", target: "rr_sell", targetHandle: "condition" },
      ],
    },
  },
  {
    id: "ema-trend-follow",
    name: "EMA TREND FOLLOW",
    tagline: "価格とEMAのクロスで順張り",
    flow: "Price / EMA(20) → Cross → Buy / Sell",
    description:
      "終値がEMA(20)を上抜けたらトレンド発生とみなして買い、下抜けたら手仕舞い。SMAより反応が速いEMAを使った素直な順張り戦略です。",
    graph: {
      nodes: [
        { id: "et_price", type: "price", params: {}, position: { x: 0, y: 60 } },
        { id: "et_ema", type: "ema", params: { period: 20 }, position: { x: 0, y: 230 } },
        { id: "et_up", type: "cross", params: { op: "cross_above" }, position: { x: 280, y: 40 } },
        { id: "et_down", type: "cross", params: { op: "cross_below" }, position: { x: 280, y: 230 } },
        { id: "et_buy", type: "buy", params: {}, position: { x: 540, y: 40 } },
        { id: "et_sell", type: "sell", params: {}, position: { x: 540, y: 230 } },
      ],
      edges: [
        { id: "et_e1", source: "et_price", sourceHandle: "out", target: "et_up", targetHandle: "a" },
        { id: "et_e2", source: "et_ema", sourceHandle: "out", target: "et_up", targetHandle: "b" },
        { id: "et_e3", source: "et_price", sourceHandle: "out", target: "et_down", targetHandle: "a" },
        { id: "et_e4", source: "et_ema", sourceHandle: "out", target: "et_down", targetHandle: "b" },
        { id: "et_e5", source: "et_up", sourceHandle: "out", target: "et_buy", targetHandle: "condition" },
        { id: "et_e6", source: "et_down", sourceHandle: "out", target: "et_sell", targetHandle: "condition" },
      ],
    },
  },
  {
    id: "trend-dip-buy",
    name: "TREND DIP BUY",
    tagline: "上昇トレンド中の押し目だけ拾う",
    flow: "Price > SMA(50) AND RSI < 40 → Buy / RSI > 70 → Sell",
    description:
      "「終値がSMA(50)より上=上昇トレンド」かつ「RSI(14)が40未満=一時的な押し目」の両方が揃った瞬間だけ買う複合条件の例。Logic(AND)ノードで条件を組み合わせる使い方のサンプルです。RSIが70を超えたら利確します。",
    graph: {
      nodes: [
        { id: "td_price", type: "price", params: {}, position: { x: 0, y: 0 } },
        { id: "td_sma", type: "sma", params: { period: 50 }, position: { x: 0, y: 140 } },
        { id: "td_rsi", type: "rsi", params: { period: 14 }, position: { x: 0, y: 300 } },
        { id: "td_c40", type: "constant", params: { value: 40 }, position: { x: 0, y: 470 } },
        { id: "td_c70", type: "constant", params: { value: 70 }, position: { x: 260, y: 470 } },
        { id: "td_trend", type: "compare", params: { op: "gt" }, position: { x: 260, y: 40 } },
        { id: "td_dip", type: "compare", params: { op: "lt" }, position: { x: 260, y: 300 } },
        { id: "td_and", type: "logic", params: { op: "and" }, position: { x: 500, y: 160 } },
        { id: "td_exit", type: "compare", params: { op: "gt" }, position: { x: 500, y: 380 } },
        { id: "td_buy", type: "buy", params: {}, position: { x: 740, y: 160 } },
        { id: "td_sell", type: "sell", params: {}, position: { x: 740, y: 380 } },
      ],
      edges: [
        { id: "td_e1", source: "td_price", sourceHandle: "out", target: "td_trend", targetHandle: "a" },
        { id: "td_e2", source: "td_sma", sourceHandle: "out", target: "td_trend", targetHandle: "b" },
        { id: "td_e3", source: "td_rsi", sourceHandle: "out", target: "td_dip", targetHandle: "a" },
        { id: "td_e4", source: "td_c40", sourceHandle: "out", target: "td_dip", targetHandle: "b" },
        { id: "td_e5", source: "td_trend", sourceHandle: "out", target: "td_and", targetHandle: "a" },
        { id: "td_e6", source: "td_dip", sourceHandle: "out", target: "td_and", targetHandle: "b" },
        { id: "td_e7", source: "td_and", sourceHandle: "out", target: "td_buy", targetHandle: "condition" },
        { id: "td_e8", source: "td_rsi", sourceHandle: "out", target: "td_exit", targetHandle: "a" },
        { id: "td_e9", source: "td_c70", sourceHandle: "out", target: "td_exit", targetHandle: "b" },
        { id: "td_e10", source: "td_exit", sourceHandle: "out", target: "td_sell", targetHandle: "condition" },
      ],
    },
  },
];
