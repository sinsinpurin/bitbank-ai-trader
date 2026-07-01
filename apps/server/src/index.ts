import Fastify from "fastify";
import fastifyWebsocket from "@fastify/websocket";
import { config } from "./config";
import { subscribeTicker } from "./bitbank/publicStream";
import { registerClient, broadcast } from "./ws/relay";
import { recordPrice, startDecisionLoop } from "./ai/decisionLoop";

async function main() {
  const app = Fastify({ logger: true });
  await app.register(fastifyWebsocket);

  app.get("/health", async () => ({ status: "ok" }));

  app.register(async (instance) => {
    instance.get("/ws", { websocket: true }, (socket) => {
      registerClient(socket);
    });
  });

  subscribeTicker(config.targetPair, (ticker) => {
    recordPrice(ticker.last);
    broadcast({ type: "ticker", payload: ticker });
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
