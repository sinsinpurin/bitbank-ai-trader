"use client";

import { Box, Grid, Text } from "@chakra-ui/react";
import type { ClosedPositionRecord, TradeReason } from "@bitbank-ai-trader/shared";
import {
  formatDateTime,
  formatDuration,
  formatJpy,
  formatSignedJpy,
  pnlColor,
} from "./format";

const REASON_LABEL: Record<TradeReason, string> = {
  ai_decision: "AI判断",
  stop_loss: "損切り",
  bot_strategy: "BOT戦略",
  take_profit: "利確",
  trailing_stop: "トレーリング",
};

const COLUMNS = "minmax(90px, 1fr) minmax(80px, 0.8fr) minmax(70px, 0.8fr) repeat(2, minmax(100px, 1fr)) minmax(90px, 0.9fr) minmax(70px, 0.8fr) minmax(100px, 1fr)";

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

/** 決済済みポジションの一覧テーブル(チャートの数値を表でも読めるようにする) */
export function ClosedPositionsTable({ positions }: { positions: ClosedPositionRecord[] }) {
  if (positions.length === 0) {
    return (
      <Text fontSize="sm" color="text.disabled">
        決済済みの取引はまだありません。
      </Text>
    );
  }

  return (
    <Box overflowX="auto">
      <Box minWidth="800px">
        <Grid templateColumns={COLUMNS} gap={3} px={3} pb={2}>
          <HeaderCell>決済日時</HeaderCell>
          <HeaderCell>ペア</HeaderCell>
          <HeaderCell>保有時間</HeaderCell>
          <HeaderCell align="right">建値</HeaderCell>
          <HeaderCell align="right">決済値</HeaderCell>
          <HeaderCell align="right">数量 BTC</HeaderCell>
          <HeaderCell>理由</HeaderCell>
          <HeaderCell align="right">損益</HeaderCell>
        </Grid>

        <Box maxHeight="320px" overflowY="auto">
          {positions.map((position) => {
            const pnl = position.pnl ?? 0;
            return (
              <Grid
                key={position.id}
                templateColumns={COLUMNS}
                gap={3}
                px={3}
                py={2}
                bg="bg.surfaceRaised"
                borderBottomWidth="1px"
                borderBottomColor="bg.surface"
                alignItems="center"
              >
                <Text fontFamily="mono" fontSize="xs" color="text.secondary">
                  {position.closedAt !== null ? formatDateTime(position.closedAt) : "--"}
                </Text>
                <Text fontFamily="mono" fontSize="xs" color="signal.cyan">
                  {position.pair.toUpperCase()}
                </Text>
                <Text fontFamily="mono" fontSize="xs" color="text.secondary">
                  {position.closedAt !== null
                    ? formatDuration(position.closedAt - position.openedAt)
                    : "--"}
                </Text>
                <Text fontFamily="mono" fontSize="xs" color="text.primary" textAlign="right">
                  {formatJpy(position.entryPrice)}
                </Text>
                <Text fontFamily="mono" fontSize="xs" color="text.primary" textAlign="right">
                  {position.closePrice !== null ? formatJpy(position.closePrice) : "--"}
                </Text>
                <Text fontFamily="mono" fontSize="xs" color="text.secondary" textAlign="right">
                  {position.amount.toFixed(5)}
                </Text>
                <Text fontFamily="mono" fontSize="xs" color="text.secondary">
                  {position.closeReason ? REASON_LABEL[position.closeReason] : "--"}
                </Text>
                <Text fontFamily="mono" fontSize="xs" color={pnlColor(pnl)} textAlign="right">
                  {formatSignedJpy(pnl)}
                </Text>
              </Grid>
            );
          })}
        </Box>
      </Box>
    </Box>
  );
}
