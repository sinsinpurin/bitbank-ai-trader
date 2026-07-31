"use client";

import { Box, HStack, Stack, Text } from "@chakra-ui/react";
import type { BotSignal } from "@noctas/shared";

function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString("ja-JP", { hour12: false });
}

export function BotSignalFeed({ signals }: { signals: BotSignal[] }) {
  if (signals.length === 0) {
    return (
      <Text fontSize="sm" color="text.disabled">
        Botシグナルはまだありません。戦略をDeployすると発火時にここへ流れます。
      </Text>
    );
  }

  return (
    <Stack gap={2} maxHeight="240px" overflowY="auto">
      {signals.map((signal) => {
        const color = signal.action === "buy" ? "#39FF88" : "#FF003C";
        return (
          <Box
            key={signal.id}
            position="relative"
            bg="bg.surfaceRaised"
            p={2.5}
            pl={4}
            opacity={signal.executed ? 1 : 0.6}
            _before={{
              content: '""',
              position: "absolute",
              left: 0,
              top: 0,
              bottom: 0,
              width: "4px",
              bg: color,
            }}
          >
            <HStack justify="space-between">
              <HStack gap={3}>
                <Text
                  fontFamily="heading"
                  fontSize="11px"
                  fontWeight="600"
                  letterSpacing="0.14em"
                  color={color}
                >
                  {signal.action.toUpperCase()}
                </Text>
                <Text fontSize="xs" color="text.secondary" fontFamily="mono" truncate>
                  {signal.strategyName}
                </Text>
              </HStack>
              <Text fontSize="xs" color="text.disabled" fontFamily="mono">
                {formatTime(signal.triggeredAt)}
              </Text>
            </HStack>
            <HStack justify="space-between" mt={1}>
              <Text fontSize="xs" color="text.secondary">
                {signal.note}
              </Text>
              <Text fontSize="xs" color="text.primary" fontFamily="mono">
                ¥{Math.round(signal.price).toLocaleString("ja-JP")}
              </Text>
            </HStack>
          </Box>
        );
      })}
    </Stack>
  );
}
