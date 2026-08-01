import type { FastifyInstance } from "fastify";
import type { Position } from "@noctas/shared";
import { prisma } from "../db/prisma";
import { getCandleHistory } from "../strategy/botEngine";
import { closePosition } from "./paperTradingEngine";
import { isClosingInFlight, markClosingDone, markClosingStart } from "./riskManager";
import { toPositionEvent, toTradeEvent } from "./mappers";
import { broadcast } from "../ws/relay";

/** 指定ペアの現在値(1分足の最新終値)。履歴が無ければnull */
function currentPriceOf(pair: string): number | null {
  const candles = getCandleHistory(pair);
  return candles.length > 0 ? candles[candles.length - 1].close : null;
}

export async function tradingRoutes(app: FastifyInstance) {
  app.get("/api/positions", async (): Promise<Position[]> => {
    const rows = await prisma.position.findMany({
      where: { closedAt: null },
      orderBy: { openedAt: "asc" },
    });
    return rows.map(toPositionEvent);
  });

  // ダッシュボードの手動決済ボタンから、指定ポジションを現在値で成行決済する
  app.post<{ Params: { id: string } }>(
    "/api/positions/:id/close",
    async (request, reply) => {
      const { id } = request.params;

      const position = await prisma.position.findUnique({ where: { id } });
      if (!position || position.closedAt !== null) {
        return reply.status(404).send({ error: "指定されたポジションが見つかりません" });
      }
      if (isClosingInFlight(id)) {
        return reply.status(409).send({ error: "このポジションは決済処理中です" });
      }

      const currentPrice = currentPriceOf(position.pair);
      if (currentPrice === null) {
        return reply
          .status(503)
          .send({ error: `${position.pair} の現在値がまだ取得できていません` });
      }

      markClosingStart(id);
      try {
        const result = await closePosition(position, currentPrice, "manual");
        broadcast({ type: "trade", payload: toTradeEvent(result.trade) });
        broadcast({ type: "position_update", payload: toPositionEvent(result.position) });
        return toPositionEvent(result.position);
      } catch (err) {
        request.log.error(err, "手動決済に失敗しました");
        return reply.status(500).send({
          error: err instanceof Error ? err.message : "手動決済に失敗しました",
        });
      } finally {
        markClosingDone(id);
      }
    }
  );
}
