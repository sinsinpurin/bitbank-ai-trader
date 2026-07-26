"use client";

import { useEffect, useState } from "react";
import type { PairsInfo } from "@bitbank-ai-trader/shared";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

const FALLBACK: PairsInfo = { pairs: ["btc_jpy"], primaryPair: "btc_jpy" };

/** ペア表記("btc_jpy" → "BTC/JPY") */
export function pairLabel(pair: string): string {
  return pair.toUpperCase().replace("_", "/");
}

export async function fetchPairs(): Promise<PairsInfo> {
  const res = await fetch(`${API_URL}/api/pairs`);
  if (!res.ok) throw new Error(`APIエラー (${res.status})`);
  return res.json() as Promise<PairsInfo>;
}

/** サーバーの取引対象ペア一覧。取得失敗時はbtc_jpyのみで動作する */
export function usePairs(): PairsInfo {
  const [info, setInfo] = useState<PairsInfo>(FALLBACK);

  useEffect(() => {
    let cancelled = false;
    fetchPairs()
      .then((data) => {
        if (!cancelled && data.pairs.length > 0) setInfo(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return info;
}
