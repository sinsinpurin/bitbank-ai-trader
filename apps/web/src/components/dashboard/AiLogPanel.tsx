"use client";

import { Box, HStack, Stack, Text } from "@chakra-ui/react";
import type { AiDecision } from "@bitbank-ai-trader/shared";

const ACTION_STYLE: Record<AiDecision["action"], { label: string; color: string }> = {
  buy: { label: "BUY", color: "#39FF88" },
  sell: { label: "SELL", color: "#FF003C" },
  hold: { label: "HOLD", color: "#9A9AA6" },
};

function formatTime(ts: number) {
  const date = new Date(ts);
  return date.toLocaleTimeString("ja-JP", { hour12: false });
}

export function AiLogPanel({ decisions }: { decisions: AiDecision[] }) {
  return (
    <Stack gap={3} maxHeight="360px" overflowY="auto">
      {decisions
        .slice()
        .reverse()
        .map((decision) => {
          const style = ACTION_STYLE[decision.action];
          return (
            <Box
              key={decision.id}
              position="relative"
              bg="bg.surfaceRaised"
              p={3}
              pl={4}
              _before={{
                content: '""',
                position: "absolute",
                left: 0,
                top: 0,
                bottom: 0,
                width: "4px",
                bg: style.color,
              }}
            >
              <HStack justify="space-between" mb={1}>
                <HStack gap={3}>
                  <Text
                    fontFamily="heading"
                    fontSize="11px"
                    fontWeight="600"
                    letterSpacing="0.14em"
                    color={style.color}
                  >
                    {style.label}
                  </Text>
                  <Text fontSize="xs" color="text.secondary" fontFamily="mono">
                    CONF {Math.round(decision.confidence * 100)}%
                  </Text>
                </HStack>
                <Text fontSize="xs" color="text.disabled" fontFamily="mono">
                  {formatTime(decision.createdAt)}
                </Text>
              </HStack>
              <Text fontSize="sm" color="text.primary">
                {decision.reasoning}
              </Text>
            </Box>
          );
        })}
    </Stack>
  );
}
