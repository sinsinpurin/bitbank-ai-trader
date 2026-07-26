import type { FastifyInstance } from "fastify";
import type {
  AiUsageDay,
  AiUsageSummary,
  AppSettings,
  SettingsResponse,
} from "@bitbank-ai-trader/shared";
import { prisma } from "../db/prisma";
import { config } from "../config";
import { estimateCostJpy } from "../ai/pricing";
import { isAiDecisionEnabled, setAiDecisionEnabled } from "../ai/decisionLoop";
import {
  getCircuitBreakerSettings,
  getCircuitBreakerStatus,
  resumeTrading,
  updateCircuitBreakerSettings,
} from "../trading/circuitBreaker";
import { resetPaperTrading } from "../trading/paperTradingEngine";
import { broadcast } from "../ws/relay";

const AI_DECISION_ENABLED_KEY = "aiDecisionEnabled";
const USAGE_DAYS = 30;

/** JST基準の日付キー("YYYY-MM-DD") */
function jstDateKey(date: Date): string {
  return new Date(date.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** 直近のJST日境界(00:00)に対応するUTC時刻 */
function jstTodayBoundary(): Date {
  const jstNow = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const jstMidnight = Date.UTC(jstNow.getUTCFullYear(), jstNow.getUTCMonth(), jstNow.getUTCDate());
  return new Date(jstMidnight - 9 * 60 * 60 * 1000);
}

/** 起動時に永続化された設定をdecisionLoopへ反映する */
async function loadPersistedSettings() {
  const row = await prisma.appSetting.findUnique({ where: { key: AI_DECISION_ENABLED_KEY } });
  if (row) {
    setAiDecisionEnabled(row.value === "true");
  }
}

async function buildUsageSummary(): Promise<AiUsageSummary> {
  const since = new Date(jstTodayBoundary().getTime() - (USAGE_DAYS - 1) * 24 * 60 * 60 * 1000);

  const [decisionLogs, generationLogs] = await Promise.all([
    prisma.aiDecisionLog.findMany({
      where: { createdAt: { gte: since } },
      select: { model: true, inputTokens: true, outputTokens: true, createdAt: true },
    }),
    prisma.aiGenerationLog.findMany({
      where: { createdAt: { gte: since } },
      select: { model: true, inputTokens: true, outputTokens: true, createdAt: true },
    }),
  ]);

  const dayMap = new Map<string, AiUsageDay>();
  function dayOf(createdAt: Date): AiUsageDay {
    const date = jstDateKey(createdAt);
    let day = dayMap.get(date);
    if (!day) {
      day = {
        date,
        decisionCalls: 0,
        generationCalls: 0,
        inputTokens: 0,
        outputTokens: 0,
        estimatedCostJpy: 0,
      };
      dayMap.set(date, day);
    }
    return day;
  }

  // モデルはログの行ごとに異なりうるため、行単位で単価を当てて集計する
  const todayKey = jstDateKey(new Date());
  let todayDecisionCostJpy = 0;

  for (const log of decisionLogs) {
    const day = dayOf(log.createdAt);
    const cost = estimateCostJpy(log.inputTokens, log.outputTokens, log.model || config.ai.model);
    day.decisionCalls += 1;
    day.inputTokens += log.inputTokens;
    day.outputTokens += log.outputTokens;
    day.estimatedCostJpy += cost;
    if (day.date === todayKey) todayDecisionCostJpy += cost;
  }

  for (const log of generationLogs) {
    const day = dayOf(log.createdAt);
    day.generationCalls += 1;
    day.inputTokens += log.inputTokens;
    day.outputTokens += log.outputTokens;
    day.estimatedCostJpy += estimateCostJpy(log.inputTokens, log.outputTokens, log.model);
  }

  const days = [...dayMap.values()].sort((a, b) => b.date.localeCompare(a.date));
  const totals = days.reduce(
    (acc, day) => ({
      decisionCalls: acc.decisionCalls + day.decisionCalls,
      generationCalls: acc.generationCalls + day.generationCalls,
      inputTokens: acc.inputTokens + day.inputTokens,
      outputTokens: acc.outputTokens + day.outputTokens,
      estimatedCostJpy: acc.estimatedCostJpy + day.estimatedCostJpy,
    }),
    { decisionCalls: 0, generationCalls: 0, inputTokens: 0, outputTokens: 0, estimatedCostJpy: 0 }
  );

  return {
    decisionModel: config.ai.model,
    strategyModel: config.ai.strategyModel,
    dailyBudgetJpy: config.ai.dailyBudgetJpy,
    todayDecisionCostJpy,
    budgetExceeded: todayDecisionCostJpy >= config.ai.dailyBudgetJpy,
    days,
    totals,
  };
}

function currentSettings(): AppSettings {
  const breaker = getCircuitBreakerSettings();
  return {
    aiDecisionEnabled: isAiDecisionEnabled(),
    circuitBreakerEnabled: breaker.enabled,
    dailyMaxLossJpy: breaker.dailyMaxLossJpy,
    maxConsecutiveLosses: breaker.maxConsecutiveLosses,
  };
}

export async function settingsRoutes(app: FastifyInstance) {
  await loadPersistedSettings();

  app.get("/api/settings", async (): Promise<SettingsResponse> => {
    return {
      settings: currentSettings(),
      circuitBreaker: getCircuitBreakerStatus(),
      usage: await buildUsageSummary(),
      tradingMode: config.tradingMode,
    };
  });

  app.put<{
    Body: {
      aiDecisionEnabled?: boolean;
      circuitBreakerEnabled?: boolean;
      dailyMaxLossJpy?: number;
      maxConsecutiveLosses?: number;
      /** trueで当日のサーキットブレーカー停止を手動解除する */
      resumeTrading?: boolean;
    };
  }>("/api/settings", async (request, reply) => {
    const body = request.body ?? {};

    if (
      body.aiDecisionEnabled === undefined &&
      body.circuitBreakerEnabled === undefined &&
      body.dailyMaxLossJpy === undefined &&
      body.maxConsecutiveLosses === undefined &&
      body.resumeTrading === undefined
    ) {
      return reply.status(400).send({ error: "更新する設定を1つ以上指定してください" });
    }

    try {
      if (body.aiDecisionEnabled !== undefined) {
        if (typeof body.aiDecisionEnabled !== "boolean") {
          return reply.status(400).send({ error: "aiDecisionEnabled はbooleanで指定してください" });
        }
        await prisma.appSetting.upsert({
          where: { key: AI_DECISION_ENABLED_KEY },
          update: { value: String(body.aiDecisionEnabled) },
          create: { key: AI_DECISION_ENABLED_KEY, value: String(body.aiDecisionEnabled) },
        });
        setAiDecisionEnabled(body.aiDecisionEnabled);
      }

      await updateCircuitBreakerSettings({
        enabled: body.circuitBreakerEnabled,
        dailyMaxLossJpy: body.dailyMaxLossJpy,
        maxConsecutiveLosses: body.maxConsecutiveLosses,
      });

      if (body.resumeTrading === true) {
        await resumeTrading();
      }
    } catch (err) {
      return reply
        .status(400)
        .send({ error: err instanceof Error ? err.message : "設定の更新に失敗しました" });
    }

    return { settings: currentSettings(), circuitBreaker: getCircuitBreakerStatus() };
  });

  /**
   * ペーパートレードの状態(約定履歴・ポジション・仮想残高・Botシグナル履歴)を全消去し、
   * 初期残高から再開できる状態に戻す。誤操作防止のため confirm: "RESET" を必須にする。
   * 実運用APIには一切触れないが、念のためtradingMode==="paper"のときのみ許可する。
   */
  app.post<{ Body: { confirm?: string } }>(
    "/api/settings/reset-paper-trading",
    async (request, reply) => {
      if (config.tradingMode !== "paper") {
        return reply
          .status(403)
          .send({ error: "ペーパートレードモードでのみリセットできます" });
      }
      if (request.body?.confirm !== "RESET") {
        return reply
          .status(400)
          .send({ error: '確認のため confirm: "RESET" を指定してください' });
      }

      await resetPaperTrading();
      await resumeTrading(); // 削除済みポジションに紐づくサーキットブレーカーの発動状態も解除する

      const resetAt = Date.now();
      broadcast({ type: "paper_trading_reset", payload: { resetAt } });

      return { ok: true, resetAt };
    }
  );
}
