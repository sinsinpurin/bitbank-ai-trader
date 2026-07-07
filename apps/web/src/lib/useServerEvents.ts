"use client";

import { useEffect, useRef, useState } from "react";
import type { CandlestickData, UTCTimestamp } from "lightweight-charts";
import type {
  AiDecision,
  AiUsageStats,
  BotSignal,
  Position,
  ServerEvent,
  Trade,
} from "@bitbank-ai-trader/shared";

const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:4000/ws";
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const RECONNECT_DELAY_MS = 3000;
const MAX_DECISIONS = 20;
const MAX_TRADES = 30;
const MAX_BOT_SIGNALS = 20;

function applyTickerToCandles(
  candles: CandlestickData[],
  last: number,
  timestampMs: number
): CandlestickData[] {
  const bucketTime = (Math.floor(timestampMs / 1000 / 60) * 60) as UTCTimestamp;
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

  return next;
}

/**
 * サーバーWSのイベントを購読する。
 * candlePairを指定すると、そのペアのローソク足のみを蓄積し、
 * 切り替え時にはサーバーの1分足履歴(/api/candles)でプレフィルする。
 */
export function useServerEvents(seedCandles: CandlestickData[], candlePair?: string) {
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

  // ペア切り替え時: 履歴をリセットし、サーバーの1分足終値でプレフィルする
  useEffect(() => {
    if (!candlePair) return;
    let cancelled = false;
    setCandles([]);
    fetch(`${API_URL}/api/candles?pair=${candlePair}`)
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
  }, [candlePair]);

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
              applyTickerToCandles(prev, parsed.payload.last, parsed.payload.timestamp)
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
