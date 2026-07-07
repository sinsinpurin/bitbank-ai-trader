"use client";

import { useEffect, useMemo, useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const POLL_INTERVAL_MS = 10_000;

/**
 * 複数ペアの1分足終値履歴をまとめてポーリングする。
 * シグナルモニターが複数ペアの条件を同時に評価するために使う。
 */
export function useMultiPairCandles(pairs: string[]): Record<string, number[]> {
  const [closesByPair, setClosesByPair] = useState<Record<string, number[]>>({});
  // 配列参照の変化で効果が再実行されないよう、内容ベースのキーに正規化する
  const pairsKey = useMemo(() => [...new Set(pairs)].sort().join(","), [pairs]);

  useEffect(() => {
    const targets = pairsKey === "" ? [] : pairsKey.split(",");
    if (targets.length === 0) {
      setClosesByPair({});
      return;
    }
    let cancelled = false;

    const load = async () => {
      const entries = await Promise.all(
        targets.map(async (pair): Promise<[string, number[]] | null> => {
          try {
            const res = await fetch(`${API_URL}/api/candles?pair=${pair}`);
            if (!res.ok) return null;
            const data = (await res.json()) as { closes: number[] };
            return Array.isArray(data.closes) ? [pair, data.closes] : null;
          } catch {
            return null;
          }
        })
      );
      if (cancelled) return;
      setClosesByPair(Object.fromEntries(entries.filter((e): e is [string, number[]] => e !== null)));
    };

    load();
    const timer = setInterval(load, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [pairsKey]);

  return closesByPair;
}
