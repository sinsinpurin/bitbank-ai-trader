import Anthropic from "@anthropic-ai/sdk";
import {
  evaluateGraph,
  type GeneratedStrategy,
  type StrategyEdge,
  type StrategyGraph,
  type StrategyNode,
  type StrategyNodeType,
} from "@noctas/shared";
import { config } from "../config";
import { prisma } from "../db/prisma";
import { estimateCostJpy } from "./pricing";

const anthropic = new Anthropic({ apiKey: config.anthropic.apiKey });

/** ノード種別ごとのポート仕様(webのnodeCatalogと同一内容のサーバー側定義) */
const NODE_SPEC: Record<
  StrategyNodeType,
  { inputs: Record<string, "number" | "bool">; output: "number" | "bool" | null }
> = {
  price: { inputs: {}, output: "number" },
  constant: { inputs: {}, output: "number" },
  position: { inputs: {}, output: "bool" },
  sma: { inputs: { in: "number" }, output: "number" },
  ema: { inputs: { in: "number" }, output: "number" },
  rsi: { inputs: { in: "number" }, output: "number" },
  compare: { inputs: { a: "number", b: "number" }, output: "bool" },
  cross: { inputs: { a: "number", b: "number" }, output: "bool" },
  logic: { inputs: { a: "bool", b: "bool" }, output: "bool" },
  ai_judgment: { inputs: {}, output: "bool" },
  buy: { inputs: { condition: "bool" }, output: null },
  sell: { inputs: { condition: "bool" }, output: null },
};

const NODE_TYPES = Object.keys(NODE_SPEC) as StrategyNodeType[];

/** ペア表記("btc_jpy" → "BTC/JPY") */
function pairLabel(pair: string): string {
  return pair.toUpperCase().replace("_", "/");
}

const buildSystemPrompt = (pair: string) => `あなたは${pairLabel(pair)}の1分足で動くトレーディングBotの戦略設計アシスタントです。
ユーザーの自由文の要望を、以下のノードグラフ(ブループリント)へ変換してください。

## ノード仕様
値には2種類ある: number(数値シリーズ) / bool(真偽シリーズ)。ポートの型が一致する接続のみ有効。

- price: 入力なし → 出力 out(number)。${pairLabel(pair)}の終値(1分足)
- constant: 入力なし → 出力 out(number)。params.value に固定値(RSIしきい値など)
- position: 入力なし → 出力 out(bool)。この戦略が${pairLabel(pair)}で未決済の建玉を持っているかを表す。
  params.state = "none"(建玉なしのとき真, 既定)|"holding"(建玉ありのとき真)。
  logic(and)でエントリー条件と組み合わせ、「建玉が無いときだけ買う」等のゲートに使う。
- sma / ema: 入力 in(number, 未接続なら終値) → 出力 out(number)。params.period(1以上の整数)
- rsi: 入力 in(number, 未接続なら終値) → 出力 out(number, 0-100)。params.period(2以上の整数, 通常14)
- compare: 入力 a, b(number) → 出力 out(bool)。params.op = "gt"|"lt"|"gte"|"lte"(a op b)
- cross: 入力 a, b(number) → 出力 out(bool)。params.op = "cross_above"(aがbを上抜けた瞬間のみ真)|"cross_below"
- logic: 入力 a, b(bool) → 出力 out(bool)。params.op = "and"|"or"|"not"("not"はaのみ使用)
- ai_judgment: 入力なし → 出力 out(bool)。Claudeによる売買判断が params.expect ("buy"|"sell")
  と一致し、かつ確信度が params.minConfidence(0-1、既定0)以上のとき、その判断が届いた瞬間だけ真になる。
  Claude APIを裏で呼び出すため低頻度(数分間隔)かつコストがかかる。必ずcompare/cross等の
  技術的条件と組み合わせて使うこと(ai_judgment単体をbuy/sellへ直結する設計は避ける)。
- buy: 入力 condition(bool)。条件が偽→真に変わった瞬間に買い(ペーパー注文)
- sell: 入力 condition(bool)。条件が偽→真に変わった瞬間に保有ポジションを決済

## 実行モデル
- 条件の「立ち上がりエッジ」で1回だけ発火し、以後60秒のクールダウンがある。
  そのため compare(継続的に真になる)より cross(瞬間だけ真)が発注条件に向くことが多い。
- 必ず buy ノードを1つ以上含め、可能なら sell ノード(手仕舞い条件)も含めること。
- ユーザーが「AIの判断も使って」のように明示的に要望した場合のみ ai_judgment ノードを使うこと。
- グラフは必要最小限のノード数で構成すること。座標は不要(サーバー側で自動レイアウトする)。

## 出力
submit_strategy_graph ツールで返すこと。
- name: 20文字程度の日本語の戦略名
- description: 戦略の狙いを1〜2文の日本語で
- nodes[].id はグラフ内で一意な短い英数字ID(例: "price1", "sma_fast")
- edges は source(出力側ノードid) / sourceHandle("out") / target / targetHandle(上記の入力ポート名)`;

const STRATEGY_TOOL = {
  name: "submit_strategy_graph",
  description: "設計したBot戦略のノードグラフを送信する",
  input_schema: {
    type: "object" as const,
    properties: {
      name: { type: "string" as const, description: "日本語の戦略名" },
      description: { type: "string" as const, description: "戦略の狙い(日本語1〜2文)" },
      nodes: {
        type: "array" as const,
        items: {
          type: "object" as const,
          properties: {
            id: { type: "string" as const },
            type: { type: "string" as const, enum: NODE_TYPES },
            params: {
              type: "object" as const,
              properties: {
                value: { type: "number" as const },
                period: { type: "number" as const },
                op: {
                  type: "string" as const,
                  enum: ["gt", "lt", "gte", "lte", "cross_above", "cross_below", "and", "or", "not"],
                },
                expect: { type: "string" as const, enum: ["buy", "sell"] },
                minConfidence: { type: "number" as const },
                state: { type: "string" as const, enum: ["none", "holding"] },
              },
            },
          },
          required: ["id", "type"],
        },
      },
      edges: {
        type: "array" as const,
        items: {
          type: "object" as const,
          properties: {
            source: { type: "string" as const },
            sourceHandle: { type: "string" as const },
            target: { type: "string" as const },
            targetHandle: { type: "string" as const },
          },
          required: ["source", "target", "targetHandle"],
        },
      },
    },
    required: ["name", "description", "nodes", "edges"],
  },
};

interface RawStrategyOutput {
  name: string;
  description: string;
  nodes: { id: string; type: StrategyNodeType; params?: Record<string, number | string> }[];
  edges: { source: string; sourceHandle?: string; target: string; targetHandle: string }[];
}

/** ノードの入力エッジから深さを求め、左→右のレイヤードレイアウトで座標を割り当てる */
function layoutGraph(graph: StrategyGraph): StrategyGraph {
  const incoming = new Map<string, string[]>();
  for (const edge of graph.edges) {
    incoming.set(edge.target, [...(incoming.get(edge.target) ?? []), edge.source]);
  }

  const depthCache = new Map<string, number>();
  function depthOf(id: string, seen: Set<string>): number {
    if (depthCache.has(id)) return depthCache.get(id)!;
    if (seen.has(id)) return 0; // 循環はバリデーションで弾く。ここでは無限再帰だけ防ぐ
    seen.add(id);
    const sources = incoming.get(id) ?? [];
    const depth = sources.length === 0 ? 0 : Math.max(...sources.map((s) => depthOf(s, seen))) + 1;
    depthCache.set(id, depth);
    return depth;
  }

  const perDepthCount = new Map<number, number>();
  const nodes = graph.nodes.map((node) => {
    const depth = depthOf(node.id, new Set());
    const row = perDepthCount.get(depth) ?? 0;
    perDepthCount.set(depth, row + 1);
    return { ...node, position: { x: 60 + depth * 240, y: 60 + row * 150 } };
  });

  return { nodes, edges: graph.edges };
}

/** 生成されたグラフの構造検証。エラーメッセージの配列を返す(空なら合格) */
function validateGraph(graph: StrategyGraph): string[] {
  const errors: string[] = [];
  const nodeById = new Map<string, StrategyNode>();

  for (const node of graph.nodes) {
    if (!NODE_SPEC[node.type]) {
      errors.push(`未知のノード種別です: ${node.type}`);
      continue;
    }
    if (nodeById.has(node.id)) errors.push(`ノードIDが重複しています: ${node.id}`);
    nodeById.set(node.id, node);
  }

  const usedInputs = new Set<string>();
  for (const edge of graph.edges) {
    const source = nodeById.get(edge.source);
    const target = nodeById.get(edge.target);
    if (!source || !target) {
      errors.push(`存在しないノードを参照するエッジがあります: ${edge.source} -> ${edge.target}`);
      continue;
    }
    const outKind = NODE_SPEC[source.type].output;
    const inKind = NODE_SPEC[target.type].inputs[edge.targetHandle ?? "in"];
    if (outKind === null) {
      errors.push(`${source.type} ノード(${edge.source})には出力がありません`);
    } else if (inKind === undefined) {
      errors.push(
        `${target.type} ノード(${edge.target})に入力ポート "${edge.targetHandle}" はありません`
      );
    } else if (outKind !== inKind) {
      errors.push(
        `型が不一致です: ${edge.source}(${outKind}) -> ${edge.target}.${edge.targetHandle}(${inKind})`
      );
    }
    const inputKey = `${edge.target}:${edge.targetHandle}`;
    if (usedInputs.has(inputKey)) errors.push(`入力ポートに複数の接続があります: ${inputKey}`);
    usedInputs.add(inputKey);
  }

  const actionNodes = graph.nodes.filter((n) => n.type === "buy" || n.type === "sell");
  if (!actionNodes.some((n) => n.type === "buy")) {
    errors.push("buy ノードが必要です");
  }
  for (const action of actionNodes) {
    const connected = graph.edges.some(
      (e) => e.target === action.id && (e.targetHandle ?? "condition") === "condition"
    );
    if (!connected) errors.push(`${action.type} ノード(${action.id})に条件が接続されていません`);
  }

  for (const node of graph.nodes) {
    if (node.type === "sma" || node.type === "ema" || node.type === "rsi") {
      const period = Number(node.params.period);
      if (!Number.isInteger(period) || period < 1 || period > 400) {
        errors.push(`${node.type} ノード(${node.id})のperiodが不正です: ${node.params.period}`);
      }
    }
    if (node.type === "position") {
      const state = node.params.state;
      if (state !== undefined && state !== "none" && state !== "holding") {
        errors.push(`position ノード(${node.id})のstateはnone/holdingのいずれかである必要があります`);
      }
    }
    if (node.type === "ai_judgment") {
      const expect = node.params.expect;
      if (expect !== "buy" && expect !== "sell") {
        errors.push(`ai_judgment ノード(${node.id})のexpectはbuy/sellのいずれかである必要があります`);
      }
      if (node.params.minConfidence !== undefined) {
        const minConfidence = Number(node.params.minConfidence);
        if (!Number.isFinite(minConfidence) || minConfidence < 0 || minConfidence > 1) {
          errors.push(`ai_judgment ノード(${node.id})のminConfidenceは0〜1である必要があります`);
        }
      }
    }
  }

  if (errors.length === 0) {
    // 合成した終値シリーズで実際に評価し、循環参照などの実行時エラーを検出する
    const closes: number[] = [];
    let price = 10_000_000;
    for (let i = 0; i < 300; i++) {
      price *= 1 + Math.sin(i / 7) * 0.001;
      closes.push(price);
    }
    errors.push(...evaluateGraph(graph, closes).errors);
  }

  return errors;
}

function toGraph(raw: RawStrategyOutput): StrategyGraph {
  const nodes: StrategyNode[] = raw.nodes.map((n) => ({
    id: n.id,
    type: n.type,
    params: n.params ?? {},
    position: { x: 0, y: 0 },
  }));
  const edges: StrategyEdge[] = raw.edges.map((e, i) => ({
    id: `e_gen_${i}`,
    source: e.source,
    sourceHandle: e.sourceHandle ?? "out",
    target: e.target,
    targetHandle: e.targetHandle,
  }));
  return { nodes, edges };
}

const MAX_ATTEMPTS = 2;

/**
 * 要望メッセージを組み立てる。取引レビュー(P&L ReportのAI Review結果)が引き継がれている場合、
 * その内容(懸念点・改善提案)を踏まえて設計するよう指示を追加する。
 */
export function buildUserMessage(prompt: string, reviewContext?: string): string {
  const base = `次の要望に沿ったBot戦略グラフを設計してください。\n\n要望: ${prompt}`;
  const review = reviewContext?.trim();
  if (!review) return base;
  return `${base}\n\n## 参考: 直近の取引レビュー(AIによる分析結果)\n${review}\n\nこのレビューで指摘された懸念点・改善提案を踏まえて設計すること(レビューの内容と要望が矛盾する場合は要望を優先すること)。`;
}

/**
 * 自由文の要望からBot戦略グラフを生成する。
 * Claudeにツール強制呼び出しで構造化グラフを出力させ、サーバー側で
 * ポート型・接続・実行時エラーを検証。不合格なら検証エラーをフィードバックして1回だけ再生成させる。
 */
export async function generateStrategyFromPrompt(
  prompt: string,
  pair: string = config.targetPair,
  reviewContext?: string
): Promise<GeneratedStrategy> {
  const model = config.ai.strategyModel;
  const systemPrompt = buildSystemPrompt(pair);
  const messages: Anthropic.MessageParam[] = [
    {
      role: "user",
      content: buildUserMessage(prompt, reviewContext),
    },
  ];

  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let lastErrors: string[] = [];

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const message = await anthropic.messages.create({
      model,
      max_tokens: config.ai.strategyMaxTokens,
      system: systemPrompt,
      tools: [STRATEGY_TOOL],
      tool_choice: { type: "tool", name: STRATEGY_TOOL.name },
      messages,
    });

    totalInputTokens += message.usage.input_tokens;
    totalOutputTokens += message.usage.output_tokens;

    const toolUse = message.content.find(
      (block): block is Anthropic.ToolUseBlock => block.type === "tool_use"
    );
    if (!toolUse) {
      throw new Error("Claudeからの応答にtool_useブロックが見つかりませんでした");
    }

    const raw = toolUse.input as RawStrategyOutput;
    const graph = toGraph(raw);
    lastErrors = validateGraph(graph);

    if (lastErrors.length === 0) {
      // 設定画面の使用量集計向けにトークン消費を記録する(失敗してもレスポンスは返す)
      await prisma.aiGenerationLog
        .create({
          data: {
            prompt,
            name: raw.name,
            model,
            inputTokens: totalInputTokens,
            outputTokens: totalOutputTokens,
          },
        })
        .catch((err) => console.error("[strategyGenerator] 生成ログの保存に失敗しました", err));

      return {
        name: raw.name,
        description: raw.description,
        graph: layoutGraph(graph),
        usage: {
          inputTokens: totalInputTokens,
          outputTokens: totalOutputTokens,
          model,
          estimatedCostJpy: estimateCostJpy(totalInputTokens, totalOutputTokens, model),
        },
      };
    }

    // 検証エラーをtool_resultとして返し、修正版を再送させる
    messages.push(
      { role: "assistant", content: message.content },
      {
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: toolUse.id,
            is_error: true,
            content: `グラフの検証に失敗しました。以下を修正して submit_strategy_graph で再送してください。\n- ${lastErrors.join("\n- ")}`,
          },
        ],
      }
    );
  }

  throw new Error(`生成された戦略グラフが検証を通りませんでした: ${lastErrors.join(" / ")}`);
}
