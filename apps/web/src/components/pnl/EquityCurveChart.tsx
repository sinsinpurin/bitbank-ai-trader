"use client";

import { Box, Text } from "@chakra-ui/react";
import { useEffect, useRef } from "react";
import {
  BaselineSeries,
  ColorType,
  createChart,
  type UTCTimestamp,
} from "lightweight-charts";
import type { PnlCurvePoint } from "@bitbank-ai-trader/shared";
import { formatJpy, formatSignedJpy, pnlColor, LOSS_COLOR, PROFIT_COLOR } from "./format";

/** チャートの時刻軸をJSTで読めるようにするオフセット(lightweight-chartsはUTC表示のため) */
const JST_OFFSET_SEC = 9 * 60 * 60;

interface EquityCurveChartProps {
  points: PnlCurvePoint[];
}

/**
 * 累積実現損益カーブ。ゼロ基準のBaselineSeriesで、利益圏=緑/損失圏=赤に塗り分ける。
 * 色に加えてゼロ基準線と符号付きツールチップで極性を冗長化している。
 */
export function EquityCurveChart({ points }: EquityCurveChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    const tooltip = tooltipRef.current;
    if (!container || !tooltip || points.length === 0) return;

    const chart = createChart(container, {
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "#9A9AA6",
        fontFamily: "var(--font-jetbrains-mono), monospace",
      },
      grid: {
        vertLines: { color: "rgba(0, 229, 255, 0.06)" },
        horzLines: { color: "rgba(0, 229, 255, 0.06)" },
      },
      rightPriceScale: { borderColor: "rgba(0, 229, 255, 0.22)" },
      timeScale: {
        borderColor: "rgba(0, 229, 255, 0.22)",
        timeVisible: true,
        secondsVisible: false,
      },
      crosshair: {
        vertLine: { color: "#FCEE0A", labelBackgroundColor: "#FCEE0A" },
        horzLine: { color: "#FCEE0A", labelBackgroundColor: "#FCEE0A" },
      },
      localization: {
        priceFormatter: (v: number) => formatJpy(v),
      },
      width: container.clientWidth,
      height: 320,
    });

    const series = chart.addSeries(BaselineSeries, {
      baseValue: { type: "price", price: 0 },
      topLineColor: PROFIT_COLOR,
      topFillColor1: "rgba(57, 255, 136, 0.28)",
      topFillColor2: "rgba(57, 255, 136, 0.02)",
      bottomLineColor: LOSS_COLOR,
      bottomFillColor1: "rgba(255, 0, 60, 0.02)",
      bottomFillColor2: "rgba(255, 0, 60, 0.28)",
      lineWidth: 2,
      priceLineVisible: false,
    });

    series.setData(
      points.map((p) => ({
        time: (p.time + JST_OFFSET_SEC) as UTCTimestamp,
        value: p.value,
      }))
    );
    series.createPriceLine({
      price: 0,
      color: "rgba(154, 154, 166, 0.5)",
      lineWidth: 1,
      lineStyle: 3,
      axisLabelVisible: false,
      title: "",
    });
    chart.timeScale().fitContent();

    chart.subscribeCrosshairMove((param) => {
      const data = param.seriesData.get(series) as { value?: number } | undefined;
      if (!param.point || param.time === undefined || data?.value === undefined) {
        tooltip.style.display = "none";
        return;
      }
      const date = new Date(((param.time as number) - JST_OFFSET_SEC) * 1000);
      tooltip.textContent = `${date.toLocaleString("ja-JP", {
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      })}  ${formatSignedJpy(data.value)}`;
      tooltip.style.color = pnlColor(data.value);
      tooltip.style.display = "block";
      const x = Math.min(param.point.x + 12, container.clientWidth - tooltip.offsetWidth - 8);
      tooltip.style.left = `${Math.max(0, x)}px`;
      tooltip.style.top = `${Math.max(0, param.point.y - 28)}px`;
    });

    const handleResize = () => {
      chart.applyOptions({ width: container.clientWidth });
    };
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      chart.remove();
    };
  }, [points]);

  if (points.length === 0) {
    return (
      <Text fontSize="sm" color="text.disabled">
        決済済みの取引がまだないため、損益カーブは表示できません。
      </Text>
    );
  }

  return (
    <Box position="relative" width="100%" height="320px">
      <Box ref={containerRef} width="100%" height="100%" />
      <Box
        ref={tooltipRef}
        position="absolute"
        display="none"
        px={2}
        py={1}
        bg="bg.surfaceRaised"
        borderWidth="1px"
        borderColor="border.gridCyan"
        fontFamily="mono"
        fontSize="11px"
        pointerEvents="none"
        whiteSpace="nowrap"
        zIndex={2}
      />
    </Box>
  );
}
