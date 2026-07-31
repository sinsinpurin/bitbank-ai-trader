"use client";

import { useEffect, useMemo, useState } from "react";
import { Box, Grid, GridItem, HStack, Text } from "@chakra-ui/react";
import type { SeriesMarker, Time, UTCTimestamp } from "lightweight-charts";
import {
  CANDLE_TIMEFRAMES,
  DEFAULT_CANDLE_TIMEFRAME,
  minutesOfTimeframe,
  type CandleTimeframe,
} from "@noctas/shared";
import { AppHeader } from "@/components/ui/AppHeader";
import { CyberPanel } from "@/components/ui/CyberPanel";
import { CyberButton } from "@/components/ui/CyberButton";
import { PriceChart, type EntryPriceLine } from "@/components/dashboard/PriceChart";
import { SignalMonitorPanel } from "@/components/dashboard/SignalMonitorPanel";
import { BotSignalFeedPanel } from "@/components/dashboard/BotSignalFeedPanel";
import { useServerEvents } from "@/lib/useServerEvents";
import { pairLabel, usePairs } from "@/lib/pairs";

export default function ChartPage() {
  const { pairs, primaryPair } = usePairs();
  const [selectedPair, setSelectedPair] = useState(primaryPair);

  // /api/pairsの取得完了後、選択中ペアが対象外なら先頭ペアへ寄せる
  useEffect(() => {
    if (!pairs.includes(selectedPair)) {
      setSelectedPair(primaryPair);
    }
  }, [pairs, primaryPair, selectedPair]);

  const [timeframe, setTimeframe] = useState<CandleTimeframe>(DEFAULT_CANDLE_TIMEFRAME);
  const { connected, candles, positions, trades, botSignals } = useServerEvents(
    [],
    selectedPair,
    timeframe
  );
  const [showTradeMarkers, setShowTradeMarkers] = useState(true);
  const [showSignalMarkers, setShowSignalMarkers] = useState(true);

  // 保有中ポジションの建値ライン(選択中ペアのみ)
  const entryPriceLines = useMemo<EntryPriceLine[]>(
    () =>
      positions
        .filter((p) => p.closedAt === null && p.pair === selectedPair)
        .map((p) => ({
          id: p.id,
          price: p.entryPrice,
          label: `建値 ¥${Math.round(p.entryPrice).toLocaleString("ja-JP")}`,
        })),
    [positions, selectedPair]
  );

  // チャートマーカー: 約定(▲買い/▼売り)+ 見送りシグナル(●)。選択中の時間足のバケットに合わせる
  const chartMarkers = useMemo<SeriesMarker<Time>[]>(() => {
    const markers: SeriesMarker<Time>[] = [];
    const bucketMs = minutesOfTimeframe(timeframe) * 60_000;
    const bucket = (ms: number) => (Math.floor(ms / bucketMs) * (bucketMs / 1000)) as UTCTimestamp;

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
  }, [trades, botSignals, selectedPair, showTradeMarkers, showSignalMarkers, timeframe]);

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

        <Grid templateColumns={{ base: "1fr", xl: "1fr 1fr" }} gap={6}>
          <GridItem colSpan={{ base: 1, xl: 2 }}>
            <CyberPanel
              title={`Price Chart / ${selectedPair.toUpperCase()}`}
              code="01 / MARKET"
              accent="cyan"
              delay={0}
            >
              <HStack gap={2} mb={2} flexWrap="wrap">
                <Text fontFamily="mono" fontSize="10px" color="text.disabled">
                  TF:
                </Text>
                {CANDLE_TIMEFRAMES.map((tf) => (
                  <CyberButton
                    key={tf.value}
                    size="sm"
                    px={3}
                    py={1}
                    variant={timeframe === tf.value ? "secondary" : "ghost"}
                    onClick={() => setTimeframe(tf.value)}
                  >
                    {tf.label}
                  </CyberButton>
                ))}
              </HStack>
              <HStack gap={2} mb={2} flexWrap="wrap">
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
              <PriceChart
                data={candles}
                markers={chartMarkers}
                entryPriceLines={entryPriceLines}
                resetKey={`${selectedPair}-${timeframe}`}
              />
            </CyberPanel>
          </GridItem>

          <GridItem>
            <CyberPanel title="Signal Monitor / 監視条件" code="02 / SIG" accent="yellow" delay={0.05}>
              <SignalMonitorPanel pairs={pairs} />
            </CyberPanel>
          </GridItem>

          <GridItem>
            <CyberPanel title="Bot Signal Feed" code="03 / BOT" accent="cyan" delay={0.1}>
              <BotSignalFeedPanel liveSignals={botSignals} pairs={pairs} />
            </CyberPanel>
          </GridItem>
        </Grid>
      </Box>
    </Box>
  );
}
