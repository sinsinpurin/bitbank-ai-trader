"use client";

import { Box } from "@chakra-ui/react";
import { useEffect, useRef } from "react";
import {
  CandlestickSeries,
  ColorType,
  createChart,
  createSeriesMarkers,
  type CandlestickData,
  type SeriesMarker,
  type Time,
} from "lightweight-charts";

interface PriceChartProps {
  data: CandlestickData[];
  /** 約定・シグナルの発生位置に表示するマーカー(時刻昇順) */
  markers?: SeriesMarker<Time>[];
}

export function PriceChart({ data, markers }: PriceChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

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
        horzLine: { color: "#FCEE0A", labelBackgroundColor: "#FCEE0A" },
      },
      width: container.clientWidth,
      height: 360,
    });

    const series = chart.addSeries(CandlestickSeries, {
      upColor: "#39FF88",
      downColor: "#FF003C",
      borderVisible: false,
      wickUpColor: "#39FF88",
      wickDownColor: "#FF003C",
    });

    series.setData(data);
    if (markers && markers.length > 0) {
      createSeriesMarkers(series, markers);
    }
    chart.timeScale().fitContent();

    const handleResize = () => {
      chart.applyOptions({ width: container.clientWidth });
    };
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      chart.remove();
    };
  }, [data, markers]);

  return <Box ref={containerRef} width="100%" height="360px" />;
}
