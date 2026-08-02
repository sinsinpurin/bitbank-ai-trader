import type { FastifyInstance } from "fastify";
import { getPnlSummary } from "./summary";
import { generateTradeReview } from "../ai/reviewGenerator";
import { getAnthropicApiKey } from "../ai/anthropicClient";

export async function pnlRoutes(app: FastifyInstance) {
  app.get("/api/pnl", async () => getPnlSummary());

  // 過去の取引実績をAIにレビューさせる(ユーザー操作起点の単発呼び出し)
  app.post("/api/pnl/review", async (request, reply) => {
    if (!getAnthropicApiKey()) {
      return reply.status(503).send({
        error:
          "Anthropic APIキーが設定されていないため、レビューは利用できません。Settings画面から設定してください",
      });
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
