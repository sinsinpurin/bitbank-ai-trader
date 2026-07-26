"use client";

import { Box, Grid, GridItem, Text } from "@chakra-ui/react";
import { useCallback, useEffect, useState } from "react";
import type { PnlSummary } from "@bitbank-ai-trader/shared";
import { AppHeader } from "@/components/ui/AppHeader";
import { CyberPanel } from "@/components/ui/CyberPanel";
import { PnlStatTiles } from "@/components/pnl/PnlStatTiles";
import { EquityCurveChart } from "@/components/pnl/EquityCurveChart";
import { DailyPnlChart } from "@/components/pnl/DailyPnlChart";
import { ReasonBreakdownPanel } from "@/components/pnl/ReasonBreakdownPanel";
import { ClosedPositionsTable } from "@/components/pnl/ClosedPositionsTable";
import { StrategyBreakdownTable } from "@/components/pnl/StrategyBreakdownTable";
import { fetchPnlSummary } from "@/lib/pnlApi";

const REFRESH_INTERVAL_MS = 15_000;

export default function PnlPage() {
  const [summary, setSummary] = useState<PnlSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setSummary(await fetchPnlSummary());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "損益データの取得に失敗しました");
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), REFRESH_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  return (
    <Box minH="100vh">
      <AppHeader />

      <Box px={{ base: 4, md: 10 }} py={8}>
        {error && (
          <Box mb={4} borderWidth="1px" borderColor="border.grid" bg="bg.surface" p={3}>
            <Text fontFamily="mono" fontSize="sm" color="signal.red">
              {error} — サーバー(port 4000)が起動しているか確認してください。
            </Text>
          </Box>
        )}

        {summary && (
          <Grid templateColumns={{ base: "1fr", xl: "2fr 1fr" }} gap={6}>
            <GridItem colSpan={{ base: 1, xl: 2 }}>
              <CyberPanel title="P&L Overview" code="01 / PNL" accent="red" delay={0}>
                <PnlStatTiles summary={summary} />
              </CyberPanel>
            </GridItem>

            <GridItem>
              <CyberPanel title="Equity Curve / 累積実現損益" code="02 / CURVE" accent="cyan" delay={0.05}>
                <EquityCurveChart points={summary.equityCurve} />
              </CyberPanel>
            </GridItem>

            <GridItem>
              <CyberPanel title="Breakdown / 経路別内訳" code="03 / SRC" accent="cyan" delay={0.1}>
                <ReasonBreakdownPanel byReason={summary.byReason} />
              </CyberPanel>
            </GridItem>

            <GridItem colSpan={{ base: 1, xl: 2 }}>
              <CyberPanel title="Daily P&L / 日次損益 (JST)" code="04 / DAILY" accent="cyan" delay={0.15}>
                <DailyPnlChart points={summary.dailyPnl} />
              </CyberPanel>
            </GridItem>

            <GridItem colSpan={{ base: 1, xl: 2 }}>
              <CyberPanel title="Strategy P&L / 戦略別成績" code="05 / STRAT" accent="red" delay={0.2}>
                <StrategyBreakdownTable rows={summary.byStrategy} />
              </CyberPanel>
            </GridItem>

            <GridItem colSpan={{ base: 1, xl: 2 }}>
              <CyberPanel title="Closed Positions / 決済履歴" code="06 / HIST" accent="cyan" delay={0.25}>
                <ClosedPositionsTable positions={summary.closedPositions} />
              </CyberPanel>
            </GridItem>
          </Grid>
        )}

        {!summary && !error && (
          <Text fontFamily="mono" fontSize="sm" color="text.secondary">
            LOADING P&L DATA...
          </Text>
        )}
      </Box>
    </Box>
  );
}
