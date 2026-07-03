import type { Position as PrismaPosition, Trade as PrismaTrade } from "@prisma/client";
import type { Position, Trade } from "@bitbank-ai-trader/shared";

export function toTradeEvent(trade: PrismaTrade): Trade {
  return {
    id: trade.id,
    pair: trade.pair,
    side: trade.side as Trade["side"],
    price: trade.price,
    amount: trade.amount,
    executedAt: trade.executedAt.getTime(),
    aiDecisionId: trade.aiDecisionId,
    reason: trade.reason as Trade["reason"],
  };
}

export function toPositionEvent(position: PrismaPosition): Position {
  return {
    id: position.id,
    pair: position.pair,
    side: position.side as Position["side"],
    entryPrice: position.entryPrice,
    amount: position.amount,
    openedAt: position.openedAt.getTime(),
    closedAt: position.closedAt ? position.closedAt.getTime() : null,
    closePrice: position.closePrice ?? null,
    pnl: position.pnl ?? null,
  };
}
