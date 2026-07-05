"use client";

import { Box, SimpleGrid, Text } from "@chakra-ui/react";
import type { AiUsageSummary } from "@bitbank-ai-trader/shared";
import { formatCostJpy } from "./format";

function formatTokens(value: number) {
  return value.toLocaleString("ja-JP");
}

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Box bg="bg.surfaceRaised" borderWidth="1px" borderColor="border.grid" px={4} py={3}>
      <Text
        fontFamily="heading"
        fontSize="10px"
        fontWeight="600"
        letterSpacing="0.16em"
        textTransform="uppercase"
        color="text.secondary"
      >
        {label}
      </Text>
      <Text fontFamily="mono" fontSize="xl" fontWeight="600" color="text.primary" mt={1} lineHeight="1.2">
        {value}
      </Text>
      {sub && (
        <Text fontFamily="mono" fontSize="11px" color="text.disabled" mt={1}>
          {sub}
        </Text>
      )}
    </Box>
  );
}

/** 直近30日(JST)のAIトークン使用量サマリタイル */
export function UsageSummaryTiles({ usage }: { usage: AiUsageSummary }) {
  const todayKey = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  const todayCost = usage.days.find((d) => d.date === todayKey)?.estimatedCostJpy ?? 0;

  return (
    <SimpleGrid columns={{ base: 2, md: 4 }} gap={3}>
      <Tile label="本日の推定コスト" value={formatCostJpy(todayCost)} sub="判断+生成の合算" />
      <Tile
        label="30日間の推定コスト"
        value={formatCostJpy(usage.totals.estimatedCostJpy)}
        sub={`判断${usage.totals.decisionCalls}回 / 生成${usage.totals.generationCalls}回`}
      />
      <Tile
        label="入力トークン (30日)"
        value={formatTokens(usage.totals.inputTokens)}
      />
      <Tile
        label="出力トークン (30日)"
        value={formatTokens(usage.totals.outputTokens)}
      />
    </SimpleGrid>
  );
}
