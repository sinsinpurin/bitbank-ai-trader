"use client";

import { Box } from "@chakra-ui/react";
import { useEffect, useRef } from "react";
import {
  CandlestickSeries,
  ColorType,
  createChart,
  type CandlestickData,
} from "lightweight-charts";

interface PriceChartProps {
  data: CandlestickData[];
}

export function PriceChart({ data }: PriceChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const chart = createChart(container, {
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "#8fd8ff",
        fontFamily: "var(--font-rajdhani), sans-serif",
      },
      grid: {
        vertLines: { color: "rgba(0, 255, 240, 0.06)" },
        horzLines: { color: "rgba(0, 255, 240, 0.06)" },
      },
      rightPriceScale: { borderColor: "rgba(0, 255, 240, 0.2)" },
      timeScale: { borderColor: "rgba(0, 255, 240, 0.2)" },
      crosshair: {
        vertLine: { color: "#ff2ee6", labelBackgroundColor: "#ff2ee6" },
        horzLine: { color: "#ff2ee6", labelBackgroundColor: "#ff2ee6" },
      },
      width: container.clientWidth,
      height: 360,
    });

    const series = chart.addSeries(CandlestickSeries, {
      upColor: "#39ff88",
      downColor: "#ff3860",
      borderVisible: false,
      wickUpColor: "#39ff88",
      wickDownColor: "#ff3860",
    });

    series.setData(data);
    chart.timeScale().fitContent();

    const handleResize = () => {
      chart.applyOptions({ width: container.clientWidth });
    };
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      chart.remove();
    };
  }, [data]);

  return <Box ref={containerRef} width="100%" height="360px" />;
}
