"use client";

import { Box, Text } from "@chakra-ui/react";
import { useEffect, useRef } from "react";
import { ColorType, createChart, HistogramSeries } from "lightweight-charts";
import type { PnlDailyPoint } from "@noctas/shared";
import { formatJpy, formatSignedJpy, pnlColor, LOSS_COLOR, PROFIT_COLOR } from "./format";

interface DailyPnlChartProps {
  points: PnlDailyPoint[];
}

/** JST日次の実現損益バー。ゼロ基準から上下に伸び、利益=緑/損失=赤 */
export function DailyPnlChart({ points }: DailyPnlChartProps) {
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
      timeScale: { borderColor: "rgba(0, 229, 255, 0.22)" },
      crosshair: {
        vertLine: { color: "#FCEE0A", labelBackgroundColor: "#FCEE0A" },
        horzLine: { visible: false, labelVisible: false },
      },
      localization: {
        priceFormatter: (v: number) => formatJpy(v),
      },
      width: container.clientWidth,
      height: 260,
    });

    const series = chart.addSeries(HistogramSeries, {
      base: 0,
      priceLineVisible: false,
    });

    series.setData(
      points.map((p) => ({
        time: p.date,
        value: p.pnl,
        color: p.pnl >= 0 ? PROFIT_COLOR : LOSS_COLOR,
      }))
    );
    chart.timeScale().fitContent();

    const byDate = new Map(points.map((p) => [p.date, p]));

    chart.subscribeCrosshairMove((param) => {
      const data = param.seriesData.get(series) as { value?: number } | undefined;
      if (!param.point || param.time === undefined || data?.value === undefined) {
        tooltip.style.display = "none";
        return;
      }
      const t = param.time as { year: number; month: number; day: number };
      const dateKey = `${t.year}-${String(t.month).padStart(2, "0")}-${String(t.day).padStart(2, "0")}`;
      const point = byDate.get(dateKey);
      tooltip.textContent = `${dateKey}  ${formatSignedJpy(data.value)}${
        point ? `  (${point.tradeCount}件)` : ""
      }`;
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
        決済済みの取引がまだないため、日次損益は表示できません。
      </Text>
    );
  }

  return (
    <Box position="relative" width="100%" height="260px">
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
