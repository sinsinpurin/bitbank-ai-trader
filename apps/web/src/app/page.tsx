"use client";

import { Box, Grid, GridItem, Heading, HStack, Text } from "@chakra-ui/react";
import { NeonCard } from "@/components/dashboard/NeonCard";
import { PriceChart } from "@/components/dashboard/PriceChart";
import { AiLogPanel } from "@/components/dashboard/AiLogPanel";
import { PositionsPanel } from "@/components/dashboard/PositionsPanel";
import { StatusMeter } from "@/components/dashboard/StatusMeter";
import { generateMockCandles, mockAiDecisions, mockPositions } from "@/lib/mockData";
import { useServerEvents } from "@/lib/useServerEvents";

const seedCandles = generateMockCandles();

export default function DashboardPage() {
  const { connected, candles, aiDecisions, positions, usage } = useServerEvents(seedCandles);

  const displayDecisions = aiDecisions.length > 0 ? aiDecisions : mockAiDecisions;
  const displayPositions = positions.length > 0 ? positions : mockPositions;
  const currentPrice = candles[candles.length - 1]?.close ?? seedCandles[seedCandles.length - 1].close;

  return (
    <Box minH="100vh" px={{ base: 4, md: 10 }} py={8}>
      <HStack justify="space-between" mb={8} align="flex-end" flexWrap="wrap" gap={4}>
        <Box>
          <Heading
            fontFamily="heading"
            fontSize={{ base: "2xl", md: "3xl" }}
            letterSpacing="0.06em"
            color="#00fff0"
            css={{ textShadow: "0 0 16px rgba(0,255,240,0.5)" }}
          >
            BITBANK AI TRADER
          </Heading>
          <Text fontSize="sm" color="whiteAlpha.600" mt={1}>
            Claude搭載 AI売買判断ダッシュボード ― BTC/JPY ペーパートレード
          </Text>
        </Box>
      </HStack>

      <Grid templateColumns={{ base: "1fr", xl: "2fr 1fr" }} gap={6}>
        <GridItem>
          <NeonCard title="Price Chart / BTC_JPY" accent="cyan" delay={0}>
            <PriceChart data={candles} />
          </NeonCard>
        </GridItem>

        <GridItem>
          <NeonCard title="System Status" accent="green" delay={0.1}>
            <StatusMeter
              connectionLabel={connected ? "STREAM CONNECTED" : "DISCONNECTED"}
              connected={connected}
              signalStrength={0.78}
              mode="paper"
              usage={usage}
            />
          </NeonCard>
        </GridItem>

        <GridItem>
          <NeonCard title="AI Decision Log" accent="magenta" delay={0.15}>
            <AiLogPanel decisions={displayDecisions} />
          </NeonCard>
        </GridItem>

        <GridItem>
          <NeonCard title="Positions / P&L" accent="violet" delay={0.2}>
            <PositionsPanel positions={displayPositions} currentPrice={currentPrice} />
          </NeonCard>
        </GridItem>
      </Grid>
    </Box>
  );
}
