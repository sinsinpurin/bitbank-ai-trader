"use client";

import { Box, Grid, Text } from "@chakra-ui/react";
import type { AiUsageDay } from "@noctas/shared";
import { formatCostJpy } from "./format";

const COLUMNS = "minmax(90px, 1fr) repeat(2, minmax(70px, 0.8fr)) repeat(2, minmax(100px, 1fr)) minmax(90px, 1fr)";

function HeaderCell({ children, align = "left" }: { children: string; align?: "left" | "right" }) {
  return (
    <Text
      fontFamily="heading"
      fontSize="10px"
      fontWeight="600"
      letterSpacing="0.14em"
      textTransform="uppercase"
      color="text.disabled"
      textAlign={align}
    >
      {children}
    </Text>
  );
}

/** JST日別のAIトークン使用量テーブル(直近30日) */
export function UsageDailyTable({ days }: { days: AiUsageDay[] }) {
  if (days.length === 0) {
    return (
      <Text fontSize="sm" color="text.disabled">
        直近30日間のAI呼び出しはまだありません。
      </Text>
    );
  }

  return (
    <Box overflowX="auto">
      <Box minWidth="640px">
        <Grid templateColumns={COLUMNS} gap={3} px={3} pb={2}>
          <HeaderCell>日付 (JST)</HeaderCell>
          <HeaderCell align="right">判断</HeaderCell>
          <HeaderCell align="right">生成</HeaderCell>
          <HeaderCell align="right">入力トークン</HeaderCell>
          <HeaderCell align="right">出力トークン</HeaderCell>
          <HeaderCell align="right">推定コスト</HeaderCell>
        </Grid>

        <Box maxHeight="320px" overflowY="auto">
          {days.map((day) => (
            <Grid
              key={day.date}
              templateColumns={COLUMNS}
              gap={3}
              px={3}
              py={2}
              bg="bg.surfaceRaised"
              borderBottomWidth="1px"
              borderBottomColor="bg.surface"
              alignItems="center"
            >
              <Text fontFamily="mono" fontSize="xs" color="text.primary">
                {day.date}
              </Text>
              <Text fontFamily="mono" fontSize="xs" color="text.secondary" textAlign="right">
                {day.decisionCalls}回
              </Text>
              <Text fontFamily="mono" fontSize="xs" color="text.secondary" textAlign="right">
                {day.generationCalls}回
              </Text>
              <Text fontFamily="mono" fontSize="xs" color="text.secondary" textAlign="right">
                {day.inputTokens.toLocaleString("ja-JP")}
              </Text>
              <Text fontFamily="mono" fontSize="xs" color="text.secondary" textAlign="right">
                {day.outputTokens.toLocaleString("ja-JP")}
              </Text>
              <Text fontFamily="mono" fontSize="xs" color="text.primary" textAlign="right">
                {formatCostJpy(day.estimatedCostJpy)}
              </Text>
            </Grid>
          ))}
        </Box>
      </Box>
    </Box>
  );
}
