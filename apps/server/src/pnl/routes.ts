import type { FastifyInstance } from "fastify";
import { config } from "../config";
import { getPnlSummary } from "./summary";
import { generateTradeReview } from "../ai/reviewGenerator";

export async function pnlRoutes(app: FastifyInstance) {
  app.get("/api/pnl", async () => getPnlSummary());

  // 過去の取引実績をAIにレビューさせる(ユーザー操作起点の単発呼び出し)
  app.post("/api/pnl/review", async (request, reply) => {
    if (!config.anthropic.apiKey) {
      return reply
        .status(503)
        .send({ error: "ANTHROPIC_API_KEY が設定されていないため、レビューは利用できません" });
    }

    const summary = await getPnlSummary();
    if (summary.closedPositions.length === 0) {
      return reply.status(400).send({ error: "レビュー対象の決済済み取引がまだありません" });
    }

    try {
      return await generateTradeReview(summary);
    } catch (err) {
      request.log.error(err, "取引レビューの生成に失敗しました");
      return reply.status(502).send({
        error: err instanceof Error ? err.message : "取引レビューの生成に失敗しました",
      });
    }
  });
}
