"use client";

import { useEffect, useRef, useState } from "react";
import type { CandlestickData, UTCTimestamp } from "lightweight-charts";
import {
  minutesOfTimeframe,
  type AiDecision,
  type AiUsageStats,
  type BotSignal,
  type CandleTimeframe,
  type Position,
  type ServerEvent,
  type Trade,
} from "@bitbank-ai-trader/shared";

const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:4000/ws";
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const RECONNECT_DELAY_MS = 3000;
const MAX_DECISIONS = 20;
const MAX_TRADES = 30;
const MAX_BOT_SIGNALS = 20;
// ブラウザ側で保持するローソク足の上限本数。時間足を問わずここで頭打ちにし、
// 長時間画面を開きっぱなしにしてもメモリが際限なく増えないようにする(サーバー側の上限と揃える)
const MAX_CANDLES = 1500;

function applyTickerToCandles(
  candles: CandlestickData[],
  last: number,
  timestampMs: number,
  bucketSeconds: number
): CandlestickData[] {
  const bucketTime = (Math.floor(timestampMs / 1000 / bucketSeconds) * bucketSeconds) as UTCTimestamp;
  const next = candles.slice();
  const lastCandle = next[next.length - 1];

  if (!lastCandle || lastCandle.time !== bucketTime) {
    const open = lastCandle ? lastCandle.close : last;
    next.push({ time: bucketTime, open, high: Math.max(open, last), low: Math.min(open, last), close: last });
  } else {
    next[next.length - 1] = {
      ...lastCandle,
      high: Math.max(lastCandle.high, last),
      low: Math.min(lastCandle.low, last),
      close: last,
    };
  }

  return next.length > MAX_CANDLES ? next.slice(-MAX_CANDLES) : next;
}

/**
 * サーバーWSのイベントを購読する。
 * candlePairを指定すると、そのペアのローソク足のみを蓄積し、
 * 切り替え時にはサーバーの集計済み履歴(/api/candles)でプレフィルする。
 * timeframeは1分足バッファをサーバー側で集計したもので、切り替えても
 * 新規のフェッチ量・保持件数はMAX_CANDLESの範囲に収まる。
 */
export function useServerEvents(
  seedCandles: CandlestickData[],
  candlePair?: string,
  timeframe: CandleTimeframe = "1min"
) {
  const [connected, setConnected] = useState(false);
  const [candles, setCandles] = useState<CandlestickData[]>(seedCandles);
  const [aiDecisions, setAiDecisions] = useState<AiDecision[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [usage, setUsage] = useState<AiUsageStats | null>(null);
  const [botSignals, setBotSignals] = useState<BotSignal[]>([]);
  const seedRef = useRef(seedCandles);
  const candlePairRef = useRef(candlePair);
  candlePairRef.current = candlePair;
  const bucketSecondsRef = useRef(minutesOfTimeframe(timeframe) * 60);
  bucketSecondsRef.current = minutesOfTimeframe(timeframe) * 60;

  // ペア・時間足切り替え時: 履歴をリセットし、サーバーの集計済み終値でプレフィルする
  useEffect(() => {
    if (!candlePair) return;
    let cancelled = false;
    setCandles([]);
    fetch(`${API_URL}/api/candles?pair=${candlePair}&timeframe=${timeframe}`)
      .then((res) => (res.ok ? res.json() : null))
      .then(
        (
          data: {
            times: number[];
            opens?: number[];
            highs?: number[];
            lows?: number[];
            closes: number[];
          } | null
        ) => {
          if (cancelled || !data || !Array.isArray(data.closes)) return;
          // サーバーがOHLCを返す場合は本物のローソク足でプレフィルする
          const prefilled: CandlestickData[] = data.times.map((time, i) => ({
            time: time as UTCTimestamp,
            open: data.opens?.[i] ?? data.closes[i],
            high: data.highs?.[i] ?? data.closes[i],
            low: data.lows?.[i] ?? data.closes[i],
            close: data.closes[i],
          }));
          setCandles((prev) => (prev.length === 0 ? prefilled : prev));
        }
      )
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [candlePair, timeframe]);

  useEffect(() => {
    let cancelled = false;
    fetch(`${API_URL}/api/trades?limit=${MAX_TRADES}`)
      .then((res) => (res.ok ? (res.json() as Promise<Trade[]>) : []))
      .then((data) => {
        if (!cancelled) setTrades(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let socket: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let closedByEffect = false;

    const connect = () => {
      socket = new WebSocket(WS_URL);

      socket.onopen = () => setConnected(true);

      socket.onclose = () => {
        setConnected(false);
        if (!closedByEffect) {
          reconnectTimer = setTimeout(connect, RECONNECT_DELAY_MS);
        }
      };

      socket.onerror = () => {
        socket?.close();
      };

      socket.onmessage = (event) => {
        let parsed: ServerEvent;
        try {
          parsed = JSON.parse(event.data as string) as ServerEvent;
        } catch {
          return;
        }

        switch (parsed.type) {
          case "ticker":
            // 表示対象ペア以外のtickerはローソク足へ混ぜない
            if (candlePairRef.current && parsed.payload.pair !== candlePairRef.current) break;
            setCandles((prev) =>
              applyTickerToCandles(
                prev,
                parsed.payload.last,
                parsed.payload.timestamp,
                bucketSecondsRef.current
              )
            );
            break;
          case "ai_decision":
            setAiDecisions((prev) => [parsed.payload, ...prev].slice(0, MAX_DECISIONS));
            break;
          case "position_update":
            setPositions((prev) => {
              const idx = prev.findIndex((p) => p.id === parsed.payload.id);
              if (idx === -1) return [parsed.payload, ...prev];
              const next = prev.slice();
              next[idx] = parsed.payload;
              return next;
            });
            break;
          case "usage_stats":
            setUsage(parsed.payload);
            break;
          case "trade":
            setTrades((prev) => [parsed.payload, ...prev].slice(0, MAX_TRADES));
            break;
          case "bot_signal":
            setBotSignals((prev) => [parsed.payload, ...prev].slice(0, MAX_BOT_SIGNALS));
            break;
          case "paper_trading_reset":
            // 約定履歴・ポジション・Botシグナル履歴がサーバー側で全消去された
            setPositions([]);
            setTrades([]);
            setBotSignals([]);
            break;
        }
      };
    };

    connect();

    return () => {
      closedByEffect = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      socket?.close();
    };
  }, []);

  return {
    connected,
    candles: candles.length > 0 ? candles : seedRef.current,
    aiDecisions,
    positions,
    trades,
    usage,
    botSignals,
  };
}
