"use client";

import { Badge, Box, HStack, Stack, Text } from "@chakra-ui/react";
import type { Trade } from "@bitbank-ai-trader/shared";

const SIDE_STYLE: Record<Trade["side"], { label: string; color: string }> = {
  buy: { label: "BUY", color: "#55ead4" },
  sell: { label: "SELL", color: "#c5003c" },
};

const REASON_LABEL: Record<Trade["reason"], string> = {
  ai_decision: "AI判断",
  stop_loss: "損切り",
};

function formatJpy(value: number) {
  return `¥${Math.round(value).toLocaleString("ja-JP")}`;
}

function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString("ja-JP", { hour12: false });
}

export function TradeHistoryPanel({ trades }: { trades: Trade[] }) {
  if (trades.length === 0) {
    return (
      <Text fontSize="sm" color="whiteAlpha.500">
        約定履歴はまだありません。
      </Text>
    );
  }

  return (
    <Stack gap={2} maxHeight="280px" overflowY="auto">
      {trades.map((trade) => {
        const style = SIDE_STYLE[trade.side];
        return (
          <Box
            key={trade.id}
            borderLeftWidth="3px"
            borderLeftColor={style.color}
            bg="whiteAlpha.50"
            borderRadius="md"
            p={2.5}
          >
            <HStack justify="space-between">
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
                {trade.reason === "stop_loss" && (
                  <Badge bg="transparent" color="#880425" borderWidth="1px" borderColor="#880425">
                    {REASON_LABEL[trade.reason]}
                  </Badge>
                )}
              </HStack>
              <Text fontSize="xs" color="whiteAlpha.500" fontFamily="mono">
                {formatTime(trade.executedAt)}
              </Text>
            </HStack>
            <HStack justify="space-between" mt={1}>
              <Text fontSize="sm" color="whiteAlpha.900" fontFamily="mono">
                {formatJpy(trade.price)}
              </Text>
              <Text fontSize="xs" color="whiteAlpha.600">
                数量 {trade.amount.toFixed(5)} BTC
              </Text>
            </HStack>
          </Box>
        );
      })}
    </Stack>
  );
}
