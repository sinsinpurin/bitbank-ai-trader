import { randomUUID } from "node:crypto";
import { prisma } from "../db/prisma";
import { broadcast } from "../ws/relay";
import { config } from "../config";
import { closeOldestPosition, openBuyPosition } from "../trading/paperTradingEngine";
import { isBuyHalted } from "../trading/circuitBreaker";
import { toPositionEvent, toTradeEvent } from "../trading/mappers";
import {
  evaluateGraph,
  parseGraph,
  type BotSignal,
  type OrderSide,
  type StrategyGraph,
} from "@bitbank-ai-trader/shared";

/**
 * Bot戦略の実行エンジン(マルチペア対応)。
 * ペアごとにティッカーを1分足の終値シリーズへ集約し、そのペアのアクティブ戦略グラフを評価して
 * 条件の立ち上がり(false→true)でペーパートレードを執行する。
 */

interface CandleBucket {
  time: number; // 分単位のエポック秒
  open: number;
  high: number;
  low: number;
  close: number;
}

// 保持する1分足の本数(シード日数分+バッファ)
const HISTORY_LIMIT = config.candles.seedDays * 1440 + 120;

interface PairCandleState {
  // 確定済みの1分足終値。末尾に「形成中の現在値」を加えた配列で評価する
  closed: CandleBucket[];
  forming: CandleBucket | null;
}

const candleStore = new Map<string, PairCandleState>();

function stateFor(pair: string): PairCandleState {
  let state = candleStore.get(pair);
  if (!state) {
    state = { closed: [], forming: null };
    candleStore.set(pair, state);
  }
  return state;
}

interface ActiveStrategy {
  id: string;
  name: string;
  pair: string;
  graph: StrategyGraph;
  /** 戦略ごとのリスク設定(nullはグローバル設定へフォールバック) */
  positionSizeJpy: number | null;
  maxOpenPositions: number | null;
  stopLossPct: number | null;
  takeProfitPct: number | null;
  trailingStopPct: number | null;
}

let activeStrategies: ActiveStrategy[] = [];

// 戦略ごとの直近発火時刻(連続発火を防ぐクールダウン)
const lastFiredAt = new Map<string, number>();
// ペアごとの評価中フラグ(同一ペアの評価が重ならないようにする)
const evaluatingPairs = new Set<string>();

interface CandlestickResponse {
  success: 0 | 1;
  data: {
    candlestick: { type: string; ohlcv: [string, string, string, string, string, number][] }[];
  };
}

function jstDateLabel(offsetDays: number): string {
  const jst = new Date(Date.now() + 9 * 60 * 60 * 1000 + offsetDays * 24 * 60 * 60 * 1000);
  const y = jst.getUTCFullYear();
  const m = String(jst.getUTCMonth() + 1).padStart(2, "0");
  const d = String(jst.getUTCDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

/**
 * bitbank公開REST(1分足)で指定ペアのOHLC履歴を初期化する。
 * 起動直後からチャート表示・SMA/RSI等の指標計算・戦略評価を使えるようにするため、
 * CANDLE_SEED_DAYS日分(既定3日)を日付ごとに取得する。
 * 取得失敗時は空のまま起動し、ティッカーから履歴を積み上げる。
 */
export async function seedCandleHistory(pair: string) {
  try {
    const candles: CandleBucket[] = [];
    // 今日(部分)+過去seedDays日分を取得し、直近HISTORY_LIMIT本へ切り詰める
    const offsets = Array.from({ length: config.candles.seedDays + 1 }, (_, i) => i - config.candles.seedDays);
    const responses = await Promise.all(
      offsets.map(async (offset) => {
        try {
          const date = jstDateLabel(offset);
          const res = await fetch(`https://public.bitbank.cc/${pair}/candlestick/1min/${date}`);
          if (!res.ok) return null;
          const json = (await res.json()) as CandlestickResponse;
          return json.success === 1 ? json : null;
        } catch {
          return null;
        }
      })
    );

    for (const json of responses) {
      if (!json) continue;
      for (const entry of json.data.candlestick) {
        for (const [open, high, low, close, , ts] of entry.ohlcv) {
          candles.push({
            time: Math.floor(ts / 1000 / 60) * 60,
            open: Number(open),
            high: Number(high),
            low: Number(low),
            close: Number(close),
          });
        }
      }
    }

    if (candles.length === 0) {
      console.warn(
        `[botEngine] ${pair} のローソク足履歴を取得できませんでした。ティッカーから積み上げます`
      );
      return;
    }

    candles.sort((a, b) => a.time - b.time);
    const state = stateFor(pair);
    state.closed = candles.slice(-HISTORY_LIMIT);
    state.forming = null;
    console.info(
      `[botEngine] ${pair} の1分足履歴を${state.closed.length}本シードしました(${config.candles.seedDays}日分設定)`
    );
  } catch (err) {
    console.warn(`[botEngine] ${pair} のローソク足履歴のシードに失敗しました`, err);
  }
}

/** 指定ペアの1分足終値履歴(確定足+形成中)を返す */
export function getCandleHistory(pair: string): CandleBucket[] {
  const state = candleStore.get(pair);
  if (!state) return [];
  const series = [...state.closed];
  if (state.forming) series.push(state.forming);
  return series;
}

/** DBからアクティブ戦略を読み直す。戦略の作成・更新・有効化時に呼ぶ */
export async function reloadActiveStrategies() {
  const rows = await prisma.strategy.findMany({ where: { isActive: true } });
  activeStrategies = rows.flatMap((row) => {
    const graph = parseGraph(row.graph);
    if (!graph) {
      console.warn(`[botEngine] 戦略 "${row.name}" のグラフをパースできないためスキップします`);
      return [];
    }
    if (!config.targetPairs.includes(row.pair)) {
      console.warn(
        `[botEngine] 戦略 "${row.name}" のペア ${row.pair} は購読対象外(TARGET_PAIRS)のためスキップします`
      );
      return [];
    }
    return [
      {
        id: row.id,
        name: row.name,
        pair: row.pair,
        graph,
        positionSizeJpy: row.positionSizeJpy,
        maxOpenPositions: row.maxOpenPositions,
        stopLossPct: row.stopLossPct,
        takeProfitPct: row.takeProfitPct,
        trailingStopPct: row.trailingStopPct,
      },
    ];
  });
  console.info(`[botEngine] アクティブ戦略を再読込しました (${activeStrategies.length}件)`);
}

function recordCandle(state: PairCandleState, price: number, timestampMs: number) {
  const bucketTime = Math.floor(timestampMs / 1000 / 60) * 60;

  if (!state.forming || state.forming.time === bucketTime) {
    if (!state.forming) {
      // シード済み履歴と現在の分が重複しないよう、同じ分以降の確定足を取り除く
      while (state.closed.length > 0 && state.closed[state.closed.length - 1].time >= bucketTime) {
        state.closed.pop();
      }
      state.forming = { time: bucketTime, open: price, high: price, low: price, close: price };
      return;
    }
    state.forming = {
      ...state.forming,
      high: Math.max(state.forming.high, price),
      low: Math.min(state.forming.low, price),
      close: price,
    };
    return;
  }

  // 分が進んだので直前の足を確定する
  state.closed.push(state.forming);
  if (state.closed.length > HISTORY_LIMIT) {
    state.closed.shift();
  }
  state.forming = { time: bucketTime, open: price, high: price, low: price, close: price };
}

function closeSeries(state: PairCandleState): number[] {
  const series = state.closed.map((c) => c.close);
  if (state.forming) series.push(state.forming.close);
  return series;
}

async function fireSignal(
  strategy: ActiveStrategy,
  pair: string,
  price: number,
  action: OrderSide
) {
  const buyBlockedByBreaker = action === "buy" && isBuyHalted();
  const result =
    action === "buy"
      ? await openBuyPosition(pair, price, "bot_strategy", {
          strategyId: strategy.id,
          sizeJpy: strategy.positionSizeJpy,
          maxOpenPositions: strategy.maxOpenPositions,
          stopLossPct: strategy.stopLossPct,
          takeProfitPct: strategy.takeProfitPct,
          trailingStopPct: strategy.trailingStopPct,
        })
      : await closeOldestPosition(pair, price, "bot_strategy", { strategyId: strategy.id });

  const executed = result.trade !== null;
  const note = executed
    ? `${action.toUpperCase()} 条件が成立し、約定しました`
    : action === "buy"
      ? buyBlockedByBreaker
        ? "BUY 条件が成立しましたが、サーキットブレーカー発動中のため見送りました"
        : "BUY 条件が成立しましたが、リスク制約(ポジション数・残高)により見送りました"
      : "SELL 条件が成立しましたが、この戦略の決済対象ポジションがありません";

  const signal: BotSignal = {
    id: randomUUID(),
    strategyId: strategy.id,
    strategyName: strategy.name,
    pair,
    action,
    price,
    triggeredAt: Date.now(),
    executed,
    note,
  };

  console.info(
    `[botEngine] ${strategy.name} (${pair}): ${action} シグナル (price=${price}, executed=${executed})`
  );
  broadcast({ type: "bot_signal", payload: signal });

  // リロード後もフィードで参照できるよう発火履歴を永続化する(失敗しても取引は続行)
  await prisma.botSignalLog
    .create({
      data: {
        id: signal.id,
        strategyId: signal.strategyId,
        strategyName: signal.strategyName,
        pair: signal.pair,
        action: signal.action,
        price: signal.price,
        triggeredAt: new Date(signal.triggeredAt),
        executed: signal.executed,
        note: signal.note,
      },
    })
    .catch((err) => console.error("[botEngine] シグナル履歴の保存に失敗しました", err));

  if (result.trade) {
    broadcast({ type: "trade", payload: toTradeEvent(result.trade) });
  }
  if (result.position) {
    broadcast({ type: "position_update", payload: toPositionEvent(result.position) });
  }
}

/** ティッカー受信ごとに呼ばれるエントリポイント */
export async function onTick(pair: string, price: number, timestampMs: number) {
  const state = stateFor(pair);
  recordCandle(state, price, timestampMs);

  const strategies = activeStrategies.filter((s) => s.pair === pair);
  if (strategies.length === 0 || evaluatingPairs.has(pair)) return;

  const closes = closeSeries(state);
  if (closes.length < 2) return;

  evaluatingPairs.add(pair);
  try {
    for (const strategy of strategies) {
      const cooldownMs = config.bot.cooldownMs;
      const firedAt = lastFiredAt.get(strategy.id) ?? 0;
      if (Date.now() - firedAt < cooldownMs) continue;

      const evaluation = evaluateGraph(strategy.graph, closes);
      if (evaluation.errors.length > 0) {
        console.warn(`[botEngine] 戦略 "${strategy.name}" の評価エラー:`, evaluation.errors);
        continue;
      }

      // 立ち上がりエッジ(前の足では不成立→現在成立)でのみ発火する
      const shouldBuy = evaluation.buy.current && !evaluation.buy.previous;
      const shouldSell = evaluation.sell.current && !evaluation.sell.previous;

      if (!shouldBuy && !shouldSell) continue;

      lastFiredAt.set(strategy.id, Date.now());

      // buy/sell が同時成立した場合は安全側に倒して売りのみ実行する
      if (shouldSell) {
        await fireSignal(strategy, pair, price, "sell");
      } else if (shouldBuy) {
        await fireSignal(strategy, pair, price, "buy");
      }
    }
  } catch (err) {
    console.error("[botEngine] 戦略評価中にエラーが発生しました", err);
  } finally {
    evaluatingPairs.delete(pair);
  }
}
