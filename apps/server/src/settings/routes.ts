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
  return { aiDecisionEnabled: isAiDecisionEnabled() };
}

export async function settingsRoutes(app: FastifyInstance) {
  await loadPersistedSettings();

  app.get("/api/settings", async (): Promise<SettingsResponse> => {
    return { settings: currentSettings(), usage: await buildUsageSummary() };
  });

  app.put<{ Body: { aiDecisionEnabled?: boolean } }>(
    "/api/settings",
    async (request, reply): Promise<AppSettings | void> => {
      const { aiDecisionEnabled } = request.body ?? {};
      if (typeof aiDecisionEnabled !== "boolean") {
        return reply.status(400).send({ error: "aiDecisionEnabled (boolean) は必須です" });
      }

      await prisma.appSetting.upsert({
        where: { key: AI_DECISION_ENABLED_KEY },
        update: { value: String(aiDecisionEnabled) },
        create: { key: AI_DECISION_ENABLED_KEY, value: String(aiDecisionEnabled) },
      });
      setAiDecisionEnabled(aiDecisionEnabled);

      return currentSettings();
    }
  );
}
