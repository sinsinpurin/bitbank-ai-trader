import { prisma } from "../db/prisma";
import { broadcast } from "../ws/relay";
import { config } from "../config";
import { closePosition } from "./paperTradingEngine";
import type { Position, Trade } from "@bitbank-ai-trader/shared";

// 決済処理が完了するまでの間、同一ポジションを二重に決済しないためのガード
const closingInFlight = new Set<string>();

/**
 * 保有中の全ポジションを現在値で評価し、含み損が stopLossPct を超えていれば
 * AIの判断を待たずに成行決済する。Claude APIは呼ばないためトークン課金は発生しない。
 */
export async function checkStopLosses(pair: string, currentPrice: number) {
  const openPositions = await prisma.position.findMany({
    where: { pair, side: "buy", closedAt: null },
  });

  for (const position of openPositions) {
    if (closingInFlight.has(position.id)) continue;

    const lossPct = ((currentPrice - position.entryPrice) / position.entryPrice) * 100;
    if (lossPct > -config.risk.stopLossPct) continue;

    closingInFlight.add(position.id);
    try {
      const result = await closePosition(position, currentPrice, "stop_loss");

      console.info(
        `[riskManager] 損切り執行: position=${position.id} entry=${position.entryPrice} current=${currentPrice} (${lossPct.toFixed(2)}%)`
      );

      const tradeEvent: Trade = {
        id: result.trade.id,
        pair: result.trade.pair,
        side: result.trade.side as Trade["side"],
        price: result.trade.price,
        amount: result.trade.amount,
        executedAt: result.trade.executedAt.getTime(),
        aiDecisionId: result.trade.aiDecisionId,
        reason: result.trade.reason as Trade["reason"],
      };
      broadcast({ type: "trade", payload: tradeEvent });

      const positionEvent: Position = {
        id: result.position.id,
        pair: result.position.pair,
        side: result.position.side as Position["side"],
        entryPrice: result.position.entryPrice,
        amount: result.position.amount,
        openedAt: result.position.openedAt.getTime(),
        closedAt: result.position.closedAt ? result.position.closedAt.getTime() : null,
        closePrice: result.position.closePrice ?? null,
        pnl: result.position.pnl ?? null,
      };
      broadcast({ type: "position_update", payload: positionEvent });
    } catch (err) {
      console.error("[riskManager] 損切り執行中にエラーが発生しました", err);
    } finally {
      closingInFlight.delete(position.id);
    }
  }
}
