"use client";

import { Badge, Box, HStack, Stack, Text } from "@chakra-ui/react";
import type { AiDecision } from "@bitbank-ai-trader/shared";

const ACTION_STYLE: Record<AiDecision["action"], { label: string; color: string }> = {
  buy: { label: "BUY", color: "#39ff88" },
  sell: { label: "SELL", color: "#ff3860" },
  hold: { label: "HOLD", color: "#ffd23f" },
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
              borderLeftWidth="3px"
              borderLeftColor={style.color}
              bg="whiteAlpha.50"
              borderRadius="md"
              p={3}
            >
              <HStack justify="space-between" mb={1}>
                <HStack gap={2}>
                  <Badge
                    bg="transparent"
                    color={style.color}
                    borderWidth="1px"
                    borderColor={style.color}
                    fontFamily="heading"
                    letterSpacing="0.05em"
                  >
                    {style.label}
                  </Badge>
                  <Text fontSize="xs" color="whiteAlpha.600">
                    信頼度 {Math.round(decision.confidence * 100)}%
                  </Text>
                </HStack>
                <Text fontSize="xs" color="whiteAlpha.500" fontFamily="mono">
                  {formatTime(decision.createdAt)}
                </Text>
              </HStack>
              <Text fontSize="sm" color="whiteAlpha.900">
                {decision.reasoning}
              </Text>
            </Box>
          );
        })}
    </Stack>
  );
}
