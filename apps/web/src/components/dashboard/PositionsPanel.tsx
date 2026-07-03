"use client";

import { Box, HStack, Stack, Text } from "@chakra-ui/react";
import type { Position } from "@bitbank-ai-trader/shared";

function formatJpy(value: number) {
  return `¥${Math.round(value).toLocaleString("ja-JP")}`;
}

export function PositionsPanel({
  positions,
  currentPrice,
}: {
  positions: Position[];
  currentPrice: number;
}) {
  const openPositions = positions.filter((p) => p.closedAt === null);

  if (openPositions.length === 0) {
    return (
      <Text fontSize="sm" color="text.disabled">
        現在保有中の仮想ポジションはありません。
      </Text>
    );
  }

  return (
    <Stack gap={3}>
      {openPositions.map((position) => {
        const unrealizedPnl =
          (currentPrice - position.entryPrice) * position.amount;
        const isProfit = unrealizedPnl >= 0;

        return (
          <Box
            key={position.id}
            bg="bg.surfaceRaised"
            p={3}
            borderWidth="1px"
            borderColor={isProfit ? "border.gridCyan" : "border.grid"}
          >
            <HStack justify="space-between">
              <Text
                fontFamily="heading"
                fontSize="11px"
                fontWeight="600"
                letterSpacing="0.14em"
                textTransform="uppercase"
                color="text.primary"
              >
                {position.pair.toUpperCase()} / {position.side.toUpperCase()}
              </Text>
              <Text
                fontFamily="mono"
                fontSize="sm"
                color={isProfit ? "signal.green" : "signal.red"}
              >
                {isProfit ? "+" : ""}
                {formatJpy(unrealizedPnl)}
              </Text>
            </HStack>
            <HStack justify="space-between" mt={1}>
              <Text fontSize="xs" color="text.secondary" fontFamily="mono">
                建値 {formatJpy(position.entryPrice)}
              </Text>
              <Text fontSize="xs" color="text.secondary" fontFamily="mono">
                数量 {position.amount} BTC
              </Text>
            </HStack>
          </Box>
        );
      })}
    </Stack>
  );
}
