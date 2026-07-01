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
        textColor: "#e6e2c8",
        fontFamily: "var(--font-rajdhani), sans-serif",
      },
      grid: {
        vertLines: { color: "rgba(85, 234, 212, 0.06)" },
        horzLines: { color: "rgba(85, 234, 212, 0.06)" },
      },
      rightPriceScale: { borderColor: "rgba(85, 234, 212, 0.2)" },
      timeScale: { borderColor: "rgba(85, 234, 212, 0.2)" },
      crosshair: {
        vertLine: { color: "#f3e600", labelBackgroundColor: "#f3e600" },
        horzLine: { color: "#f3e600", labelBackgroundColor: "#f3e600" },
      },
      width: container.clientWidth,
      height: 360,
    });

    const series = chart.addSeries(CandlestickSeries, {
      upColor: "#55ead4",
      downColor: "#c5003c",
      borderVisible: false,
      wickUpColor: "#55ead4",
      wickDownColor: "#c5003c",
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
