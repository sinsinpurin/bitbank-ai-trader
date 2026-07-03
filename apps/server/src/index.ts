import Fastify from "fastify";
import fastifyWebsocket from "@fastify/websocket";
import fastifyCors from "@fastify/cors";
import { config } from "./config";
import { prisma } from "./db/prisma";
import { subscribeTicker } from "./bitbank/publicStream";
import { registerClient, broadcast } from "./ws/relay";
import { recordPrice, startDecisionLoop } from "./ai/decisionLoop";
import { checkStopLosses } from "./trading/riskManager";
import {
  getCandleHistory,
  onTick,
  reloadActiveStrategies,
  seedCandleHistory,
} from "./strategy/botEngine";
import { strategyRoutes } from "./strategy/routes";
import type { Trade } from "@bitbank-ai-trader/shared";

async function main() {
  const app = Fastify({ logger: true });
  await app.register(fastifyWebsocket);
  await app.register(fastifyCors, { origin: true });

  app.get("/health", async () => ({ status: "ok" }));

  app.get<{ Querystring: { limit?: string } }>("/api/trades", async (request) => {
    const limit = Math.min(Number(request.query.limit) || 30, 100);
    const trades = await prisma.trade.findMany({
      orderBy: { executedAt: "desc" },
      take: limit,
    });

    return trades.map(
      (t): Trade => ({
        id: t.id,
        pair: t.pair,
        side: t.side as Trade["side"],
        price: t.price,
        amount: t.amount,
        executedAt: t.executedAt.getTime(),
        aiDecisionId: t.aiDecisionId,
        reason: t.reason as Trade["reason"],
      })
    );
  });

  // Bot/エディタ共用の1分足終値履歴(エディタのライブ評価に使う)
  app.get("/api/candles", async () => {
    const candles = getCandleHistory();
    return {
      pair: config.targetPair,
      times: candles.map((c) => c.time),
      closes: candles.map((c) => c.close),
    };
  });

  await app.register(strategyRoutes);

  app.register(async (instance) => {
    instance.get("/ws", { websocket: true }, (socket) => {
      registerClient(socket);
    });
  });

  await reloadActiveStrategies();
  await seedCandleHistory(config.targetPair);

  subscribeTicker(config.targetPair, (ticker) => {
    recordPrice(ticker.last);
    broadcast({ type: "ticker", payload: ticker });
    checkStopLosses(ticker.pair, ticker.last).catch((err) =>
      app.log.error(err, "損切りチェックに失敗しました")
    );
    onTick(ticker.pair, ticker.last, ticker.timestamp).catch((err) =>
      app.log.error(err, "Bot戦略の評価に失敗しました")
    );
  });

  const stopDecisionLoop = startDecisionLoop();

  await app.listen({ port: config.port, host: "0.0.0.0" });

  process.on("SIGINT", () => {
    stopDecisionLoop();
    app.close().finally(() => process.exit(0));
  });
}

main().catch((err) => {
  console.error("サーバー起動に失敗しました", err);
  process.exit(1);
});
