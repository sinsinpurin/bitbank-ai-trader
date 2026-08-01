"use client";

import { useEffect, useState } from "react";
import { fetchStrategyOpenPositions } from "./strategyApi";

const POLL_INTERVAL_MS = 15_000;

/**
 * 保存済み戦略が保持している未決済建玉の有無をポーリングで取得する。
 * Bot Blueprintエディタの「Position」ノードのライブプレビュー表示に使う。
 * 未保存(strategyId=undefined)の場合は建玉なし(false)として扱う。
 */
export function useStrategyOpenPositions(strategyId?: string | null): boolean {
  const [hasOpenPosition, setHasOpenPosition] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setHasOpenPosition(false);
    if (!strategyId) return;

    const load = async () => {
      try {
        const data = await fetchStrategyOpenPositions(strategyId);
        if (!cancelled) setHasOpenPosition(data.count > 0);
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
  }, [strategyId]);

  return hasOpenPosition;
}
