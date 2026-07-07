"use client";

import { useEffect, useMemo, useState } from "react";
import { Box, Grid, GridItem, HStack, Text } from "@chakra-ui/react";
import type { SeriesMarker, Time, UTCTimestamp } from "lightweight-charts";
import { AppHeader } from "@/components/ui/AppHeader";
import { CyberPanel } from "@/components/ui/CyberPanel";
import { CyberButton } from "@/components/ui/CyberButton";
import { PriceChart } from "@/components/dashboard/PriceChart";
import { AiLogPanel } from "@/components/dashboard/AiLogPanel";
import { PositionsPanel } from "@/components/dashboard/PositionsPanel";
import { TradeHistoryPanel } from "@/components/dashboard/TradeHistoryPanel";
import { StatusMeter } from "@/components/dashboard/StatusMeter";
import { SignalMonitorPanel } from "@/components/dashboard/SignalMonitorPanel";
import { BotSignalFeedPanel } from "@/components/dashboard/BotSignalFeedPanel";
import { mockAiDecisions, mockPositions, mockTrades } from "@/lib/mockData";
import { useServerEvents } from "@/lib/useServerEvents";
import { pairLabel, usePairs } from "@/lib/pairs";

export default function DashboardPage() {
  const { pairs, primaryPair } = usePairs();
  const [selectedPair, setSelectedPair] = useState(primaryPair);

  // /api/pairsの取得完了後、選択中ペアが対象外なら先頭ペアへ寄せる
  useEffect(() => {
    if (!pairs.includes(selectedPair)) {
      setSelectedPair(primaryPair);
    }
  }, [pairs, primaryPair, selectedPair]);

  const { connected, candles, aiDecisions, positions, trades, usage, botSignals } =
    useServerEvents([], selectedPair);
  const [showTradeMarkers, setShowTradeMarkers] = useState(true);
  const [showSignalMarkers, setShowSignalMarkers] = useState(true);

  const displayDecisions = aiDecisions.length > 0 ? aiDecisions : mockAiDecisions;
  const displayPositions = positions.length > 0 ? positions : mockPositions;
  const displayTrades = trades.length > 0 ? trades : mockTrades;
  const currentPrice = candles[candles.length - 1]?.close ?? 0;

  // ポジション/損益はペア別価格で評価するため、表示中ペアのみ表示する
  const pairPositions = useMemo(
    () => displayPositions.filter((p) => p.pair === selectedPair),
    [displayPositions, selectedPair]
  );

  // チャートマーカー: 約定(▲買い/▼売り)+ 見送りシグナル(●)。1分足のバケットに合わせる
  const chartMarkers = useMemo<SeriesMarker<Time>[]>(() => {
    const markers: SeriesMarker<Time>[] = [];
    const bucket = (ms: number) => (Math.floor(ms / 60_000) * 60) as UTCTimestamp;

    if (showTradeMarkers) {
      for (const trade of trades) {
        if (trade.pair !== selectedPair) continue;
        const isBuy = trade.side === "buy";
        markers.push({
          time: bucket(trade.executedAt),
          position: isBuy ? "belowBar" : "aboveBar",
          shape: isBuy ? "arrowUp" : "arrowDown",
          color: isBuy ? "#39FF88" : "#FF003C",
          text: isBuy ? "B" : "S",
        });
      }
    }
    if (showSignalMarkers) {
      for (const signal of botSignals) {
        if (signal.pair !== selectedPair || signal.executed) continue;
        markers.push({
          time: bucket(signal.triggeredAt),
          position: "aboveBar",
          shape: "circle",
          color: "#FCEE0A",
          text: "見送",
        });
      }
    }
    return markers.sort((a, b) => (a.time as number) - (b.time as number));
  }, [trades, botSignals, selectedPair, showTradeMarkers, showSignalMarkers]);

  return (
    <Box minH="100vh">
      <AppHeader connected={connected} />

      <Box px={{ base: 4, md: 10 }} py={8}>
        {pairs.length > 1 && (
          <HStack gap={2} mb={5}>
            {pairs.map((pair) => (
              <CyberButton
                key={pair}
                size="sm"
                variant={pair === selectedPair ? "secondary" : "ghost"}
                onClick={() => setSelectedPair(pair)}
              >
                {pairLabel(pair)}
              </CyberButton>
            ))}
          </HStack>
        )}

        <Grid templateColumns={{ base: "1fr", xl: "2fr 1fr" }} gap={6}>
          <GridItem>
            <CyberPanel
              title={`Price Chart / ${selectedPair.toUpperCase()}`}
              code="01 / MARKET"
              accent="cyan"
              delay={0}
            >
              <HStack gap={2} mb={2}>
                <Text fontFamily="mono" fontSize="10px" color="text.disabled">
                  MARKERS:
                </Text>
                <CyberButton
                  size="sm"
                  px={3}
                  py={1}
                  variant={showTradeMarkers ? "secondary" : "ghost"}
                  onClick={() => setShowTradeMarkers((v) => !v)}
                >
                  ▲▼ 約定
                </CyberButton>
                <CyberButton
                  size="sm"
                  px={3}
                  py={1}
                  variant={showSignalMarkers ? "secondary" : "ghost"}
                  onClick={() => setShowSignalMarkers((v) => !v)}
                >
                  ● 見送りシグナル
                </CyberButton>
              </HStack>
              <PriceChart data={candles} markers={chartMarkers} />
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
            <CyberPanel
              title={`Positions / P&L (${pairLabel(selectedPair)})`}
              code="04 / POS"
              accent="red"
              delay={0.15}
            >
              <PositionsPanel positions={pairPositions} currentPrice={currentPrice} />
            </CyberPanel>
          </GridItem>

          <GridItem>
            <CyberPanel title="Signal Monitor / 監視条件" code="05 / SIG" accent="yellow" delay={0.2}>
              <SignalMonitorPanel pairs={pairs} />
            </CyberPanel>
          </GridItem>

          <GridItem>
            <CyberPanel title="Bot Signal Feed" code="06 / BOT" accent="cyan" delay={0.25}>
              <BotSignalFeedPanel liveSignals={botSignals} pairs={pairs} />
            </CyberPanel>
          </GridItem>

          <GridItem colSpan={{ base: 1, xl: 2 }}>
            <CyberPanel title="Trade History" code="07 / EXEC" accent="cyan" delay={0.3}>
              <TradeHistoryPanel trades={displayTrades} />
            </CyberPanel>
          </GridItem>
        </Grid>
      </Box>
    </Box>
  );
}
