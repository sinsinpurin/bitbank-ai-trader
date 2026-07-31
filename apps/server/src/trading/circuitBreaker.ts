import type { Position as PrismaPosition } from "@prisma/client";
import type { CircuitBreakerStatus } from "@noctas/shared";
import { prisma } from "../db/prisma";

/**
 * サーキットブレーカー。
 * - 本日(JST)の実現損失が dailyMaxLossJpy を超えたら、その日の新規買いを全停止する(決済は止めない)
 * - 戦略が maxConsecutiveLosses 回連続で負けたら、その戦略を自動でStandby(isActive=false)にする
 * 発動状態はAppSettingに永続化し、サーバー再起動後も当日中は維持される。
 */

const ENABLED_KEY = "circuitBreakerEnabled";
const DAILY_MAX_LOSS_KEY = "dailyMaxLossJpy";
const MAX_CONSEC_LOSSES_KEY = "maxConsecutiveLosses";
const HALT_KEY = "tradingHalt";

export interface CircuitBreakerSettings {
  enabled: boolean;
  dailyMaxLossJpy: number;
  maxConsecutiveLosses: number;
}

const settings: CircuitBreakerSettings = {
  enabled: true,
  dailyMaxLossJpy: 50_000,
  maxConsecutiveLosses: 5,
};

interface HaltState {
  date: string; // JST "YYYY-MM-DD"
  reason: string;
  haltedAt: number;
}

let halt: HaltState | null = null;

// 戦略の自動停止後にbotEngineへ再読込を伝えるコールバック(循環import回避のため登録制)
let onStrategiesChanged: (() => Promise<void>) | null = null;

export function registerOnStrategiesChanged(cb: () => Promise<void>) {
  onStrategiesChanged = cb;
}

function jstDateKey(date = new Date()): string {
  return new Date(date.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** 直近のJST日境界(00:00)に対応するUTC時刻 */
function jstTodayBoundary(): Date {
  const jstNow = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const jstMidnight = Date.UTC(jstNow.getUTCFullYear(), jstNow.getUTCMonth(), jstNow.getUTCDate());
  return new Date(jstMidnight - 9 * 60 * 60 * 1000);
}

/** 起動時に永続化された設定・発動状態を読み込む */
export async function loadCircuitBreakerState() {
  const rows = await prisma.appSetting.findMany({
    where: { key: { in: [ENABLED_KEY, DAILY_MAX_LOSS_KEY, MAX_CONSEC_LOSSES_KEY, HALT_KEY] } },
  });
  for (const row of rows) {
    if (row.key === ENABLED_KEY) settings.enabled = row.value === "true";
    if (row.key === DAILY_MAX_LOSS_KEY) {
      const v = Number(row.value);
      if (Number.isFinite(v) && v > 0) settings.dailyMaxLossJpy = v;
    }
    if (row.key === MAX_CONSEC_LOSSES_KEY) {
      const v = Number(row.value);
      if (Number.isInteger(v) && v >= 2) settings.maxConsecutiveLosses = v;
    }
    if (row.key === HALT_KEY) {
      try {
        halt = JSON.parse(row.value) as HaltState;
      } catch {
        halt = null;
      }
    }
  }
  if (halt && halt.date !== jstDateKey()) {
    halt = null; // 日付が変わっていれば自動解除
  }
  if (halt) {
    console.warn(`[circuitBreaker] 発動状態で起動しました: ${halt.reason}`);
  }
}

async function persistSetting(key: string, value: string) {
  await prisma.appSetting.upsert({
    where: { key },
    update: { value },
    create: { key, value },
  });
}

export function getCircuitBreakerSettings(): CircuitBreakerSettings {
  return { ...settings };
}

export async function updateCircuitBreakerSettings(input: Partial<CircuitBreakerSettings>) {
  if (input.enabled !== undefined) {
    settings.enabled = input.enabled;
    await persistSetting(ENABLED_KEY, String(input.enabled));
  }
  if (input.dailyMaxLossJpy !== undefined) {
    if (!Number.isFinite(input.dailyMaxLossJpy) || input.dailyMaxLossJpy <= 0) {
      throw new Error("dailyMaxLossJpy は正の数値で指定してください");
    }
    settings.dailyMaxLossJpy = input.dailyMaxLossJpy;
    await persistSetting(DAILY_MAX_LOSS_KEY, String(input.dailyMaxLossJpy));
  }
  if (input.maxConsecutiveLosses !== undefined) {
    if (!Number.isInteger(input.maxConsecutiveLosses) || input.maxConsecutiveLosses < 2) {
      throw new Error("maxConsecutiveLosses は2以上の整数で指定してください");
    }
    settings.maxConsecutiveLosses = input.maxConsecutiveLosses;
    await persistSetting(MAX_CONSEC_LOSSES_KEY, String(input.maxConsecutiveLosses));
  }
}

export function getCircuitBreakerStatus(): CircuitBreakerStatus {
  const active = halt !== null && halt.date === jstDateKey();
  return {
    halted: active,
    reason: active && halt ? halt.reason : null,
    haltedAt: active && halt ? halt.haltedAt : null,
  };
}

/** 新規買いを止めるべきか(発動中かつ当日) */
export function isBuyHalted(): boolean {
  if (!settings.enabled) return false;
  return halt !== null && halt.date === jstDateKey();
}

/** 手動で当日の停止を解除する */
export async function resumeTrading() {
  halt = null;
  await persistSetting(HALT_KEY, "");
  console.info("[circuitBreaker] 手動で停止を解除しました");
}

async function triggerHalt(reason: string) {
  halt = { date: jstDateKey(), reason, haltedAt: Date.now() };
  await persistSetting(HALT_KEY, JSON.stringify(halt));
  console.warn(`[circuitBreaker] 発動: ${reason}`);
}

/**
 * ポジション決済のたびに呼ばれる判定。
 * paperTradingEngine.closePosition から呼ばれる。
 */
export async function onPositionClosed(position: PrismaPosition) {
  if (!settings.enabled) return;

  // --- 日次最大損失 ---
  if (!isBuyHalted()) {
    const agg = await prisma.position.aggregate({
      where: { closedAt: { gte: jstTodayBoundary() } },
      _sum: { pnl: true },
    });
    const todayPnl = agg._sum.pnl ?? 0;
    if (todayPnl <= -settings.dailyMaxLossJpy) {
      await triggerHalt(
        `本日の実現損失が ¥${Math.round(-todayPnl).toLocaleString("ja-JP")} に達したため、新規買いを停止しました(上限 ¥${settings.dailyMaxLossJpy.toLocaleString("ja-JP")})`
      );
    }
  }

  // --- 戦略の連敗自動停止 ---
  if (!position.strategyId) return;
  const recent = await prisma.position.findMany({
    where: { strategyId: position.strategyId, closedAt: { not: null } },
    orderBy: { closedAt: "desc" },
    take: settings.maxConsecutiveLosses,
    select: { pnl: true },
  });
  if (
    recent.length >= settings.maxConsecutiveLosses &&
    recent.every((p) => (p.pnl ?? 0) < 0)
  ) {
    const strategy = await prisma.strategy.findUnique({ where: { id: position.strategyId } });
    if (strategy && strategy.isActive) {
      await prisma.strategy.update({
        where: { id: strategy.id },
        data: { isActive: false },
      });
      console.warn(
        `[circuitBreaker] 戦略 "${strategy.name}" が${settings.maxConsecutiveLosses}連敗したため自動停止しました`
      );
      if (onStrategiesChanged) {
        await onStrategiesChanged().catch(() => {});
      }
    }
  }
}
