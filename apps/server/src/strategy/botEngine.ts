import { randomUUID } from "node:crypto";
import { prisma } from "../db/prisma";
import { broadcast } from "../ws/relay";
import { config } from "../config";
import { closeOldestPosition, openBuyPosition } from "../trading/paperTradingEngine";
import { isBuyHalted } from "../trading/circuitBreaker";
import { toPositionEvent, toTradeEvent } from "../trading/mappers";
import { getJudgment, setWatchedPairs } from "../ai/aiJudgment";
import {
  evaluateGraph,
  minutesOfTimeframe,
  parseGraph,
  type BotSignal,
  type CandleTimeframe,
  type OrderSide,
  type StrategyGraph,
} from "@noctas/shared";

/**
 * Bot戦略の実行エンジン(マルチペア対応)。
 * ペアごとにティッカーを1分足の終値シリーズへ集約し、そのペアのアクティブ戦略グラフを評価して
 * 条件の立ち上がり(false→true)でペーパートレードを執行する。
 */

export interface CandleBucket {
  time: number; // 分単位のエポック秒
  open: number;
  high: number;
  low: number;
  close: number;
  /** この足の間の出来高。シード分はbitbankの実績値、形成中はtickerの24時間出来高の差分を積算した推定値 */
  volume: number;
}

// 保持する1分足の本数(シード日数分+バッファ)
const HISTORY_LIMIT = config.candles.seedDays * 1440 + 120;
// 1レスポンスで返す上限本数(粗い時間足でもブラウザ側のメモリ・描画負荷を一定に保つ)
const MAX_RESPONSE_CANDLES = 1500;

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
// 戦略ごとに最後まで見たAI判断のupdatedAt(ai_judgmentノードの立ち上がりエッジ検出に使う)
const lastSeenJudgmentAt = new Map<string, number>();
// ペアごとの直近tickerの24時間出来高(vol)。次のtickとの差分を形成中足の出来高として積算する
const lastTickerVol = new Map<string, number>();

/**
 * tickerの24時間出来高(24h累積・ローリング)から、直前tickとの差分を「この1tick分の出来高」として
 * 推定する。24時間窓の境界をまたぐと稀に減少することがあるため、その場合は0として扱う。
 * そのペアで初めて観測したtickは基準が無いため0を返す。
 */
export function tickVolumeDelta(pair: string, vol24h: number): number {
  const last = lastTickerVol.get(pair);
  lastTickerVol.set(pair, vol24h);
  if (last === undefined) return 0;
  return Math.max(0, vol24h - last);
}

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
        for (const [open, high, low, close, volume, ts] of entry.ohlcv) {
          candles.push({
            time: Math.floor(ts / 1000 / 60) * 60,
            open: Number(open),
            high: Number(high),
            low: Number(low),
            close: Number(close),
            volume: Number(volume),
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

/** 1分足を指定分数のバケットへ集計する(末尾バケットは形成中でも良い) */
function aggregateCandles(source: CandleBucket[], minutes: number): CandleBucket[] {
  if (minutes <= 1) return source;
  const bucketSeconds = minutes * 60;
  const result: CandleBucket[] = [];

  for (const candle of source) {
    const bucketTime = Math.floor(candle.time / bucketSeconds) * bucketSeconds;
    const last = result[result.length - 1];
    if (!last || last.time !== bucketTime) {
      result.push({
        time: bucketTime,
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
        volume: candle.volume,
      });
    } else {
      last.high = Math.max(last.high, candle.high);
      last.low = Math.min(last.low, candle.low);
      last.close = candle.close;
      last.volume += candle.volume;
    }
  }

  return result;
}

/**
 * 指定ペア・時間足のローソク足履歴を返す。
 * 既に保持している1分足の有限バッファ(HISTORY_LIMIT本)を集計するだけなので、
 * 時間足を切り替えても新規のフェッチやサーバー側メモリの増加は発生しない。
 * レスポンスはMAX_RESPONSE_CANDLES本に切り詰め、ブラウザ側の負荷も一定に保つ。
 */
export function getCandlesForTimeframe(pair: string, timeframe: CandleTimeframe): CandleBucket[] {
  const minutes = minutesOfTimeframe(timeframe);
  const aggregated = aggregateCandles(getCandleHistory(pair), minutes);
  return aggregated.length > MAX_RESPONSE_CANDLES
    ? aggregated.slice(-MAX_RESPONSE_CANDLES)
    : aggregated;
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

  // ai_judgmentノードを使う戦略のペアのみをAI判断キャッシュの監視対象にする
  // (無関係なペアの分までClaude呼び出しコストが膨らまないようにするため)
  const pairsUsingAiJudgment = new Set(
    activeStrategies
      .filter((s) => s.graph.nodes.some((n) => n.type === "ai_judgment"))
      .map((s) => s.pair)
  );
  setWatchedPairs(pairsUsingAiJudgment);

  console.info(`[botEngine] アクティブ戦略を再読込しました (${activeStrategies.length}件)`);
}

function recordCandle(state: PairCandleState, price: number, timestampMs: number, volumeDelta: number) {
  const bucketTime = Math.floor(timestampMs / 1000 / 60) * 60;

  if (!state.forming || state.forming.time === bucketTime) {
    if (!state.forming) {
      // シード済み履歴と現在の分が重複しないよう、同じ分以降の確定足を取り除く
      while (state.closed.length > 0 && state.closed[state.closed.length - 1].time >= bucketTime) {
        state.closed.pop();
      }
      state.forming = { time: bucketTime, open: price, high: price, low: price, close: price, volume: volumeDelta };
      return;
    }
    state.forming = {
      ...state.forming,
      high: Math.max(state.forming.high, price),
      low: Math.min(state.forming.low, price),
      close: price,
      volume: state.forming.volume + volumeDelta,
    };
    return;
  }

  // 分が進んだので直前の足を確定する
  state.closed.push(state.forming);
  if (state.closed.length > HISTORY_LIMIT) {
    state.closed.shift();
  }
  state.forming = { time: bucketTime, open: price, high: price, low: price, close: price, volume: volumeDelta };
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

/** ティッカー受信ごとに呼ばれるエントリポイント。vol24hはtickerの24時間出来高(累積・ローリング) */
export async function onTick(pair: string, price: number, timestampMs: number, vol24h: number) {
  const state = stateFor(pair);
  recordCandle(state, price, timestampMs, tickVolumeDelta(pair, vol24h));

  const strategies = activeStrategies.filter((s) => s.pair === pair);
  if (strategies.length === 0 || evaluatingPairs.has(pair)) return;

  const closes = closeSeries(state);
  if (closes.length < 2) return;

  evaluatingPairs.add(pair);
  try {
    // このペアのAI判断キャッシュは全戦略で共通(ai_judgmentノードを含む戦略のみが実質的に使う)
    const judgment = getJudgment(pair);

    for (const strategy of strategies) {
      const cooldownMs = config.bot.cooldownMs;
      const firedAt = lastFiredAt.get(strategy.id) ?? 0;
      if (Date.now() - firedAt < cooldownMs) continue;

      const lastSeenAt = lastSeenJudgmentAt.get(strategy.id) ?? 0;
      const isFresh = judgment !== null && judgment.updatedAt > lastSeenAt;
      const evaluation = evaluateGraph(strategy.graph, closes, {
        aiJudgment: judgment && { action: judgment.action, confidence: judgment.confidence, isFresh },
      });
      if (judgment) lastSeenJudgmentAt.set(strategy.id, judgment.updatedAt);

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
