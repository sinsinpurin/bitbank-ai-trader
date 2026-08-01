"use client";

import { Box } from "@chakra-ui/react";
import { useEffect, useRef } from "react";
import {
  CandlestickSeries,
  ColorType,
  createChart,
  createSeriesMarkers,
  HistogramSeries,
  LineStyle,
  type CandlestickData,
  type HistogramData,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type ISeriesMarkersPluginApi,
  type SeriesMarker,
  type Time,
} from "lightweight-charts";

/** 保有中ポジションの建値ライン表示用(チャート側はPosition型に依存させないための最小情報) */
export interface EntryPriceLine {
  id: string;
  price: number;
  label: string;
}

/** ローソク足+出来高(下段のバー表示用) */
export type CandlestickWithVolume = CandlestickData & { volume: number };

const VOLUME_PANE_HEIGHT = 90;
const VOLUME_UP_COLOR = "rgba(57, 255, 136, 0.5)";
const VOLUME_DOWN_COLOR = "rgba(255, 0, 60, 0.5)";

interface PriceChartProps {
  data: CandlestickWithVolume[];
  /** 約定・シグナルの発生位置に表示するマーカー(時刻昇順) */
  markers?: SeriesMarker<Time>[];
  /** 保有中ポジションの建値に引く水平線(現在選択中のペア分のみ渡すこと) */
  entryPriceLines?: EntryPriceLine[];
  /** ペア・時間足切替などズームをリセットしてよいタイミングでのみ変更するキー */
  resetKey?: string;
}

export function PriceChart({ data, markers, entryPriceLines, resetKey }: PriceChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const markersApiRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
  const priceLinesRef = useRef<IPriceLine[]>([]);
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
        panes: {
          separatorColor: "rgba(0, 229, 255, 0.22)",
          separatorHoverColor: "rgba(0, 229, 255, 0.35)",
        },
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
      height: 360 + VOLUME_PANE_HEIGHT,
    });

    const series = chart.addSeries(CandlestickSeries, {
      upColor: "#39FF88",
      downColor: "#FF003C",
      borderVisible: false,
      wickUpColor: "#39FF88",
      wickDownColor: "#FF003C",
    });

    // 出来高は第2ペイン(価格チャートの下段)に配置する
    const volumeSeries = chart.addSeries(
      HistogramSeries,
      { color: VOLUME_UP_COLOR, priceFormat: { type: "volume" } },
      1
    );
    chart.panes()[1]?.setHeight(VOLUME_PANE_HEIGHT);

    chartRef.current = chart;
    seriesRef.current = series;
    volumeSeriesRef.current = volumeSeries;
    markersApiRef.current = null;
    // chart.remove()が既存の建値ラインも内部で破棄するため、ハンドルだけ空にしておく
    // (破棄済みハンドルにremovePriceLineを呼ばないように)
    priceLinesRef.current = [];

    const handleResize = () => {
      chart.applyOptions({ width: container.clientWidth });
    };
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      volumeSeriesRef.current = null;
      priceLinesRef.current = [];
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
    const volumeData: HistogramData[] = data.map((c) => ({
      time: c.time,
      value: c.volume,
      color: c.close >= c.open ? VOLUME_UP_COLOR : VOLUME_DOWN_COLOR,
    }));
    volumeSeriesRef.current?.setData(volumeData);
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

  // 建値ラインの更新。件数が少なく(通常AI_MAX_OPEN_POSITIONS以下)頻繁にも変わらないため、
  // 差分更新はせず毎回全て引き直す
  useEffect(() => {
    const series = seriesRef.current;
    if (!series) return;
    for (const line of priceLinesRef.current) {
      series.removePriceLine(line);
    }
    priceLinesRef.current = (entryPriceLines ?? []).map((entry) =>
      series.createPriceLine({
        price: entry.price,
        color: "#FCEE0A",
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: entry.label,
      })
    );
  }, [entryPriceLines]);

  return <Box ref={containerRef} width="100%" height={`${360 + VOLUME_PANE_HEIGHT}px`} />;
}
