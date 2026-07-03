"use client";

import { Box, HStack, Stack, Text } from "@chakra-ui/react";
import type { AiUsageStats } from "@bitbank-ai-trader/shared";
import { ZoneTag } from "@/components/ui/ZoneTag";

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
      bg={active ? color : "bg.surfaceRaised"}
      boxShadow={active ? `0 0 6px ${color}` : "none"}
      transition="all 240ms cubic-bezier(.16,1,.3,1)"
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
  const barColor =
    signalStrength > 0.66 ? "#39FF88" : signalStrength > 0.33 ? "#FF8A1E" : "#FF003C";

  return (
    <Stack gap={4}>
      <HStack justify="space-between">
        <Text fontSize="sm" color="text.secondary">
          接続状態
        </Text>
        <HStack gap={2}>
          <Box
            width="8px"
            height="8px"
            borderRadius="full"
            bg={connected ? "signal.green" : "signal.red"}
            boxShadow={`0 0 8px ${connected ? "rgba(57,255,136,.6)" : "rgba(255,0,60,.6)"}`}
          />
          <Text fontSize="sm" fontFamily="mono" color="text.primary">
            {connectionLabel}
          </Text>
        </HStack>
      </HStack>

      <HStack justify="space-between">
        <Text fontSize="sm" color="text.secondary">
          動作モード
        </Text>
        <ZoneTag
          label={mode === "paper" ? "Mode : Paper" : "Mode : Live"}
          tone={mode === "paper" ? "cyan" : "red"}
        />
      </HStack>

      <Stack gap={1}>
        <Text fontSize="sm" color="text.secondary">
          シグナル強度
        </Text>
        <HStack gap={1}>
          {Array.from({ length: bars }).map((_, i) => (
            <Bar key={i} active={i < filled} color={barColor} />
          ))}
        </HStack>
      </Stack>

      {usage && (
        <Stack gap={1} pt={2} borderTopWidth="1px" borderTopColor="border.gridCyan">
          <HStack justify="space-between">
            <Text fontSize="sm" color="text.secondary">
              本日のAI利用({usage.model})
            </Text>
            <Text fontSize="xs" color="text.secondary" fontFamily="mono">
              {usage.callCount}回
            </Text>
          </HStack>
          <HStack justify="space-between">
            <Text fontSize="xs" color="text.secondary" fontFamily="mono">
              {(usage.inputTokens + usage.outputTokens).toLocaleString("ja-JP")} tok
            </Text>
            <Text
              fontSize="sm"
              fontFamily="mono"
              color={usage.budgetExceeded ? "signal.red" : "signal.cyan"}
            >
              ¥{usage.estimatedCostJpy.toFixed(1)} / ¥{usage.dailyBudgetJpy}
            </Text>
          </HStack>
          {usage.budgetExceeded && (
            <Text fontSize="xs" color="signal.orange">
              本日の予算上限に達したため、AI判断を一時停止中です
            </Text>
          )}
        </Stack>
      )}
    </Stack>
  );
}
