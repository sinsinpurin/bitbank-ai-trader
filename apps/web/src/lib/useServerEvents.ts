"use client";

import { useEffect, useRef, useState } from "react";
import type { CandlestickData, UTCTimestamp } from "lightweight-charts";
import type {
  AiDecision,
  AiUsageStats,
  Position,
  ServerEvent,
} from "@bitbank-ai-trader/shared";

const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:4000/ws";
const RECONNECT_DELAY_MS = 3000;
const MAX_DECISIONS = 20;

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

export function useServerEvents(seedCandles: CandlestickData[]) {
  const [connected, setConnected] = useState(false);
  const [candles, setCandles] = useState<CandlestickData[]>(seedCandles);
  const [aiDecisions, setAiDecisions] = useState<AiDecision[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [usage, setUsage] = useState<AiUsageStats | null>(null);
  const seedRef = useRef(seedCandles);

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
            // 現状ダッシュボードに専用の約定履歴表示は無いため受信のみ
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
    usage,
  };
}
