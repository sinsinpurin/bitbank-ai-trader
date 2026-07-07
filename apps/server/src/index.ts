import Fastify from "fastify";
import fastifyWebsocket from "@fastify/websocket";
import fastifyCors from "@fastify/cors";
import { config } from "./config";
import { prisma } from "./db/prisma";
import { subscribeTickers } from "./bitbank/publicStream";
import { registerClient, broadcast } from "./ws/relay";
import { recordPrice, startDecisionLoop } from "./ai/decisionLoop";
import { checkExits } from "./trading/riskManager";
import {
  loadCircuitBreakerState,
  registerOnStrategiesChanged,
} from "./trading/circuitBreaker";
import {
  getCandleHistory,
  onTick,
  reloadActiveStrategies,
  seedCandleHistory,
} from "./strategy/botEngine";
import { strategyRoutes } from "./strategy/routes";
import { pnlRoutes } from "./pnl/routes";
import { settingsRoutes } from "./settings/routes";
import type { Trade } from "@bitbank-ai-trader/shared";

async function main() {
  const app = Fastify({ logger: true });
  await app.register(fastifyWebsocket);
  // @fastify/corsのデフォルトはGET,HEAD,POSTのみ。PUT/DELETE(設定トグル・戦略更新/削除)も許可する
  await app.register(fastifyCors, {
    origin: true,
    methods: ["GET", "HEAD", "POST", "PUT", "DELETE", "OPTIONS"],
  });

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

  // 取引対象ペアの一覧(Webのペアセレクタ用)
  app.get("/api/pairs", async () => ({
    pairs: config.targetPairs,
    primaryPair: config.targetPair,
  }));

  // Bot/エディタ共用の1分足終値履歴(エディタのライブ評価に使う)
  app.get<{ Querystring: { pair?: string } }>("/api/candles", async (request, reply) => {
    const pair = request.query.pair ?? config.targetPair;
    if (!config.targetPairs.includes(pair)) {
      return reply.status(400).send({ error: `未対応のペアです: ${pair}` });
    }
    const candles = getCandleHistory(pair);
    return {
      pair,
      times: candles.map((c) => c.time),
      closes: candles.map((c) => c.close),
    };
  });

  await app.register(strategyRoutes);
  await app.register(pnlRoutes);
  await app.register(settingsRoutes);

  app.register(async (instance) => {
    instance.get("/ws", { websocket: true }, (socket) => {
      registerClient(socket);
    });
  });

  await loadCircuitBreakerState();
  registerOnStrategiesChanged(reloadActiveStrategies);
  await reloadActiveStrategies();
  await Promise.all(config.targetPairs.map((pair) => seedCandleHistory(pair)));

  subscribeTickers(config.targetPairs, (ticker) => {
    // AI売買判断ループはメインペアのみ対象(ペア数分のClaude呼び出しコスト増を防ぐ)
    if (ticker.pair === config.targetPair) {
      recordPrice(ticker.last);
    }
    broadcast({ type: "ticker", payload: ticker });
    checkExits(ticker.pair, ticker.last).catch((err) =>
      app.log.error(err, "出口条件チェックに失敗しました")
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
