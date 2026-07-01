import { prisma } from "../db/prisma";
import type { AiDecisionResult } from "../ai/claudeService";

const INITIAL_JPY_BALANCE = 1_000_000;
const TRADE_AMOUNT_BTC = 0.001; // 1回の売買で動かす仮想数量(固定・簡易版)

async function ensureInitialBalance() {
  await prisma.virtualBalance.upsert({
    where: { currency: "jpy" },
    update: {},
    create: { currency: "jpy", amount: INITIAL_JPY_BALANCE },
  });
  await prisma.virtualBalance.upsert({
    where: { currency: "btc" },
    update: {},
    create: { currency: "btc", amount: 0 },
  });
}

/**
 * AIの判断(buy/sell/hold)を受け取り、仮想残高・ポジション・約定履歴を更新する。
 * 実際の注文APIへの発注は一切行わない。
 */
export async function applyAiDecision(
  pair: string,
  currentPrice: number,
  decision: AiDecisionResult,
  aiDecisionLogId: string
) {
  await ensureInitialBalance();

  if (decision.action === "hold") {
    return { trade: null, position: null };
  }

  const jpyBalance = await prisma.virtualBalance.findUniqueOrThrow({
    where: { currency: "jpy" },
  });
  const btcBalance = await prisma.virtualBalance.findUniqueOrThrow({
    where: { currency: "btc" },
  });

  const cost = currentPrice * TRADE_AMOUNT_BTC;

  if (decision.action === "buy") {
    if (jpyBalance.amount < cost) {
      return { trade: null, position: null };
    }

    const [, , position, trade] = await prisma.$transaction([
      prisma.virtualBalance.update({
        where: { currency: "jpy" },
        data: { amount: { decrement: cost } },
      }),
      prisma.virtualBalance.update({
        where: { currency: "btc" },
        data: { amount: { increment: TRADE_AMOUNT_BTC } },
      }),
      prisma.position.create({
        data: {
          pair,
          side: "buy",
          entryPrice: currentPrice,
          amount: TRADE_AMOUNT_BTC,
        },
      }),
      prisma.trade.create({
        data: {
          pair,
          side: "buy",
          price: currentPrice,
          amount: TRADE_AMOUNT_BTC,
          aiDecisionId: aiDecisionLogId,
        },
      }),
    ]);

    return { trade, position };
  }

  // sell: 保有中の未決済ポジションを成行クローズする簡易ロジック
  if (btcBalance.amount < TRADE_AMOUNT_BTC) {
    return { trade: null, position: null };
  }

  const openPosition = await prisma.position.findFirst({
    where: { pair, side: "buy", closedAt: null },
    orderBy: { openedAt: "asc" },
  });

  const pnl = openPosition
    ? (currentPrice - openPosition.entryPrice) * openPosition.amount
    : null;

  const [, , trade] = await prisma.$transaction([
    prisma.virtualBalance.update({
      where: { currency: "jpy" },
      data: { amount: { increment: cost } },
    }),
    prisma.virtualBalance.update({
      where: { currency: "btc" },
      data: { amount: { decrement: TRADE_AMOUNT_BTC } },
    }),
    prisma.trade.create({
      data: {
        pair,
        side: "sell",
        price: currentPrice,
        amount: TRADE_AMOUNT_BTC,
        aiDecisionId: aiDecisionLogId,
        positionId: openPosition?.id,
      },
    }),
  ]);

  if (openPosition) {
    await prisma.position.update({
      where: { id: openPosition.id },
      data: {
        closedAt: new Date(),
        closePrice: currentPrice,
        pnl,
      },
    });
  }

  return { trade, position: openPosition };
}
