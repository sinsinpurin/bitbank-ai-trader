"use client";

import { Box, HStack, Stack, Text } from "@chakra-ui/react";
import type { AiUsageStats } from "@bitbank-ai-trader/shared";

interface StatusMeterProps {
  connectionLabel: string;
  connected: boolean;
  signalStrength: number; // 0.0 - 1.0
  mode: "paper" | "live";
  usage?: AiUsageStats | null;
}

function Bar({ active, color }: { active: boolean; color: string }) {
  return (
    <Box
      flex="1"
      height="10px"
      borderRadius="sm"
      bg={active ? color : "whiteAlpha.100"}
      boxShadow={active ? `0 0 8px ${color}` : "none"}
      transition="all 0.3s"
    />
  );
}

export function StatusMeter({
  connectionLabel,
  connected,
  signalStrength,
  mode,
  usage,
}: StatusMeterProps) {
  const bars = 10;
  const filled = Math.round(signalStrength * bars);
  const barColor = signalStrength > 0.66 ? "#39ff88" : signalStrength > 0.33 ? "#ffd23f" : "#ff3860";

  return (
    <Stack gap={4}>
      <HStack justify="space-between">
        <Text fontSize="sm" color="whiteAlpha.700">
          接続状態
        </Text>
        <HStack gap={2}>
          <Box
            width="8px"
            height="8px"
            borderRadius="full"
            bg={connected ? "#39ff88" : "#ff3860"}
            boxShadow={`0 0 8px ${connected ? "#39ff88" : "#ff3860"}`}
          />
          <Text fontSize="sm" fontFamily="mono" color="whiteAlpha.900">
            {connectionLabel}
          </Text>
        </HStack>
      </HStack>

      <HStack justify="space-between">
        <Text fontSize="sm" color="whiteAlpha.700">
          動作モード
        </Text>
        <Text
          fontSize="sm"
          fontFamily="heading"
          letterSpacing="0.05em"
          color={mode === "paper" ? "#00fff0" : "#ff2ee6"}
        >
          {mode === "paper" ? "PAPER TRADE" : "LIVE"}
        </Text>
      </HStack>

      <Stack gap={1}>
        <Text fontSize="sm" color="whiteAlpha.700">
          シグナル強度
        </Text>
        <HStack gap={1}>
          {Array.from({ length: bars }).map((_, i) => (
            <Bar key={i} active={i < filled} color={barColor} />
          ))}
        </HStack>
      </Stack>

      {usage && (
        <Stack gap={1} pt={2} borderTopWidth="1px" borderTopColor="whiteAlpha.100">
          <HStack justify="space-between">
            <Text fontSize="sm" color="whiteAlpha.700">
              本日のAI利用({usage.model})
            </Text>
            <Text fontSize="xs" color="whiteAlpha.500" fontFamily="mono">
              {usage.callCount}回
            </Text>
          </HStack>
          <HStack justify="space-between">
            <Text fontSize="xs" color="whiteAlpha.600" fontFamily="mono">
              {(usage.inputTokens + usage.outputTokens).toLocaleString("ja-JP")} tok
            </Text>
            <Text
              fontSize="sm"
              fontFamily="mono"
              color={usage.budgetExceeded ? "#ff3860" : "#39ff88"}
            >
              ¥{usage.estimatedCostJpy.toFixed(1)} / ¥{usage.dailyBudgetJpy}
            </Text>
          </HStack>
          {usage.budgetExceeded && (
            <Text fontSize="xs" color="#ff3860">
              本日の予算上限に達したため、AI判断を一時停止中です
            </Text>
          )}
        </Stack>
      )}
    </Stack>
  );
}
