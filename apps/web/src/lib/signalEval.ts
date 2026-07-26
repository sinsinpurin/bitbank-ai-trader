import {
  evaluateGraph,
  type SignalOperand,
  type SignalWatchConfig,
  type StrategyGraph,
  type StrategyNode,
} from "@bitbank-ai-trader/shared";

/**
 * シグナル監視条件を戦略エディタと同じ評価エンジンで評価するためのヘルパー。
 * 条件をミニ戦略グラフ(left/right → 条件 → buy)へ変換して evaluateGraph に渡す。
 */

const OP_TEXT: Record<SignalWatchConfig["op"], string> = {
  gt: ">",
  lt: "<",
  gte: "≥",
  lte: "≤",
  cross_above: "↑上抜け",
  cross_below: "↓下抜け",
};

function operandText(operand: SignalOperand): string {
  switch (operand.type) {
    case "price":
      return "価格";
    case "constant":
      return (operand.value ?? 0).toLocaleString("ja-JP");
    default:
      return `${operand.type.toUpperCase()}(${operand.period ?? "?"})`;
  }
}

/** 条件の自動ラベル(例: "RSI(14) < 30")*/
export function signalLabel(config: SignalWatchConfig): string {
  return `${operandText(config.left)} ${OP_TEXT[config.op]} ${operandText(config.right)}`;
}

function operandNode(id: string, operand: SignalOperand): StrategyNode {
  const position = { x: 0, y: 0 };
  switch (operand.type) {
    case "price":
      return { id, type: "price", params: {}, position };
    case "constant":
      return { id, type: "constant", params: { value: operand.value ?? 0 }, position };
    default:
      return { id, type: operand.type, params: { period: operand.period ?? 14 }, position };
  }
}

export interface SignalEvaluation {
  /** 最新足で条件が成立しているか(cross系は「その足で交差した瞬間」のみtrue) */
  met: boolean;
  /** 左辺・右辺の最新値(計算不能時はnull) */
  leftValue: number | null;
  rightValue: number | null;
  errors: string[];
}

export function evaluateSignal(config: SignalWatchConfig, closes: number[]): SignalEvaluation {
  const isCross = config.op === "cross_above" || config.op === "cross_below";
  const graph: StrategyGraph = {
    nodes: [
      operandNode("left", config.left),
      operandNode("right", config.right),
      {
        id: "cond",
        type: isCross ? "cross" : "compare",
        params: { op: config.op },
        position: { x: 0, y: 0 },
      },
      { id: "act", type: "buy", params: {}, position: { x: 0, y: 0 } },
    ],
    edges: [
      { id: "e1", source: "left", sourceHandle: "out", target: "cond", targetHandle: "a" },
      { id: "e2", source: "right", sourceHandle: "out", target: "cond", targetHandle: "b" },
      { id: "e3", source: "cond", sourceHandle: "out", target: "act", targetHandle: "condition" },
    ],
  };

  const result = evaluateGraph(graph, closes, { collectValues: true });
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  return {
    met: result.buy.current,
    leftValue: num(result.nodeValues["left"]),
    rightValue: num(result.nodeValues["right"]),
    errors: result.errors,
  };
}
