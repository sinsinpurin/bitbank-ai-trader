import { getAiDecision, type MarketSnapshot } from "./claudeService";
import { applyAiDecision } from "../trading/paperTradingEngine";
import { prisma } from "../db/prisma";
import { broadcast } from "../ws/relay";
import { config, MODEL_PRICING } from "../config";
import type { AiDecision, AiUsageStats, Position, Trade } from "@bitbank-ai-trader/shared";

const priceHistory: number[] = [];
const HISTORY_LIMIT = 20;

let lastDecisionPrice: number | null = null;
let lastDecisionAt = 0;

export function recordPrice(price: number) {
  priceHistory.push(price);
  if (priceHistory.length > HISTORY_LIMIT) {
    priceHistory.shift();
  }
}

/** 直近のJST日境界(00:00)に対応するUTC時刻を返す */
function jstDayBoundary(): { utcBoundary: Date; dateLabel: string } {
  const now = new Date();
  const jstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const y = jstNow.getUTCFullYear();
  const m = jstNow.getUTCMonth();
  const d = jstNow.getUTCDate();
  const jstMidnight = Date.UTC(y, m, d, 0, 0, 0);
  const utcBoundary = new Date(jstMidnight - 9 * 60 * 60 * 1000);
  const dateLabel = `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  return { utcBoundary, dateLabel };
}

function pricingFor(model: string) {
  return MODEL_PRICING[model] ?? MODEL_PRICING["claude-haiku-4-5"];
}

function estimateCostJpy(inputTokens: number, outputTokens: number, model: string): number {
  const pricing = pricingFor(model);
  const usd =
    (inputTokens / 1_000_000) * pricing.inputPerMTok + (outputTokens / 1_000_000) * pricing.outputPerMTok;
  return usd * config.ai.usdJpyRate;
}

async function getUsageStats(): Promise<AiUsageStats> {
  const { utcBoundary, dateLabel } = jstDayBoundary();

  const agg = await prisma.aiDecisionLog.aggregate({
    where: { createdAt: { gte: utcBoundary } },
    _sum: { inputTokens: true, outputTokens: true },
    _count: { id: true },
  });

  const inputTokens = agg._sum.inputTokens ?? 0;
  const outputTokens = agg._sum.outputTokens ?? 0;
  const callCount = agg._count.id;
  const estimatedCostJpy = estimateCostJpy(inputTokens, outputTokens, config.ai.model);

  return {
    date: dateLabel,
    model: config.ai.model,
    callCount,
    inputTokens,
    outputTokens,
    estimatedCostJpy,
    dailyBudgetJpy: config.ai.dailyBudgetJpy,
    budgetExceeded: estimatedCostJpy >= config.ai.dailyBudgetJpy,
  };
}

function shouldCallNow(currentPrice: number, now: number): boolean {
  if (now - lastDecisionAt < config.ai.minCallIntervalMs) {
    return false;
  }
  if (now - lastDecisionAt >= config.ai.maxCallIntervalMs) {
    return true;
  }
  if (lastDecisionPrice === null) {
    return true;
  }
  const changePct = (Math.abs(currentPrice - lastDecisionPrice) / lastDecisionPrice) * 100;
  return changePct >= config.ai.priceChangeThresholdPct;
}

export function startDecisionLoop() {
  const interval = setInterval(async () => {
    if (priceHistory.length === 0) return;

    const last = priceHistory[priceHistory.length - 1];

    try {
      const usage = await getUsageStats();
      broadcast({ type: "usage_stats", payload: usage });

      if (usage.budgetExceeded) {
        console.info(
          `[decisionLoop] 本日の推定コスト(${usage.estimatedCostJpy.toFixed(2)}円)が予算(${usage.dailyBudgetJpy}円)を超過したため、AI呼び出しをスキップします`
        );
        return;
      }

      const now = Date.now();
      if (!shouldCallNow(last, now)) {
        return;
      }

      const snapshot: MarketSnapshot = {
        pair: config.targetPair,
        last,
        high24h: Math.max(...priceHistory),
        low24h: Math.min(...priceHistory),
        vol24h: 0,
        recentPrices: [...priceHistory],
      };

      const decision = await getAiDecision(snapshot);

      const log = await prisma.aiDecisionLog.create({
        data: {
          pair: snapshot.pair,
          action: decision.action,
          confidence: decision.confidence,
          reasoning: decision.reasoning,
          model: decision.usage.model,
          inputTokens: decision.usage.inputTokens,
          outputTokens: decision.usage.outputTokens,
        },
      });

      lastDecisionPrice = last;
      lastDecisionAt = now;

      const aiDecisionEvent: AiDecision = {
        id: log.id,
        pair: log.pair,
        action: decision.action,
        confidence: decision.confidence,
        reasoning: decision.reasoning,
        createdAt: log.createdAt.getTime(),
      };
      broadcast({ type: "ai_decision", payload: aiDecisionEvent });

      const result = await applyAiDecision(snapshot.pair, last, decision, log.id);

      if (result.trade) {
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
      }

      if (result.position) {
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
      }
    } catch (err) {
      console.error("[decisionLoop] AI判断中にエラーが発生しました", err);
    }
  }, config.ai.pollIntervalMs);

  return () => clearInterval(interval);
}
