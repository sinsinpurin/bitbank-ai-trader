import { prisma } from "../db/prisma";
import { config } from "../config";
import type { AiDecisionResult } from "../ai/claudeService";
import type { Position } from "@prisma/client";
import type { TradeReason } from "@bitbank-ai-trader/shared";

const INITIAL_JPY_BALANCE = 1_000_000;

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
 * 未決済ポジションを現在値で成行決済する。AIの売り判断・自動損切りの双方から呼ばれる共通処理。
 */
export async function closePosition(
  position: Position,
  currentPrice: number,
  reason: TradeReason,
  aiDecisionLogId?: string
) {
  const proceeds = currentPrice * position.amount;
  const pnl = (currentPrice - position.entryPrice) * position.amount;

  const [, , trade] = await prisma.$transaction([
    prisma.virtualBalance.update({
      where: { currency: "jpy" },
      data: { amount: { increment: proceeds } },
    }),
    prisma.virtualBalance.update({
      where: { currency: "btc" },
      data: { amount: { decrement: position.amount } },
    }),
    prisma.trade.create({
      data: {
        pair: position.pair,
        side: "sell",
        price: currentPrice,
        amount: position.amount,
        reason,
        aiDecisionId: aiDecisionLogId,
        positionId: position.id,
      },
    }),
  ]);

  const updatedPosition = await prisma.position.update({
    where: { id: position.id },
    data: { closedAt: new Date(), closePrice: currentPrice, pnl },
  });

  return { trade, position: updatedPosition };
}

/**
 * AIの判断(buy/sell/hold)を受け取り、仮想残高・ポジション・約定履歴を更新する。
 * 実際の注文APIへの発注は一切行わない。
 * リスク管理(ポジションサイズ上限・最大同時保有数)は config.risk に従う。
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

  if (decision.action === "sell") {
    const openPosition = await prisma.position.findFirst({
      where: { pair, side: "buy", closedAt: null },
      orderBy: { openedAt: "asc" },
    });

    if (!openPosition) {
      return { trade: null, position: null };
    }

    return closePosition(openPosition, currentPrice, "ai_decision", aiDecisionLogId);
  }

  // buy: ポジションサイズ上限・最大同時保有数のリスク制約を適用する
  const openPositionCount = await prisma.position.count({
    where: { pair, side: "buy", closedAt: null },
  });

  if (openPositionCount >= config.risk.maxOpenPositions) {
    return { trade: null, position: null };
  }

  const amount = config.risk.maxPositionJpy / currentPrice;
  const cost = currentPrice * amount;

  const jpyBalance = await prisma.virtualBalance.findUniqueOrThrow({
    where: { currency: "jpy" },
  });

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
      data: { amount: { increment: amount } },
    }),
    prisma.position.create({
      data: { pair, side: "buy", entryPrice: currentPrice, amount },
    }),
    prisma.trade.create({
      data: {
        pair,
        side: "buy",
        price: currentPrice,
        amount,
        reason: "ai_decision",
        aiDecisionId: aiDecisionLogId,
      },
    }),
  ]);

  return { trade, position };
}
