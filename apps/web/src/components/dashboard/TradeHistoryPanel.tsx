"use client";

import { Box, HStack, Stack, Text } from "@chakra-ui/react";
import type { Trade } from "@noctas/shared";

const SIDE_STYLE: Record<Trade["side"], { label: string; color: string }> = {
  buy: { label: "BUY", color: "#39FF88" },
  sell: { label: "SELL", color: "#FF003C" },
};

const REASON_STYLE: Record<Trade["reason"], { label: string; color: string }> = {
  ai_decision: { label: "AI判断", color: "#00E5FF" },
  bot_strategy: { label: "BOT戦略", color: "#00E5FF" },
  stop_loss: { label: "損切り", color: "#FF8A1E" },
  take_profit: { label: "利確", color: "#39FF88" },
  trailing_stop: { label: "トレーリング", color: "#FF8A1E" },
  manual: { label: "手動決済", color: "#FCEE0A" },
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
      <Text fontSize="sm" color="text.disabled">
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
            position="relative"
            bg="bg.surfaceRaised"
            p={2.5}
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
            <HStack justify="space-between">
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
                <Text fontFamily="mono" fontSize="10px" color="text.secondary">
                  {trade.pair.toUpperCase()}
                </Text>
                {trade.reason !== "ai_decision" && (
                  <Text
                    fontFamily="heading"
                    fontSize="10px"
                    letterSpacing="0.12em"
                    color={REASON_STYLE[trade.reason].color}
                  >
                    {REASON_STYLE[trade.reason].label}
                  </Text>
                )}
              </HStack>
              <Text fontSize="xs" color="text.disabled" fontFamily="mono">
                {formatTime(trade.executedAt)}
              </Text>
            </HStack>
            <HStack justify="space-between" mt={1}>
              <Text fontSize="sm" color="text.primary" fontFamily="mono">
                {formatJpy(trade.price)}
              </Text>
              <Text fontSize="xs" color="text.secondary" fontFamily="mono">
                数量 {trade.amount.toFixed(5)} BTC
              </Text>
            </HStack>
            {trade.fee !== undefined && (
              <Text fontSize="xs" color="text.disabled" fontFamily="mono" mt={0.5}>
                手数料 {formatJpy(trade.fee)}
              </Text>
            )}
          </Box>
        );
      })}
    </Stack>
  );
}
