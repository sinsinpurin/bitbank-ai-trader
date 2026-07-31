"use client";

import { useState } from "react";
import { Box, HStack, Stack, Text } from "@chakra-ui/react";
import type { Position } from "@noctas/shared";
import { CyberButton } from "@/components/ui/CyberButton";
import { closePositionManually } from "@/lib/tradingApi";

function formatJpy(value: number) {
  return `¥${Math.round(value).toLocaleString("ja-JP")}`;
}

export function PositionsPanel({
  positions,
  currentPrice,
}: {
  positions: Position[];
  currentPrice: number;
}) {
  // 決済APIの応答を待つ間だけそのポジションのボタンを無効化する。
  // 実際にリストから消えるのはWSのposition_updateがclosedAt付きで届いた瞬間
  // (openPositionsのフィルタで自然に外れる)なので、ここでは連打防止のみ管理する
  const [closingId, setClosingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const openPositions = positions.filter((p) => p.closedAt === null);

  const handleClose = async (position: Position) => {
    if (closingId) return;
    if (
      !window.confirm(
        `${position.pair.toUpperCase()} / ${position.side.toUpperCase()} (数量 ${position.amount}) を現在値で成行決済しますか?`
      )
    ) {
      return;
    }
    setError(null);
    setClosingId(position.id);
    try {
      await closePositionManually(position.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "決済に失敗しました");
    } finally {
      setClosingId(null);
    }
  };

  if (openPositions.length === 0) {
    return (
      <Text fontSize="sm" color="text.disabled">
        現在保有中の仮想ポジションはありません。
      </Text>
    );
  }

  return (
    <Stack gap={3}>
      {error && (
        <Text fontFamily="mono" fontSize="11px" color="signal.red">
          {error}
        </Text>
      )}
      {openPositions.map((position) => {
        const unrealizedPnl =
          (currentPrice - position.entryPrice) * position.amount;
        const isProfit = unrealizedPnl >= 0;

        return (
          <Box
            key={position.id}
            bg="bg.surfaceRaised"
            p={3}
            borderWidth="1px"
            borderColor={isProfit ? "border.gridCyan" : "border.grid"}
          >
            <HStack justify="space-between">
              <Text
                fontFamily="heading"
                fontSize="11px"
                fontWeight="600"
                letterSpacing="0.14em"
                textTransform="uppercase"
                color="text.primary"
              >
                {position.pair.toUpperCase()} / {position.side.toUpperCase()}
              </Text>
              <HStack gap={3}>
                <Text
                  fontFamily="mono"
                  fontSize="sm"
                  color={isProfit ? "signal.green" : "signal.red"}
                >
                  {isProfit ? "+" : ""}
                  {formatJpy(unrealizedPnl)}
                </Text>
                <CyberButton
                  size="sm"
                  variant="danger"
                  disabled={closingId === position.id}
                  onClick={() => handleClose(position)}
                >
                  {closingId === position.id ? "決済中..." : "決済"}
                </CyberButton>
              </HStack>
            </HStack>
            <HStack justify="space-between" mt={1}>
              <Text fontSize="xs" color="text.secondary" fontFamily="mono">
                建値 {formatJpy(position.entryPrice)}
              </Text>
              <Text fontSize="xs" color="text.secondary" fontFamily="mono">
                数量 {position.amount} {position.pair.split("_")[0].toUpperCase()}
              </Text>
            </HStack>
          </Box>
        );
      })}
    </Stack>
  );
}
