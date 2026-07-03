import type { FastifyInstance } from "fastify";
import type { Strategy as PrismaStrategy } from "@prisma/client";
import { parseGraph, type Strategy, type StrategyGraph } from "@bitbank-ai-trader/shared";
import { prisma } from "../db/prisma";
import { reloadActiveStrategies } from "./botEngine";
import { broadcast } from "../ws/relay";

function toStrategyDto(row: PrismaStrategy): Strategy {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    graph: parseGraph(row.graph) ?? { nodes: [], edges: [] },
    isActive: row.isActive,
    createdAt: row.createdAt.getTime(),
    updatedAt: row.updatedAt.getTime(),
  };
}

interface StrategyBody {
  name?: string;
  description?: string;
  graph?: StrategyGraph;
  isActive?: boolean;
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

  app.post<{ Body: StrategyBody }>("/api/strategies", async (request, reply) => {
    const { name, description, graph } = request.body ?? {};
    if (!name || !validateGraph(graph)) {
      return reply.status(400).send({ error: "name と graph (nodes/edges) は必須です" });
    }

    const row = await prisma.strategy.create({
      data: {
        name,
        description: description ?? "",
        graph: JSON.stringify(graph),
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
      const { name, description, graph, isActive } = request.body ?? {};

      if (graph !== undefined && !validateGraph(graph)) {
        return reply.status(400).send({ error: "graph の形式が不正です" });
      }

      const existing = await prisma.strategy.findUnique({ where: { id } });
      if (!existing) {
        return reply.status(404).send({ error: "指定された戦略が見つかりません" });
      }

      const row = await prisma.strategy.update({
        where: { id },
        data: {
          ...(name !== undefined ? { name } : {}),
          ...(description !== undefined ? { description } : {}),
          ...(graph !== undefined ? { graph: JSON.stringify(graph) } : {}),
          ...(isActive !== undefined ? { isActive } : {}),
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
