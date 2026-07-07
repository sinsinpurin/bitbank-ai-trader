"use client";

import { useEffect, useMemo, useState } from "react";
import { HStack, Stack, chakra } from "@chakra-ui/react";
import type { BotSignal } from "@bitbank-ai-trader/shared";
import { BotSignalFeed } from "@/components/strategy/BotSignalFeed";
import { fetchBotSignals } from "@/lib/signalsApi";
import { pairLabel } from "@/lib/pairs";

/**
 * ダッシュボード用のBotシグナルフィード。
 * 永続化された発火履歴(リロード後も残る)にWSのリアルタイム分をマージし、
 * ペア・約定有無・戦略でフィルタできる。
 */

const selectStyle = {
  bg: "bg.surface",
  borderWidth: "1px",
  borderColor: "border.gridCyan",
  borderRadius: "0",
  fontFamily: "mono",
  fontSize: "10px",
  color: "text.secondary",
  px: 2,
  py: 1,
  cursor: "pointer",
} as const;

export function BotSignalFeedPanel({
  liveSignals,
  pairs,
}: {
  /** WSで受信したリアルタイムシグナル */
  liveSignals: BotSignal[];
  pairs: string[];
}) {
  const [history, setHistory] = useState<BotSignal[]>([]);
  const [pairFilter, setPairFilter] = useState("all");
  const [executedFilter, setExecutedFilter] = useState("all");
  const [strategyFilter, setStrategyFilter] = useState("all");

  useEffect(() => {
    let cancelled = false;
    fetchBotSignals(50)
      .then((data) => {
        if (!cancelled) setHistory(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const merged = useMemo(() => {
    const byId = new Map<string, BotSignal>();
    for (const signal of [...history, ...liveSignals]) {
      byId.set(signal.id, signal);
    }
    return [...byId.values()].sort((a, b) => b.triggeredAt - a.triggeredAt);
  }, [history, liveSignals]);

  const strategyNames = useMemo(
    () => [...new Set(merged.map((s) => s.strategyName))].sort(),
    [merged]
  );

  const filtered = merged.filter((signal) => {
    if (pairFilter !== "all" && signal.pair !== pairFilter) return false;
    if (executedFilter === "executed" && !signal.executed) return false;
    if (executedFilter === "skipped" && signal.executed) return false;
    if (strategyFilter !== "all" && signal.strategyName !== strategyFilter) return false;
    return true;
  });

  return (
    <Stack gap={3}>
      <HStack gap={2} flexWrap="wrap">
        <chakra.select {...selectStyle} value={pairFilter} onChange={(e) => setPairFilter(e.target.value)}>
          <option value="all" style={{ background: "#131318" }}>全ペア</option>
          {pairs.map((p) => (
            <option key={p} value={p} style={{ background: "#131318" }}>
              {pairLabel(p)}
            </option>
          ))}
        </chakra.select>
        <chakra.select
          {...selectStyle}
          value={executedFilter}
          onChange={(e) => setExecutedFilter(e.target.value)}
        >
          <option value="all" style={{ background: "#131318" }}>約定+見送り</option>
          <option value="executed" style={{ background: "#131318" }}>約定のみ</option>
          <option value="skipped" style={{ background: "#131318" }}>見送りのみ</option>
        </chakra.select>
        <chakra.select
          {...selectStyle}
          value={strategyFilter}
          onChange={(e) => setStrategyFilter(e.target.value)}
        >
          <option value="all" style={{ background: "#131318" }}>全戦略</option>
          {strategyNames.map((name) => (
            <option key={name} value={name} style={{ background: "#131318" }}>
              {name}
            </option>
          ))}
        </chakra.select>
      </HStack>

      <BotSignalFeed signals={filtered} />
    </Stack>
  );
}
