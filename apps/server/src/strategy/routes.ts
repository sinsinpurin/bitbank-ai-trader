import type { FastifyInstance } from "fastify";
import type { Strategy as PrismaStrategy } from "@prisma/client";
import { parseGraph, type Strategy, type StrategyGraph } from "@bitbank-ai-trader/shared";
import { prisma } from "../db/prisma";
import { reloadActiveStrategies } from "./botEngine";
import { broadcast } from "../ws/relay";
import { generateStrategyFromPrompt } from "../ai/strategyGenerator";
import { config } from "../config";

function toStrategyDto(row: PrismaStrategy): Strategy {
  return {
    id: row.id,
    name: row.name,
    pair: row.pair,
    description: row.description,
    graph: parseGraph(row.graph) ?? { nodes: [], edges: [] },
    isActive: row.isActive,
    createdAt: row.createdAt.getTime(),
    updatedAt: row.updatedAt.getTime(),
    positionSizeJpy: row.positionSizeJpy,
    maxOpenPositions: row.maxOpenPositions,
    stopLossPct: row.stopLossPct,
    takeProfitPct: row.takeProfitPct,
    trailingStopPct: row.trailingStopPct,
  };
}

interface StrategyBody {
  name?: string;
  pair?: string;
  description?: string;
  graph?: StrategyGraph;
  isActive?: boolean;
  // リスク設定(nullでグローバル設定へ戻す)
  positionSizeJpy?: number | null;
  maxOpenPositions?: number | null;
  stopLossPct?: number | null;
  takeProfitPct?: number | null;
  trailingStopPct?: number | null;
}

/** リスク設定の妥当性を検証し、エラーメッセージまたはnullを返す */
function validateRiskSettings(body: StrategyBody): string | null {
  const positives: [string, number | null | undefined][] = [
    ["positionSizeJpy", body.positionSizeJpy],
    ["stopLossPct", body.stopLossPct],
    ["takeProfitPct", body.takeProfitPct],
    ["trailingStopPct", body.trailingStopPct],
  ];
  for (const [key, value] of positives) {
    if (value !== undefined && value !== null && (!Number.isFinite(value) || value <= 0)) {
      return `${key} は正の数値またはnullで指定してください`;
    }
  }
  if (
    body.maxOpenPositions !== undefined &&
    body.maxOpenPositions !== null &&
    (!Number.isInteger(body.maxOpenPositions) || body.maxOpenPositions < 1)
  ) {
    return "maxOpenPositions は1以上の整数またはnullで指定してください";
  }
  return null;
}

/** bodyに含まれるリスク設定フィールドだけをPrismaのdataへ写す */
function riskSettingsData(body: StrategyBody) {
  return {
    ...(body.positionSizeJpy !== undefined ? { positionSizeJpy: body.positionSizeJpy } : {}),
    ...(body.maxOpenPositions !== undefined ? { maxOpenPositions: body.maxOpenPositions } : {}),
    ...(body.stopLossPct !== undefined ? { stopLossPct: body.stopLossPct } : {}),
    ...(body.takeProfitPct !== undefined ? { takeProfitPct: body.takeProfitPct } : {}),
    ...(body.trailingStopPct !== undefined ? { trailingStopPct: body.trailingStopPct } : {}),
  };
}

function isValidPair(pair: string): boolean {
  return config.targetPairs.includes(pair);
}

function validateGraph(graph: unknown): graph is StrategyGraph {
  if (!graph || typeof graph !== "object") return false;
  const g = graph as StrategyGraph;
  return Array.isArray(g.nodes) && Array.isArray(g.edges);
}

export async function strategyRoutes(app: FastifyInstance) {
  app.get("/api/strategies", async () => {
    const rows = await prisma.strategy.findMany({ orderBy: { updatedAt: "desc" } });
    return rows.map(toStrategyDto);
  });

  // 自由文の要望からAIで戦略グラフを生成する(保存はしない — エディタで確認・調整後にSave)
  app.post<{ Body: { prompt?: string; pair?: string } }>(
    "/api/strategies/generate",
    async (request, reply) => {
      const prompt = request.body?.prompt?.trim();
      const pair = request.body?.pair ?? config.targetPair;
      if (!prompt) {
        return reply.status(400).send({ error: "prompt は必須です" });
      }
      if (!isValidPair(pair)) {
        return reply.status(400).send({ error: `未対応のペアです: ${pair}` });
      }
      if (prompt.length > 1000) {
        return reply.status(400).send({ error: "prompt は1000文字以内で入力してください" });
      }
      if (!config.anthropic.apiKey) {
        return reply
          .status(503)
          .send({ error: "ANTHROPIC_API_KEY が設定されていないため、AI生成は利用できません" });
      }

      try {
        return await generateStrategyFromPrompt(prompt, pair);
      } catch (err) {
        request.log.error(err, "戦略グラフのAI生成に失敗しました");
        return reply.status(502).send({
          error: err instanceof Error ? err.message : "戦略グラフの生成に失敗しました",
        });
      }
    }
  );

  app.post<{ Body: StrategyBody }>("/api/strategies", async (request, reply) => {
    const { name, pair, description, graph } = request.body ?? {};
    if (!name || !validateGraph(graph)) {
      return reply.status(400).send({ error: "name と graph (nodes/edges) は必須です" });
    }
    if (pair !== undefined && !isValidPair(pair)) {
      return reply.status(400).send({ error: `未対応のペアです: ${pair}` });
    }
    const riskError = validateRiskSettings(request.body ?? {});
    if (riskError) {
      return reply.status(400).send({ error: riskError });
    }

    const row = await prisma.strategy.create({
      data: {
        name,
        pair: pair ?? config.targetPair,
        description: description ?? "",
        graph: JSON.stringify(graph),
        ...riskSettingsData(request.body ?? {}),
      },
    });

    const dto = toStrategyDto(row);
    broadcast({ type: "strategy_update", payload: dto });
    return dto;
  });

  app.put<{ Params: { id: string }; Body: StrategyBody }>(
    "/api/strategies/:id",
    async (request, reply) => {
      const { id } = request.params;
      const { name, pair, description, graph, isActive } = request.body ?? {};

      if (graph !== undefined && !validateGraph(graph)) {
        return reply.status(400).send({ error: "graph の形式が不正です" });
      }
      if (pair !== undefined && !isValidPair(pair)) {
        return reply.status(400).send({ error: `未対応のペアです: ${pair}` });
      }
      const riskError = validateRiskSettings(request.body ?? {});
      if (riskError) {
        return reply.status(400).send({ error: riskError });
      }

      const existing = await prisma.strategy.findUnique({ where: { id } });
      if (!existing) {
        return reply.status(404).send({ error: "指定された戦略が見つかりません" });
      }

      const row = await prisma.strategy.update({
        where: { id },
        data: {
          ...(name !== undefined ? { name } : {}),
          ...(pair !== undefined ? { pair } : {}),
          ...(description !== undefined ? { description } : {}),
          ...(graph !== undefined ? { graph: JSON.stringify(graph) } : {}),
          ...(isActive !== undefined ? { isActive } : {}),
          ...riskSettingsData(request.body ?? {}),
        },
      });

      await reloadActiveStrategies();
      const dto = toStrategyDto(row);
      broadcast({ type: "strategy_update", payload: dto });
      return dto;
    }
  );

  app.delete<{ Params: { id: string } }>("/api/strategies/:id", async (request, reply) => {
    const { id } = request.params;
    const existing = await prisma.strategy.findUnique({ where: { id } });
    if (!existing) {
      return reply.status(404).send({ error: "指定された戦略が見つかりません" });
    }

    await prisma.strategy.delete({ where: { id } });
    await reloadActiveStrategies();
    return { ok: true };
  });
}
