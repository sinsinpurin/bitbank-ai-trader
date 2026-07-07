/**
 * サーキットブレーカーの動作検証スクリプト(開発用)。
 * 実DBを使うが、作成したテストデータと設定変更はすべて元に戻す。
 * 実行: npx tsx scripts/verify-circuit-breaker.ts
 */
import { prisma } from "../src/db/prisma";
import {
  getCircuitBreakerStatus,
  isBuyHalted,
  loadCircuitBreakerState,
  onPositionClosed,
  resumeTrading,
  updateCircuitBreakerSettings,
} from "../src/trading/circuitBreaker";

async function main() {
  await loadCircuitBreakerState();
  const before = getCircuitBreakerStatus();
  console.log("初期状態:", before);

  // --- テスト1: 日次最大損失で発動する ---
  await updateCircuitBreakerSettings({ enabled: true, dailyMaxLossJpy: 1 });

  const losingPosition = await prisma.position.create({
    data: {
      pair: "btc_jpy",
      side: "buy",
      entryPrice: 1000,
      amount: 1,
      closedAt: new Date(),
      closePrice: 900,
      pnl: -100,
    },
  });

  await onPositionClosed(losingPosition);
  const halted = isBuyHalted();
  console.log("日次損失テスト: halted =", halted, "/", getCircuitBreakerStatus().reason);
  if (!halted) throw new Error("日次最大損失でサーキットブレーカーが発動しませんでした");

  // --- テスト2: 手動解除できる ---
  await resumeTrading();
  console.log("手動解除テスト: halted =", isBuyHalted());
  if (isBuyHalted()) throw new Error("手動解除が効いていません");

  // --- テスト3: 戦略の連敗自動停止 ---
  await updateCircuitBreakerSettings({ dailyMaxLossJpy: 1_000_000, maxConsecutiveLosses: 2 });
  const strategy = await prisma.strategy.create({
    data: { name: "__CB_TEST__", pair: "btc_jpy", graph: '{"nodes":[],"edges":[]}', isActive: true },
  });
  const losers = [];
  for (let i = 0; i < 2; i++) {
    losers.push(
      await prisma.position.create({
        data: {
          pair: "btc_jpy",
          side: "buy",
          entryPrice: 1000,
          amount: 1,
          closedAt: new Date(Date.now() + i * 1000),
          closePrice: 990,
          pnl: -10,
          strategyId: strategy.id,
        },
      })
    );
  }
  await onPositionClosed(losers[1]);
  const after = await prisma.strategy.findUniqueOrThrow({ where: { id: strategy.id } });
  console.log("連敗自動停止テスト: isActive =", after.isActive);
  if (after.isActive) throw new Error("連敗しても戦略が自動停止されませんでした");

  // --- 後始末 ---
  await prisma.position.deleteMany({
    where: { id: { in: [losingPosition.id, ...losers.map((p) => p.id)] } },
  });
  await prisma.strategy.delete({ where: { id: strategy.id } });
  await updateCircuitBreakerSettings({ dailyMaxLossJpy: 50_000, maxConsecutiveLosses: 5 });
  await resumeTrading();
  console.log("後始末完了。最終状態:", getCircuitBreakerStatus());
  console.log("ALL TESTS PASSED");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
