/**
 * 手数料・スリッページシミュレーションの検証スクリプト(開発用)。
 * 実エンジンで建玉→即決済し、手数料控除後のpnlと残高整合を確認する。
 * テストデータと残高は実行後に元へ戻す。
 * 実行: npx tsx scripts/verify-fees.ts
 */
import { prisma } from "../src/db/prisma";
import { config } from "../src/config";
import { closePosition, openBuyPosition } from "../src/trading/paperTradingEngine";

const approx = (a: number, b: number, eps = 0.01) => Math.abs(a - b) < eps;

async function main() {
  const price = 1_000_000;
  const sizeJpy = 30_000;
  const feePct = config.fees.takerFeePct / 100;
  const slipPct = config.fees.slippagePct / 100;

  const jpyBefore = (await prisma.virtualBalance.findUnique({ where: { currency: "jpy" } }))?.amount;

  // --- 建玉 ---
  const opened = await openBuyPosition("btc_jpy", price, "bot_strategy", { sizeJpy });
  if (!opened.position || !opened.trade) throw new Error("建玉に失敗しました");

  const execBuy = price * (1 + slipPct);
  const expectedEntryFee = sizeJpy * feePct;
  console.log("建玉価格:", opened.position.entryPrice, "(期待:", execBuy, ")");
  console.log("建玉手数料:", opened.trade.fee, "(期待:", expectedEntryFee, ")");
  if (!approx(opened.position.entryPrice, execBuy)) throw new Error("スリッページが反映されていません");
  if (!approx(opened.trade.fee, expectedEntryFee)) throw new Error("建玉手数料が不正です");

  // --- 同値で即決済(往復コスト分だけ負けるはず) ---
  const closed = await closePosition(opened.position, price, "bot_strategy");
  const execSell = price * (1 - slipPct);
  const amount = opened.position.amount;
  const exitFee = execSell * amount * feePct;
  const expectedPnl = (execSell - execBuy) * amount - expectedEntryFee - exitFee;
  console.log("決済価格:", closed.position.closePrice, "(期待:", execSell, ")");
  console.log("決済手数料:", closed.trade.fee, "(期待:", exitFee.toFixed(2), ")");
  console.log(
    "pnl:", closed.position.pnl?.toFixed(2),
    "(期待:", expectedPnl.toFixed(2), "= 往復コスト", ((-expectedPnl / sizeJpy) * 100).toFixed(3) + "%)"
  );
  if (!approx(closed.position.pnl ?? 0, expectedPnl)) throw new Error("pnlに手数料が反映されていません");

  // --- 残高整合: 最終JPY残高 = 開始残高 + pnl ---
  const jpyAfter = (await prisma.virtualBalance.findUnique({ where: { currency: "jpy" } }))?.amount;
  if (jpyBefore !== undefined && jpyAfter !== undefined) {
    console.log("残高差分:", (jpyAfter - jpyBefore).toFixed(2), "(期待: pnlと一致)");
    if (!approx(jpyAfter - jpyBefore, closed.position.pnl ?? 0)) {
      throw new Error("残高とpnlが一致しません");
    }
  }

  // --- 後始末 ---
  await prisma.trade.deleteMany({ where: { id: { in: [opened.trade.id, closed.trade.id] } } });
  await prisma.position.delete({ where: { id: opened.position.id } });
  if (jpyBefore !== undefined) {
    await prisma.virtualBalance.update({ where: { currency: "jpy" }, data: { amount: jpyBefore } });
  }
  console.log("後始末完了");
  console.log("ALL TESTS PASSED");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
