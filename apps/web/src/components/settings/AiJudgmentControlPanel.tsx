"use client";

import { Box, HStack, Stack, Text } from "@chakra-ui/react";
import type { AiUsageSummary } from "@noctas/shared";
import { CyberButton } from "@/components/ui/CyberButton";
import { formatCostJpy } from "./format";

/**
 * AI判断(Bot Blueprintの「AI Judgment」ノードが使う、Claudeによる売買判断)のON/OFFと
 * 日次予算の消化状況。OFFにするとどの戦略のAI Judgmentノードも常にfalse扱いになる
 * (Bot戦略の技術的条件・自動損切りは影響なし)。
 */
export function AiJudgmentControlPanel({
  enabled,
  usage,
  saving,
  onToggle,
}: {
  enabled: boolean;
  usage: AiUsageSummary;
  saving: boolean;
  onToggle: (next: boolean) => void;
}) {
  const budgetRatio =
    usage.dailyBudgetJpy > 0
      ? Math.min(1, usage.todayDecisionCostJpy / usage.dailyBudgetJpy)
      : 0;
  const budgetColor = usage.budgetExceeded
    ? "#FF003C"
    : budgetRatio >= 0.8
      ? "#FF8A1E"
      : "#39FF88";

  return (
    <Stack gap={4}>
      <HStack justify="space-between" flexWrap="wrap" gap={3}>
        <Box>
          <HStack gap={2}>
            <Box
              width="8px"
              height="8px"
              bg={enabled ? "signal.green" : "signal.red"}
              boxShadow={enabled ? "0 0 8px rgba(57,255,136,.6)" : "glowRedSm"}
            />
            <Text fontFamily="heading" fontSize="13px" fontWeight="700" letterSpacing="0.1em" color="text.primary">
              {enabled ? "RUNNING" : "STOPPED"}
            </Text>
          </HStack>
          <Text fontSize="xs" color="text.secondary" mt={1}>
            {enabled
              ? "Bot BlueprintのAI Judgmentノードのために、Claudeが相場を定期分析しています(トークンを消費します)"
              : "AI判断は停止中です。AI Judgmentノードは常に不成立(false)として評価され、Bot戦略の技術的条件・自動損切りは引き続き動作します"}
          </Text>
        </Box>
        <CyberButton
          variant={enabled ? "danger" : "primary"}
          onClick={() => onToggle(!enabled)}
          disabled={saving}
        >
          {saving ? "SAVING..." : enabled ? "AI判断を停止" : "AI判断を開始"}
        </CyberButton>
      </HStack>

      <Box>
        <HStack justify="space-between" mb={1}>
          <Text fontFamily="heading" fontSize="10px" letterSpacing="0.14em" textTransform="uppercase" color="text.secondary">
            本日のAI判断コスト / 日次予算
          </Text>
          <Text fontFamily="mono" fontSize="11px" color={budgetColor}>
            {formatCostJpy(usage.todayDecisionCostJpy)} / {formatCostJpy(usage.dailyBudgetJpy)}
          </Text>
        </HStack>
        <Box height="6px" bg="bg.surfaceRaised" borderWidth="1px" borderColor="border.grid">
          <Box height="100%" width={`${budgetRatio * 100}%`} bg={budgetColor} transition="width 240ms ease" />
        </Box>
        {usage.budgetExceeded && (
          <Text fontFamily="mono" fontSize="10px" color="signal.red" mt={1}>
            予算超過のため、本日のAI判断呼び出しは自動停止しています
          </Text>
        )}
      </Box>

      <Stack gap={1} borderTopWidth="1px" borderTopColor="border.grid" pt={3}>
        <HStack justify="space-between">
          <Text fontSize="xs" color="text.secondary">売買判断モデル</Text>
          <Text fontFamily="mono" fontSize="xs" color="text.primary">{usage.decisionModel}</Text>
        </HStack>
        <HStack justify="space-between">
          <Text fontSize="xs" color="text.secondary">戦略生成モデル</Text>
          <Text fontFamily="mono" fontSize="xs" color="text.primary">{usage.strategyModel}</Text>
        </HStack>
      </Stack>
    </Stack>
  );
}
