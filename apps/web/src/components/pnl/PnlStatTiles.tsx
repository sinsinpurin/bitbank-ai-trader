"use client";

import { Box, SimpleGrid, Text } from "@chakra-ui/react";
import type { PnlSummary } from "@bitbank-ai-trader/shared";
import { formatJpy, formatSignedJpy, pnlColor } from "./format";

interface TileProps {
  label: string;
  value: string;
  valueColor?: string;
  sub?: string;
}

function StatTile({ label, value, valueColor = "#F2F2F5", sub }: TileProps) {
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
      <Text fontFamily="mono" fontSize="xl" fontWeight="600" color={valueColor} mt={1} lineHeight="1.2">
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

/** 損益ダッシュボードのKPIタイル群。損益値は色に加えて必ず+/-符号を併記する */
export function PnlStatTiles({ summary }: { summary: PnlSummary }) {
  const {
    totalPnl,
    realizedPnl,
    unrealizedPnl,
    winCount,
    lossCount,
    winRate,
    profitFactor,
    maxDrawdown,
    equityJpy,
    initialBalanceJpy,
  } = summary;

  const equityChangePct =
    initialBalanceJpy > 0 ? ((equityJpy - initialBalanceJpy) / initialBalanceJpy) * 100 : 0;

  return (
    <SimpleGrid columns={{ base: 2, md: 3, xl: 6 }} gap={3}>
      <StatTile
        label="Total P&L / 総損益"
        value={formatSignedJpy(totalPnl)}
        valueColor={pnlColor(totalPnl)}
        sub="実現+含み"
      />
      <StatTile
        label="Realized / 実現損益"
        value={formatSignedJpy(realizedPnl)}
        valueColor={pnlColor(realizedPnl)}
        sub={`${winCount + lossCount}回の決済 / 手数料¥${Math.round(summary.totalFeesJpy).toLocaleString("ja-JP")}控除済`}
      />
      <StatTile
        label="Unrealized / 含み損益"
        value={formatSignedJpy(unrealizedPnl)}
        valueColor={pnlColor(unrealizedPnl)}
        sub={`保有 ${summary.openPositions.length}件`}
      />
      <StatTile
        label="Win Rate / 勝率"
        value={winRate === null ? "--" : `${(winRate * 100).toFixed(1)}%`}
        sub={`${winCount}勝 / ${lossCount}敗`}
      />
      <StatTile
        label="Profit Factor"
        value={profitFactor === null ? "--" : profitFactor.toFixed(2)}
        sub={`最大DD ${formatJpy(maxDrawdown)}`}
      />
      <StatTile
        label="Equity / 総資産"
        value={formatJpy(equityJpy)}
        valueColor={pnlColor(equityJpy - initialBalanceJpy)}
        sub={`初期比 ${equityChangePct >= 0 ? "+" : ""}${equityChangePct.toFixed(2)}%`}
      />
    </SimpleGrid>
  );
}
