import { randomUUID } from "node:crypto";
import { prisma } from "../db/prisma";
import { broadcast } from "../ws/relay";
import { config } from "../config";
import { closeOldestPosition, openBuyPosition } from "../trading/paperTradingEngine";
import { toPositionEvent, toTradeEvent } from "../trading/mappers";
import {
  evaluateGraph,
  parseGraph,
  type BotSignal,
  type OrderSide,
  type StrategyGraph,
} from "@bitbank-ai-trader/shared";

/**
 * Bot戦略の実行エンジン。
 * ティッカーを1分足の終値シリーズに集約し、アクティブな戦略グラフを評価して
 * 条件の立ち上がり(false→true)でペーパートレードを執行する。
 */

interface CandleBucket {
  time: number; // 分単位のエポック秒
  close: number;
}

const HISTORY_LIMIT = 500;

// 確定済みの1分足終値。末尾に「形成中の現在値」を加えた配列で評価する
const closedCandles: CandleBucket[] = [];
let formingCandle: CandleBucket | null = null;

interface ActiveStrategy {
  id: string;
  name: string;
  graph: StrategyGraph;
}

let activeStrategies: ActiveStrategy[] = [];

// 戦略ごとの直近発火時刻(連続発火を防ぐクールダウン)
const lastFiredAt = new Map<string, number>();
let evaluating = false;

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
 * bitbank公開REST(1分足)で終値履歴を初期化する。
 * サーバー再起動直後でもSMA/RSI等のインジケーターが即座に計算できるようにするため。
 * 取得失敗時は空のまま起動し、ティッカーから履歴を積み上げる。
 */
export async function seedCandleHistory(pair: string) {
  try {
    const candles: CandleBucket[] = [];
    // 日本時間の昨日+今日で最大2日分を取得し、直近HISTORY_LIMIT本へ切り詰める
    for (const offset of [-1, 0]) {
      const date = jstDateLabel(offset);
      const res = await fetch(`https://public.bitbank.cc/${pair}/candlestick/1min/${date}`);
      if (!res.ok) continue;
      const json = (await res.json()) as CandlestickResponse;
      if (json.success !== 1) continue;
      for (const entry of json.data.candlestick) {
        for (const [, , , close, , ts] of entry.ohlcv) {
          candles.push({ time: Math.floor(ts / 1000 / 60) * 60, close: Number(close) });
        }
      }
    }

    if (candles.length === 0) {
      console.warn("[botEngine] ローソク足履歴を取得できませんでした。ティッカーから積み上げます");
      return;
    }

    candles.sort((a, b) => a.time - b.time);
    closedCandles.length = 0;
    closedCandles.push(...candles.slice(-HISTORY_LIMIT));
    formingCandle = null;
    console.info(`[botEngine] 1分足履歴を${closedCandles.length}本シードしました`);
  } catch (err) {
    console.warn("[botEngine] ローソク足履歴のシードに失敗しました", err);
  }
}

/** 現在保持している1分足終値履歴(確定足+形成中)を返す */
export function getCandleHistory(): CandleBucket[] {
  const series = [...closedCandles];
  if (formingCandle) series.push(formingCandle);
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
    return [{ id: row.id, name: row.name, graph }];
  });
  console.info(`[botEngine] アクティブ戦略を再読込しました (${activeStrategies.length}件)`);
}

function recordCandle(price: number, timestampMs: number) {
  const bucketTime = Math.floor(timestampMs / 1000 / 60) * 60;

  if (!formingCandle || formingCandle.time === bucketTime) {
    if (!formingCandle) {
      // シード済み履歴と現在の分が重複しないよう、同じ分以降の確定足を取り除く
      while (closedCandles.length > 0 && closedCandles[closedCandles.length - 1].time >= bucketTime) {
        closedCandles.pop();
      }
    }
    formingCandle = { time: bucketTime, close: price };
    return;
  }

  // 分が進んだので直前の足を確定する
  closedCandles.push(formingCandle);
  if (closedCandles.length > HISTORY_LIMIT) {
    closedCandles.shift();
  }
  formingCandle = { time: bucketTime, close: price };
}

function closeSeries(): number[] {
  const series = closedCandles.map((c) => c.close);
  if (formingCandle) series.push(formingCandle.close);
  return series;
}

async function fireSignal(
  strategy: ActiveStrategy,
  pair: string,
  price: number,
  action: OrderSide
) {
  const result =
    action === "buy"
      ? await openBuyPosition(pair, price, "bot_strategy")
      : await closeOldestPosition(pair, price, "bot_strategy");

  const executed = result.trade !== null;
  const note = executed
    ? `${action.toUpperCase()} 条件が成立し、約定しました`
    : action === "buy"
      ? "BUY 条件が成立しましたが、リスク制約(ポジション数・残高)により見送りました"
      : "SELL 条件が成立しましたが、決済対象のポジションがありません";

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
    `[botEngine] ${strategy.name}: ${action} シグナル (price=${price}, executed=${executed})`
  );
  broadcast({ type: "bot_signal", payload: signal });

  if (result.trade) {
    broadcast({ type: "trade", payload: toTradeEvent(result.trade) });
  }
  if (result.position) {
    broadcast({ type: "position_update", payload: toPositionEvent(result.position) });
  }
}

/** ティッカー受信ごとに呼ばれるエントリポイント */
export async function onTick(pair: string, price: number, timestampMs: number) {
  recordCandle(price, timestampMs);

  if (activeStrategies.length === 0 || evaluating) return;

  const closes = closeSeries();
  if (closes.length < 2) return;

  evaluating = true;
  try {
    for (const strategy of activeStrategies) {
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
    evaluating = false;
  }
}
