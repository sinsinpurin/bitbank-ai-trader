import type { FastifyInstance } from "fastify";
import type { SignalWatch as PrismaSignalWatch } from "@prisma/client";
import type { BotSignal, SignalWatch, SignalWatchConfig } from "@noctas/shared";
import { prisma } from "../db/prisma";
import { config } from "../config";

/** カスタムシグナルモニターのCRUDと、Botシグナル発火履歴の参照 */

const OPS = ["gt", "lt", "gte", "lte", "cross_above", "cross_below"] as const;
const OPERAND_TYPES = ["price", "sma", "ema", "rsi", "constant"] as const;

function validateConfig(raw: unknown): string | null {
  if (!raw || typeof raw !== "object") return "config は必須です";
  const cfg = raw as SignalWatchConfig;
  if (!OPS.includes(cfg.op as (typeof OPS)[number])) return `op が不正です: ${String(cfg.op)}`;

  for (const [side, operand] of [
    ["left", cfg.left],
    ["right", cfg.right],
  ] as const) {
    if (!operand || !OPERAND_TYPES.includes(operand.type as (typeof OPERAND_TYPES)[number])) {
      return `${side} のtypeが不正です`;
    }
    if (operand.type === "constant") {
      if (typeof operand.value !== "number" || !Number.isFinite(operand.value)) {
        return `${side} のvalue(固定値)は数値で指定してください`;
      }
    }
    if (operand.type === "sma" || operand.type === "ema" || operand.type === "rsi") {
      const min = operand.type === "rsi" ? 2 : 1;
      if (
        typeof operand.period !== "number" ||
        !Number.isInteger(operand.period) ||
        operand.period < min ||
        operand.period > 400
      ) {
        return `${side} のperiodは${min}〜400の整数で指定してください`;
      }
    }
  }

  if (cfg.left.type === "constant" && cfg.right.type === "constant") {
    return "左辺と右辺の両方を固定値にすることはできません";
  }
  if (cfg.left.type === "constant") {
    return "左辺には価格または指標を指定してください(固定値は右辺へ)";
  }
  return null;
}

function toDto(row: PrismaSignalWatch): SignalWatch {
  return {
    id: row.id,
    name: row.name,
    pair: row.pair,
    config: JSON.parse(row.config) as SignalWatchConfig,
    createdAt: row.createdAt.getTime(),
    updatedAt: row.updatedAt.getTime(),
  };
}

interface WatchBody {
  name?: string;
  pair?: string;
  config?: SignalWatchConfig;
}

export async function signalRoutes(app: FastifyInstance) {
  app.get("/api/signals", async (): Promise<SignalWatch[]> => {
    const rows = await prisma.signalWatch.findMany({
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    });
    return rows.map(toDto);
  });

  app.post<{ Body: WatchBody }>("/api/signals", async (request, reply) => {
    const { name, pair, config: cfg } = request.body ?? {};
    if (!pair || !config.targetPairs.includes(pair)) {
      return reply.status(400).send({ error: `未対応のペアです: ${pair}` });
    }
    const configError = validateConfig(cfg);
    if (configError) {
      return reply.status(400).send({ error: configError });
    }
    const row = await prisma.signalWatch.create({
      data: { name: name ?? "", pair, config: JSON.stringify(cfg) },
    });
    return toDto(row);
  });

  app.put<{ Params: { id: string }; Body: WatchBody }>(
    "/api/signals/:id",
    async (request, reply) => {
      const { id } = request.params;
      const { name, pair, config: cfg } = request.body ?? {};
      const existing = await prisma.signalWatch.findUnique({ where: { id } });
      if (!existing) {
        return reply.status(404).send({ error: "指定されたシグナルが見つかりません" });
      }
      if (pair !== undefined && !config.targetPairs.includes(pair)) {
        return reply.status(400).send({ error: `未対応のペアです: ${pair}` });
      }
      if (cfg !== undefined) {
        const configError = validateConfig(cfg);
        if (configError) {
          return reply.status(400).send({ error: configError });
        }
      }
      const row = await prisma.signalWatch.update({
        where: { id },
        data: {
          ...(name !== undefined ? { name } : {}),
          ...(pair !== undefined ? { pair } : {}),
          ...(cfg !== undefined ? { config: JSON.stringify(cfg) } : {}),
        },
      });
      return toDto(row);
    }
  );

  app.delete<{ Params: { id: string } }>("/api/signals/:id", async (request, reply) => {
    const { id } = request.params;
    const existing = await prisma.signalWatch.findUnique({ where: { id } });
    if (!existing) {
      return reply.status(404).send({ error: "指定されたシグナルが見つかりません" });
    }
    await prisma.signalWatch.delete({ where: { id } });
    return { ok: true };
  });

  // Botシグナルの発火履歴(新しい順)
  app.get<{ Querystring: { limit?: string } }>("/api/bot-signals", async (request) => {
    const limit = Math.min(Number(request.query.limit) || 50, 200);
    const rows = await prisma.botSignalLog.findMany({
      orderBy: { triggeredAt: "desc" },
      take: limit,
    });
    return rows.map(
      (row): BotSignal => ({
        id: row.id,
        strategyId: row.strategyId,
        strategyName: row.strategyName,
        pair: row.pair,
        action: row.action as BotSignal["action"],
        price: row.price,
        triggeredAt: row.triggeredAt.getTime(),
        executed: row.executed,
        note: row.note,
      })
    );
  });
}
