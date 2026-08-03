"use client";

import { useEffect, useState } from "react";
import type { CandleTimeframe } from "@noctas/shared";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const POLL_INTERVAL_MS = 10_000;

interface CandlesResponse {
  pair: string;
  times: number[];
  closes: number[];
}

/**
 * サーバー(Botエンジン)が保持する1分足終値履歴をポーリングで取得する。
 * エディタ上のノードを「Botが実際に見ているのと同じデータ」で評価するために使う。
 */
export function useLiveCandles(pair?: string, timeframe?: CandleTimeframe): number[] {
  const [closes, setCloses] = useState<number[]>([]);

  useEffect(() => {
    let cancelled = false;
    setCloses([]);

    const load = async () => {
      try {
        const params = new URLSearchParams();
        if (pair) params.set("pair", pair);
        if (timeframe) params.set("timeframe", timeframe);
        const query = params.toString() ? `?${params.toString()}` : "";
        const res = await fetch(`${API_URL}/api/candles${query}`);
        if (!res.ok) return;
        const data = (await res.json()) as CandlesResponse;
        if (!cancelled && Array.isArray(data.closes)) {
          setCloses(data.closes);
        }
      } catch {
        // サーバー未起動時は静かにリトライ
      }
    };

    load();
    const timer = setInterval(load, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [pair, timeframe]);

  return closes;
}
