"use client";

import { Box } from "@chakra-ui/react";
import { useEffect, useRef } from "react";
import {
  CandlestickSeries,
  ColorType,
  createChart,
  createSeriesMarkers,
  type CandlestickData,
  type IChartApi,
  type ISeriesApi,
  type ISeriesMarkersPluginApi,
  type SeriesMarker,
  type Time,
} from "lightweight-charts";

interface PriceChartProps {
  data: CandlestickData[];
  /** 約定・シグナルの発生位置に表示するマーカー(時刻昇順) */
  markers?: SeriesMarker<Time>[];
  /** ペア・時間足切替などズームをリセットしてよいタイミングでのみ変更するキー */
  resetKey?: string;
}

export function PriceChart({ data, markers, resetKey }: PriceChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const markersApiRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
  // resetKeyが変わった後、最初にデータが届いたタイミングでのみfitContentするためのフラグ
  const pendingFitRef = useRef(true);

  // チャート本体はマウント時に一度だけ生成する。
  // 毎tickごとに再生成すると、ユーザーがホイールで調整したズーム/パン位置が
  // そのたびにリセットされてしまうため、以降はsetData/setMarkersで更新する。
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

    chartRef.current = chart;
    seriesRef.current = series;
    markersApiRef.current = null;

    const handleResize = () => {
      chart.applyOptions({ width: container.clientWidth });
    };
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      markersApiRef.current = null;
    };
  }, []);

  // ペア・時間足の切替時は、次に届く実データで一度だけfitContentし直す
  useEffect(() => {
    pendingFitRef.current = true;
  }, [resetKey]);

  // ローソク足データの更新。setData自体はズーム/パン位置を変えないが、
  // 初回ロード・ペア/時間足切替後の最初のデータ到着時だけは表示範囲をフィットさせる
  useEffect(() => {
    seriesRef.current?.setData(data);
    if (data.length > 0 && pendingFitRef.current) {
      chartRef.current?.timeScale().fitContent();
      pendingFitRef.current = false;
    }
  }, [data]);

  // マーカーの更新
  useEffect(() => {
    const series = seriesRef.current;
    if (!series) return;
    if (!markersApiRef.current) {
      markersApiRef.current = createSeriesMarkers(series, markers ?? []);
    } else {
      markersApiRef.current.setMarkers(markers ?? []);
    }
  }, [markers]);

  return <Box ref={containerRef} width="100%" height="360px" />;
}
