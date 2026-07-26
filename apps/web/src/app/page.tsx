"use client";

import { useEffect, useMemo, useState } from "react";
import { Box, Grid, GridItem, HStack } from "@chakra-ui/react";
import { AppHeader } from "@/components/ui/AppHeader";
import { CyberPanel } from "@/components/ui/CyberPanel";
import { CyberButton } from "@/components/ui/CyberButton";
import { PositionsPanel } from "@/components/dashboard/PositionsPanel";
import { TradeHistoryPanel } from "@/components/dashboard/TradeHistoryPanel";
import { StatusMeter } from "@/components/dashboard/StatusMeter";
import { mockPositions, mockTrades } from "@/lib/mockData";
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

  // チャートは表示しないが、含み損益の評価には現在値が必要なので1分足のみ購読する
  const { connected, candles, positions, trades, usage } = useServerEvents([], selectedPair);

  // 未接続時のみダミーの初期シードデータを見せる。接続済みなら0件でもそのまま表示する
  // (リセット直後など、正当な0件をダミーデータと誤表示しないため)
  const displayPositions = connected ? positions : mockPositions;
  const displayTrades = connected ? trades : mockTrades;
  const currentPrice = candles[candles.length - 1]?.close ?? 0;

  // ポジション/損益はペア別価格で評価するため、表示中ペアのみ表示する
  const pairPositions = useMemo(
    () => displayPositions.filter((p) => p.pair === selectedPair),
    [displayPositions, selectedPair]
  );

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
              title={`Positions / P&L (${pairLabel(selectedPair)})`}
              code="01 / POS"
              accent="red"
              delay={0}
            >
              <PositionsPanel positions={pairPositions} currentPrice={currentPrice} />
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
            <CyberPanel title="Trade History" code="03 / EXEC" accent="cyan" delay={0.1}>
              <TradeHistoryPanel trades={displayTrades} />
            </CyberPanel>
          </GridItem>
        </Grid>
      </Box>
    </Box>
  );
}
