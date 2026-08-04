"use client";

import { useCallback, useState } from "react";
import { Box, SimpleGrid, Stack, Text } from "@chakra-ui/react";
import type { BacktestRequest, BacktestSummary, CandleTimeframe, Pair, StrategyGraph } from "@noctas/shared";
import { CyberButton } from "@/components/ui/CyberButton";
import { EquityCurveChart } from "@/components/pnl/EquityCurveChart";
import { formatDateTime, formatJpy, formatSignedJpy, pnlColor } from "@/components/pnl/format";
import { runBacktest } from "@/lib/strategyApi";
import { riskFormToInput, type RiskFormValues } from "@/components/strategy/RiskSettingsPanel";

interface BacktestPanelProps {
  graph: StrategyGraph;
  pair: Pair;
  timeframe: CandleTimeframe;
  riskForm: RiskFormValues;
  maxPositionJpy: number;
}

interface TileProps {
  label: string;
  value: string;
  valueColor?: string;
  sub?: string;
}

function Tile({ label, value, valueColor = "#F2F2F5", sub }: TileProps) {
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

const REASON_LABEL: Record<string, string> = {
  stop_loss: "損切り",
  take_profit: "利確",
  trailing_stop: "トレーリング",
  bot_strategy: "BOT戦略",
};

/**
 * Bot Blueprintのキャンバス(保存前でも可)を、サーバーが保持している過去ローソク足履歴で
 * ウォークフォワード再生する読み取り専用バックテストパネル。DBへの書き込みは発生しない。
 */
export function BacktestPanel({ graph, pair, timeframe, riskForm, maxPositionJpy }: BacktestPanelProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<BacktestSummary | null>(null);

  const handleRun = useCallback(async () => {
    setError(null);
    const hasAction = graph.nodes.some((n) => n.type === "buy" || n.type === "sell");
    if (!hasAction) {
      setError("Buy / Sell ノードを最低1つ配置してください");
      return;
    }
    const risk = riskFormToInput(riskForm, maxPositionJpy);
    if (!risk.ok) {
      setError(risk.error);
      return;
    }
    setLoading(true);
    try {
      const request: BacktestRequest = { graph, pair, timeframe, ...risk.value };
      const result = await runBacktest(request);
      setSummary(result);
    } catch (err) {
      setSummary(null);
      setError(err instanceof Error ? err.message : "バックテストの実行に失敗しました");
    } finally {
      setLoading(false);
    }
  }, [graph, pair, timeframe, riskForm, maxPositionJpy]);

  return (
    <Stack gap={4}>
      <Stack direction="row" gap={3} align="center" flexWrap="wrap">
        <CyberButton variant="primary" onClick={handleRun} disabled={loading}>
          {loading ? "Running..." : "Run Backtest"}
        </CyberButton>
        <Text fontFamily="mono" fontSize="10px" color="text.disabled">
          保存前のキャンバスの内容をそのまま、サーバーが保持する過去ローソク足履歴で再生します(読み取り専用・保存なし)
        </Text>
      </Stack>

      {error && (
        <Text fontFamily="mono" fontSize="11px" color="signal.red">
          {error}
        </Text>
      )}

      {summary && summary.warnings.length > 0 && (
        <Stack gap={1} borderWidth="1px" borderColor="signal.orange" bg="bg.surfaceRaised" px={3} py={2}>
          {summary.warnings.map((warning, i) => (
            <Text key={i} fontFamily="mono" fontSize="11px" color="signal.orange">
              {"⚠ "}
              {warning}
            </Text>
          ))}
        </Stack>
      )}

      {summary && (
        <Stack gap={4}>
          <SimpleGrid columns={2} gap={3}>
            <Tile
              label="Realized P&L"
              value={formatSignedJpy(summary.realizedPnl)}
              valueColor={pnlColor(summary.realizedPnl)}
              sub={`${summary.candleCount}本のローソク足で再生`}
            />
            <Tile
              label="Trades"
              value={String(summary.trades.length)}
              sub={`${summary.winCount}勝 / ${summary.lossCount}敗`}
            />
            <Tile
              label="Win Rate"
              value={summary.winRate === null ? "--" : `${(summary.winRate * 100).toFixed(1)}%`}
            />
            <Tile
              label="Profit Factor"
              value={summary.profitFactor === null ? "--" : summary.profitFactor.toFixed(2)}
            />
            <Tile label="Max Drawdown" value={formatJpy(summary.maxDrawdown)} />
            <Tile label="Fees Paid" value={formatJpy(summary.totalFeesJpy)} />
            <Tile
              label="値幅合計(手数料前)"
              value={formatSignedJpy(summary.grossPnlJpy)}
              valueColor={pnlColor(summary.grossPnlJpy)}
              sub="手数料を引く前の合計損益"
            />
            <Tile
              label="手数料負け"
              value={`${summary.feeLossCount}件`}
              valueColor={summary.feeLossCount > 0 ? "signal.orange" : "#F2F2F5"}
              sub="方向は合っていたが手数料で純損失"
            />
          </SimpleGrid>

          <EquityCurveChart points={summary.equityCurve} />

          {summary.trades.length > 0 && (
            <Box overflowX="auto">
              <Box minWidth="560px" maxHeight="240px" overflowY="auto">
                {summary.trades
                  .slice()
                  .reverse()
                  .map((trade, i) => (
                    <Stack
                      key={i}
                      direction="row"
                      gap={4}
                      px={3}
                      py={2}
                      bg="bg.surfaceRaised"
                      borderBottomWidth="1px"
                      borderBottomColor="bg.surface"
                      align="center"
                    >
                      <Text fontFamily="mono" fontSize="xs" color="text.secondary" minW="100px">
                        {formatDateTime(trade.closedAt)}
                      </Text>
                      <Text fontFamily="mono" fontSize="xs" color="text.primary" minW="90px">
                        {formatJpy(trade.entryPrice)} → {formatJpy(trade.closePrice)}
                      </Text>
                      <Text fontFamily="mono" fontSize="xs" color="text.secondary" minW="80px">
                        {REASON_LABEL[trade.closeReason] ?? trade.closeReason}
                      </Text>
                      <Text fontFamily="mono" fontSize="xs" color={pnlColor(trade.pnl)}>
                        {formatSignedJpy(trade.pnl)}
                      </Text>
                    </Stack>
                  ))}
              </Box>
            </Box>
          )}
        </Stack>
      )}
    </Stack>
  );
}
