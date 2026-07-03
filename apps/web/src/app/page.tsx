"use client";

import { Box, Grid, GridItem } from "@chakra-ui/react";
import { AppHeader } from "@/components/ui/AppHeader";
import { CyberPanel } from "@/components/ui/CyberPanel";
import { PriceChart } from "@/components/dashboard/PriceChart";
import { AiLogPanel } from "@/components/dashboard/AiLogPanel";
import { PositionsPanel } from "@/components/dashboard/PositionsPanel";
import { TradeHistoryPanel } from "@/components/dashboard/TradeHistoryPanel";
import { StatusMeter } from "@/components/dashboard/StatusMeter";
import { generateMockCandles, mockAiDecisions, mockPositions, mockTrades } from "@/lib/mockData";
import { useServerEvents } from "@/lib/useServerEvents";

const seedCandles = generateMockCandles();

export default function DashboardPage() {
  const { connected, candles, aiDecisions, positions, trades, usage } = useServerEvents(seedCandles);

  const displayDecisions = aiDecisions.length > 0 ? aiDecisions : mockAiDecisions;
  const displayPositions = positions.length > 0 ? positions : mockPositions;
  const displayTrades = trades.length > 0 ? trades : mockTrades;
  const currentPrice = candles[candles.length - 1]?.close ?? seedCandles[seedCandles.length - 1].close;

  return (
    <Box minH="100vh">
      <AppHeader connected={connected} />

      <Box px={{ base: 4, md: 10 }} py={8}>
        <Grid templateColumns={{ base: "1fr", xl: "2fr 1fr" }} gap={6}>
          <GridItem>
            <CyberPanel title="Price Chart / BTC_JPY" code="01 / MARKET" accent="cyan" delay={0}>
              <PriceChart data={candles} />
            </CyberPanel>
          </GridItem>

          <GridItem>
            <CyberPanel title="System Status" code="02 / SYS" accent="cyan" delay={0.05}>
              <StatusMeter
                connectionLabel={connected ? "STREAM CONNECTED" : "DISCONNECTED"}
                connected={connected}
                signalStrength={0.78}
                mode="paper"
                usage={usage}
              />
            </CyberPanel>
          </GridItem>

          <GridItem>
            <CyberPanel title="AI Decision Log" code="03 / LOG" accent="cyan" delay={0.1}>
              <AiLogPanel decisions={displayDecisions} />
            </CyberPanel>
          </GridItem>

          <GridItem>
            <CyberPanel title="Positions / P&L" code="04 / POS" accent="red" delay={0.15}>
              <PositionsPanel positions={displayPositions} currentPrice={currentPrice} />
            </CyberPanel>
          </GridItem>

          <GridItem colSpan={{ base: 1, xl: 2 }}>
            <CyberPanel title="Trade History" code="05 / EXEC" accent="cyan" delay={0.2}>
              <TradeHistoryPanel trades={displayTrades} />
            </CyberPanel>
          </GridItem>
        </Grid>
      </Box>
    </Box>
  );
}
