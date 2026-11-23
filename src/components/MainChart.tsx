import React, { useEffect, useRef, useState, useMemo, useImperativeHandle, forwardRef } from 'react';
import {
  createChart,
  ColorType,
  CrosshairMode,
  PriceScaleMode,
  CandlestickSeries,
  LineSeries,
  AreaSeries,
  BarSeries,
  BaselineSeries,
  HistogramSeries,
  IChartApi,
  ISeriesApi,
  LineStyle,
  LineType,
} from 'lightweight-charts';
import {
  Asset,
  ChartType,
  Drawing,
  DrawingToolType,
  IndicatorSettings,
  OHLCV,
  Timeframe,
  PaperPosition,
  DependencyContext,
} from '../types';
import {
  calculateSMA,
  calculateEMA,
  calculateBollingerBands,
  calculateRSI,
  calculateMACD,
  calculateVWAP,
  convertToHeikinAshi,
} from '../services/indicators';
import { DrawingOverlay } from './DrawingOverlay';
import {candleAtTimestamp} from '../services/chartCandles';
import {mayUseIncrementalChartUpdate} from '../services/chartUpdatePolicy';
import {marketIdentity} from '../services/marketIdentity';
import {calculateUtcSessionVwap} from '../services/sessionVWAP';
import {chartEmptyExplanation,type ChartLoadState} from '../services/chartRecovery';
import {chartPositionExitLevels,type ChartExitLevel} from '../services/chartPositionLevels';
import {
  Eye,
  Settings,
  X,
  MoreHorizontal,
  ChevronDown,
  TrendingUp,
  Search,
} from 'lucide-react';

export interface MainChartRef {
  fitContent: () => void;
  goToUtcDate:(date:string)=>boolean;
  selectRange: (days: number) => void;
  takeSnapshot: () => void;
  getChart: () => IChartApi | null;
  getMainSeries: () => ISeriesApi<any> | null;
  getPriceAtTime: (time:number) => number | null;
}

interface MainChartProps {
  asset: Asset;
  timeframe: Timeframe;
  chartType: ChartType;
  candles: OHLCV[];
  indicators: IndicatorSettings;
  activeTool: DrawingToolType;
  setActiveTool: (tool: DrawingToolType) => void;
  drawings: Drawing[];
  setDrawings: React.Dispatch<React.SetStateAction<Drawing[]>>;
  isMagnetMode: boolean;
  areDrawingsHidden: boolean;
  currentColor: string;
  isLogScale: boolean;
  isPercentScale: boolean;
  openPosition?: PaperPosition | null;
  onClosePosition?: (id: string) => void;
  onEditPositionStop?: (id:string,kind:'sl'|'tp')=>void;
  onOpenConditionalOrder?: (dep: DependencyContext) => void;
  chartHistoryState?:ChartLoadState;
  onRetryChartHistory?:()=>void;
  onChooseChartMarket?:(market:Asset)=>void;
  chartRecoveryMarkets?:Asset[];
  onTryOneMinute?:()=>void;
  sessionVwapEnabled?:boolean;
  areDrawingsLocked?:boolean;
  stayInDrawingMode?:boolean;
  onOpenSymbolSearch?:()=>void;
  onOpenIndicators?:()=>void;
}

function formatHollowCandles(candles: OHLCV[]) {
  return candles.map((c, i) => {
    const prevClose = i > 0 ? candles[i - 1].close : c.open;
    const isPriceUp = c.close >= prevClose;
    const isBodyUp = c.close >= c.open;
    const stroke = isPriceUp ? '#089981' : '#f23645';
    // Hollow body if close >= open, solid body if close < open
    const fill = isBodyUp ? '#131722' : stroke;
    return {
      time: c.time as any,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
      color: fill,
      borderColor: stroke,
      wickColor: stroke,
    };
  });
}

export const MainChart = React.memo(
  forwardRef<MainChartRef, MainChartProps>(
    (
      {
      asset,
      timeframe,
      chartType,
      candles,
      indicators,
      activeTool,
      setActiveTool,
      drawings,
      setDrawings,
      isMagnetMode,
      areDrawingsHidden,
      currentColor,
      isLogScale,
      isPercentScale,
      openPosition,
      onClosePosition,
      onEditPositionStop,
      onOpenConditionalOrder,
      chartHistoryState='empty',
      onRetryChartHistory,
      onChooseChartMarket,
      chartRecoveryMarkets=[],
      onTryOneMinute,
      sessionVwapEnabled=false,
      areDrawingsLocked=false,
      stayInDrawingMode=false,
      onOpenSymbolSearch,
      onOpenIndicators,
    },
    ref
  ) => {
    const chartContainerRef = useRef<HTMLDivElement>(null);
    const [priceVisible,setPriceVisible]=useState(true);
    const [moreOpen,setMoreOpen]=useState(false);
    const [,refreshSeries]=useState(0);
    useEffect(()=>{setPriceVisible(true);setMoreOpen(false);},[asset.symbol,asset.source,asset.exchange,asset.marketType,asset.pairAddress,asset.chainId,timeframe]);
    const sourceCandlesRef=useRef(candles);
    sourceCandlesRef.current=candles;
    const chartApiRef = useRef<IChartApi | null>(null);
    const mainSeriesRef = useRef<ISeriesApi<any> | null>(null);
    const activeSeriesRef = useRef<ISeriesApi<any>[]>([]);
    const seriesBundleRef = useRef<{
      marketKey: string;
      timeframe: string;
      chartType: ChartType;
      indicatorsKey: string;
      mainSeries: ISeriesApi<any>;
      volumeSeries?: ISeriesApi<any>;
      candleCount: number;

      renderedCandles:OHLCV[];
    } | null>(null);

    const indicatorsKey = useMemo(() => JSON.stringify({indicators,sessionVwapEnabled}), [indicators,sessionVwapEnabled]);

    // Track crosshair hovered candle for Legend display
    const [hoveredCandle, setHoveredCandle] = useState<OHLCV | null>(null);

    // Latest candle to show when not hovering
    const latestCandle = candles.length > 0 ? candles[candles.length - 1] : null;
    const displayCandle = hoveredCandle || latestCandle;

    // Expose methods to parent via ref
    useImperativeHandle(ref, () => ({
      fitContent: () => {
        chartApiRef.current?.timeScale().fitContent();
      },
      goToUtcDate:(date:string)=>{
        const chart=chartApiRef.current;
        const start=Date.parse(date+'T00:00:00Z')/1000;
        if(!chart||!Number.isFinite(start))return false;
        const bars=sourceCandlesRef.current;
        // Only scroll to a UTC day with actual, verified bars on THIS chart.
        const index=bars.findIndex(bar=>bar.time>=start&&bar.time<start+86400);
        if(index<0)return false;
        try{
          const range=chart.timeScale().getVisibleLogicalRange();
          const span=Math.max(24,Math.min(250,range?Number(range.to)-Number(range.from):90));
          const from=Math.max(0,index-Math.floor(span/2));
          chart.timeScale().setVisibleLogicalRange({from:from as any,to:Math.min(bars.length+3,from+span) as any});
          return true;
        }catch{return false;}
      },
      selectRange: (days: number) => {
        if (!chartApiRef.current || candles.length === 0) return;
        if (days === 0) {
          chartApiRef.current.timeScale().fitContent();
          return;
        }
        const lastTime = candles[candles.length - 1].time;
        // -1 means actual Year To Date, anchored to the latest plotted bar.
        // Fixed "250-day YTD" silently drifts across calendar boundaries.
        const fromTime = days === -1
          ? Math.floor(Date.UTC(new Date(lastTime * 1000).getUTCFullYear(),0,1) / 1000)
          : lastTime - days * 86400;
        chartApiRef.current.timeScale().setVisibleRange({
          from: fromTime as any,
          to: lastTime as any,
        });
      },
      takeSnapshot: () => {
        if (!chartApiRef.current) return;
        try {
          // The chart owns multiple canvases (price, grid, indicators, scales).
          // Capturing only the first DOM canvas produces incomplete screenshots.
          const imgUrl = chartApiRef.current.takeScreenshot(true).toDataURL('image/png');
          const a = document.createElement('a');
          a.href = imgUrl;
          a.download = `${asset.symbol}_${timeframe}_chart.png`;
          a.click();
        } catch (err) {
          console.error('Failed to take snapshot:', err);
        }
      },
      getChart: () => chartApiRef.current,
      getMainSeries: () => mainSeriesRef.current,
      getPriceAtTime: (time:number) =>
        candleAtTimestamp(sourceCandlesRef.current,time)?.close ?? null,
    }));

    // Initialize Chart
    useEffect(() => {
      if (!chartContainerRef.current) return;

      const chart = createChart(chartContainerRef.current, {
        width: Math.max(1,chartContainerRef.current.clientWidth),
        height: Math.max(1,chartContainerRef.current.clientHeight),
        layout: {
          background: { type: ColorType.Solid, color: '#131722' },
          textColor: '#787b86',
          fontFamily: "'IBM Plex Sans', -apple-system, BlinkMacSystemFont, sans-serif",
          fontSize: 9,
        },
        grid: {
          vertLines: { color: '#1e222d', style: LineStyle.Solid },
          horzLines: { color: '#1e222d', style: LineStyle.Solid },
        },
        crosshair: {
          mode: isMagnetMode ? CrosshairMode.Magnet : CrosshairMode.Normal,
          vertLine: {
            color: '#787b86',
            width: 1,
            style: LineStyle.Dashed,
            labelBackgroundColor: '#2a2e39',
          },
          horzLine: {
            color: '#787b86',
            width: 1,
            style: LineStyle.Dashed,
            labelBackgroundColor: '#2a2e39',
          },
        },
        rightPriceScale: {
          borderColor: '#363a45',
          mode: isLogScale
            ? PriceScaleMode.Logarithmic
            : isPercentScale
            ? PriceScaleMode.Percentage
            : PriceScaleMode.Normal,
          autoScale: true,
          alignLabels: true,
        },
        timeScale: {
          borderColor: '#2a2e39',
          timeVisible: true,
          secondsVisible: false,
          fixLeftEdge: false,
          fixRightEdge: false,
        },
      });

      chartApiRef.current = chart;

      // Handle ResizeObserver
      const resizeObserver = new ResizeObserver((entries) => {
        if (!entries || entries.length === 0) return;
        const { width, height } = entries[0].contentRect;
        if (width > 0 && height > 0) {
          chart.applyOptions({ width, height });
        }
      });
      resizeObserver.observe(chartContainerRef.current);

      // Subscribe to Crosshair hover
      const handleCrosshairMove = (param: any) => {
        if (!param || !param.time || !mainSeriesRef.current) {
          setHoveredCandle(null);
          return;
        }

        const barData = param.seriesData.get(mainSeriesRef.current);
        const sourceBar=candleAtTimestamp(sourceCandlesRef.current,Number(param.time));
        if (barData) {
          if ('open' in barData && 'close' in barData) {
            setHoveredCandle({
              time: Number(barData.time),
              open: barData.open,
              high: barData.high,
              low: barData.low,
              close: barData.close,
              volume: sourceBar?.volume ?? 0,
            });
          } else if ('value' in barData) {
            // Line/area series emit only a scalar value. The venue's original
            // OHLCV record is authoritative when showing the hovered legend.
            setHoveredCandle(sourceBar ?? null);
          }
        } else {
          setHoveredCandle(null);
        }
      };

      chart.subscribeCrosshairMove(handleCrosshairMove);

      return () => {
        chart.unsubscribeCrosshairMove(handleCrosshairMove);
        resizeObserver.disconnect();
        activeSeriesRef.current.forEach((s) => {
          try {
            chart.removeSeries(s);
          } catch {
            // Ignore
          }
        });
        activeSeriesRef.current = [];
        chart.remove();
        chartApiRef.current = null;
        mainSeriesRef.current = null;
        seriesBundleRef.current = null;
      };
    }, []);

    // Visibility is a chart API option, never a CSS overlay that leaves deceptive candles.
    useEffect(()=>{try{mainSeriesRef.current?.applyOptions({visible:priceVisible});}catch{}},[priceVisible]);

    // Update Price Scale Modes
    useEffect(() => {
      if (!chartApiRef.current) return;
      chartApiRef.current.priceScale('right').applyOptions({
        mode: isLogScale
          ? PriceScaleMode.Logarithmic
          : isPercentScale
          ? PriceScaleMode.Percentage
          : PriceScaleMode.Normal,
      });
    }, [isLogScale, isPercentScale]);

    // Update Magnet Crosshair
    useEffect(() => {
      if (!chartApiRef.current) return;
      chartApiRef.current.applyOptions({
        crosshair: {
          mode: isMagnetMode ? CrosshairMode.Magnet : CrosshairMode.Normal,
        },
      });
    }, [isMagnetMode]);

    // Populate Series & Indicators or Incremental Real-time Update
    useEffect(() => {
      const chart = chartApiRef.current;
      if (!chart) return;
      if (candles.length === 0) {
        // A missing/blocked market must never display a prior symbol's series.
        // Clear all price/indicator panes until a verified feed supplies bars.
        for (const series of activeSeriesRef.current) {
          try { chart.removeSeries(series); } catch { /* already detached */ }
        }
        activeSeriesRef.current = [];
        mainSeriesRef.current = null;
        seriesBundleRef.current = null;
        refreshSeries(i=>i+1);
        return;
      }

      const chartCandles =
        chartType === 'heikin-ashi' ? convertToHeikinAshi(candles) : candles;
      const lastCandle = chartCandles[chartCandles.length - 1];
      const firstCandle = chartCandles[0];
      const marketKey=marketIdentity(asset);
      // Check exact prefix equality against the rendered snapshot, not just
      // three sampled candles. Deep historical revisions must rebuild.
      const bundle=seriesBundleRef.current;
      const isSameConfig=bundle!==null&&
        bundle.marketKey===marketKey&&bundle.timeframe===timeframe&&
        bundle.chartType===chartType&&bundle.indicatorsKey===indicatorsKey&&
        mayUseIncrementalChartUpdate(bundle.renderedCandles,candles,indicators);

      // FAST PATH: Real-time incremental tick update (O(1) execution, instant)
      if (isSameConfig && bundle && lastCandle) {
        if (
          chartType === 'line' ||
          chartType === 'step-line' ||
          chartType === 'area' ||
          chartType === 'baseline'
        ) {
          bundle.mainSeries.update({
            time: lastCandle.time as any,
            value: lastCandle.close,
          });
        } else if (chartType === 'column') {
          bundle.mainSeries.update({
            time: lastCandle.time as any,
            value: lastCandle.close,
            color:
              lastCandle.close >= lastCandle.open
                ? 'rgba(8, 153, 129, 0.85)'
                : 'rgba(242, 54, 69, 0.85)',
          });
        } else if (chartType === 'hollow') {
          const prevCandle =
            chartCandles.length > 1
              ? chartCandles[chartCandles.length - 2]
              : null;
          const prevClose = prevCandle ? prevCandle.close : lastCandle.open;
          const isPriceUp = lastCandle.close >= prevClose;
          const isBodyUp = lastCandle.close >= lastCandle.open;
          const stroke = isPriceUp ? '#089981' : '#f23645';
          const fill = isBodyUp ? '#131722' : stroke;
          bundle.mainSeries.update({
            time: lastCandle.time as any,
            open: lastCandle.open,
            high: lastCandle.high,
            low: lastCandle.low,
            close: lastCandle.close,
            color: fill,
            borderColor: stroke,
            wickColor: stroke,
          });
        } else if (chartType === 'high-low') {
          const prevCandle =
            chartCandles.length > 1
              ? chartCandles[chartCandles.length - 2]
              : null;
          const prevClose = prevCandle ? prevCandle.close : lastCandle.open;
          const isUp = lastCandle.close >= prevClose;
          bundle.mainSeries.update({
            time: lastCandle.time as any,
            open: lastCandle.open,
            high: lastCandle.high,
            low: lastCandle.low,
            close: lastCandle.close,
            color: isUp ? '#089981' : '#f23645',
          });
        } else {
          // candlestick, heikin-ashi, bar
          bundle.mainSeries.update({
            time: lastCandle.time as any,
            open: lastCandle.open,
            high: lastCandle.high,
            low: lastCandle.low,
            close: lastCandle.close,
          });
        }

        if (bundle.volumeSeries) {
          bundle.volumeSeries.update({
            time: lastCandle.time as any,
            value: lastCandle.volume,
            color:
              lastCandle.close >= lastCandle.open
                ? 'rgba(8, 153, 129, 0.35)'
                : 'rgba(242, 54, 69, 0.35)',
          });
        }

        // Keep a copy of the data actually plotted; never retain mutable
        // external candle objects as the historical-correction baseline.
        if(bundle.renderedCandles.length<candles.length)
          bundle.renderedCandles.push({...candles[candles.length-1]});
        else bundle.renderedCandles[bundle.renderedCandles.length-1]={...candles[candles.length-1]};
        bundle.candleCount = candles.length;
        return;
      }

      // A historical correction or indicator refresh must not unexpectedly
      // reset the user's zoom/pan window on the same market and timeframe.
      const priorViewport=bundle&&bundle.marketKey===marketKey&&bundle.timeframe===timeframe
        ? chart.timeScale().getVisibleRange() : null;

      // FULL REBUILD PATH: Only executed on symbol/timeframe/type/indicator change or initial load
      // Clean up previous series reliably
      if (activeSeriesRef.current.length > 0) {
        activeSeriesRef.current.forEach((s) => {
          try {
            chart.removeSeries(s);
          } catch {
            // Ignore
          }
        });
        activeSeriesRef.current = [];
      }

      const trackSeries = <T extends ISeriesApi<any>>(series: T): T => {
        activeSeriesRef.current.push(series);
        return series;
      };

      // 1. Add Main Price Series (Pane 0)
      let mainSeries: ISeriesApi<any>;

      if (chartType === 'line') {
        mainSeries = trackSeries(
          chart.addSeries(
            LineSeries,
            {
              color: '#2962ff',
              lineWidth: 2,
              lineType: LineType.Simple,
              priceLineVisible: true,
              priceLineColor: '#2962ff',
              priceLineStyle: LineStyle.Dashed,
            },
            0
          )
        );
        mainSeries.setData(
          chartCandles.map((c) => ({
            time: c.time as any,
            value: c.close,
          }))
        );
      } else if (chartType === 'step-line') {
        mainSeries = trackSeries(
          chart.addSeries(
            LineSeries,
            {
              color: '#2962ff',
              lineWidth: 2,
              lineType: LineType.WithSteps,
              priceLineVisible: true,
              priceLineColor: '#2962ff',
              priceLineStyle: LineStyle.Dashed,
            },
            0
          )
        );
        mainSeries.setData(
          chartCandles.map((c) => ({
            time: c.time as any,
            value: c.close,
          }))
        );
      } else if (chartType === 'area') {
        mainSeries = trackSeries(
          chart.addSeries(
            AreaSeries,
            {
              lineColor: '#2962ff',
              topColor: 'rgba(41, 98, 255, 0.32)',
              bottomColor: 'rgba(41, 98, 255, 0.01)',
              lineWidth: 2,
              priceLineVisible: true,
              priceLineColor: '#2962ff',
              priceLineStyle: LineStyle.Dashed,
            },
            0
          )
        );
        mainSeries.setData(
          chartCandles.map((c) => ({
            time: c.time as any,
            value: c.close,
          }))
        );
      } else if (chartType === 'baseline') {
        const basePrice = chartCandles[0]?.open ?? chartCandles[0]?.close ?? asset.price;
        mainSeries = trackSeries(
          chart.addSeries(
            BaselineSeries,
            {
              baseValue: { type: 'price', price: basePrice },
              topLineColor: '#089981',
              topFillColor1: 'rgba(8, 153, 129, 0.28)',
              topFillColor2: 'rgba(8, 153, 129, 0.04)',
              bottomLineColor: '#f23645',
              bottomFillColor1: 'rgba(242, 54, 69, 0.04)',
              bottomFillColor2: 'rgba(242, 54, 69, 0.28)',
              lineWidth: 2,
              priceLineVisible: true,
              priceLineColor: '#2962ff',
              priceLineStyle: LineStyle.Dashed,
            },
            0
          )
        );
        mainSeries.setData(
          chartCandles.map((c) => ({
            time: c.time as any,
            value: c.close,
          }))
        );
      } else if (chartType === 'column') {
        mainSeries = trackSeries(
          chart.addSeries(
            HistogramSeries,
            {
              priceFormat: { type: 'price' },
              priceLineVisible: true,
              priceLineColor: '#2962ff',
            },
            0
          )
        );
        mainSeries.setData(
          chartCandles.map((c) => ({
            time: c.time as any,
            value: c.close,
            color: c.close >= c.open ? 'rgba(8, 153, 129, 0.85)' : 'rgba(242, 54, 69, 0.85)',
          }))
        );
      } else if (chartType === 'hollow') {
        mainSeries = trackSeries(
          chart.addSeries(
            CandlestickSeries,
            {
              borderVisible: true,
              wickVisible: true,
              upColor: '#131722',
              downColor: '#f23645',
              borderUpColor: '#089981',
              borderDownColor: '#f23645',
              wickUpColor: '#089981',
              wickDownColor: '#f23645',
              priceLineVisible: true,
              priceLineStyle: LineStyle.Dashed,
            },
            0
          )
        );
        mainSeries.setData(formatHollowCandles(chartCandles));
      } else if (chartType === 'heikin-ashi') {
        mainSeries = trackSeries(
          chart.addSeries(
            CandlestickSeries,
            {
              upColor: '#089981',
              downColor: '#f23645',
              borderVisible: true,
              borderUpColor: '#089981',
              borderDownColor: '#f23645',
              wickVisible: true,
              wickUpColor: '#089981',
              wickDownColor: '#f23645',
              priceLineVisible: true,
              priceLineStyle: LineStyle.Dashed,
            },
            0
          )
        );
        mainSeries.setData(
          chartCandles.map((c) => ({
            time: c.time as any,
            open: c.open,
            high: c.high,
            low: c.low,
            close: c.close,
          }))
        );
      } else if (chartType === 'high-low') {
        mainSeries = trackSeries(
          chart.addSeries(
            BarSeries,
            {
              upColor: '#089981',
              downColor: '#f23645',
              openVisible: false,
              thinBars: false,
              priceLineVisible: true,
              priceLineStyle: LineStyle.Dashed,
            },
            0
          )
        );
        mainSeries.setData(
          chartCandles.map((c, i) => {
            const prevClose = i > 0 ? chartCandles[i - 1].close : c.open;
            const isUp = c.close >= prevClose;
            return {
              time: c.time as any,
              open: c.open,
              high: c.high,
              low: c.low,
              close: c.close,
              color: isUp ? '#089981' : '#f23645',
            };
          })
        );
      } else if (chartType === 'bar') {
        mainSeries = trackSeries(
          chart.addSeries(
            BarSeries,
            {
              upColor: '#089981',
              downColor: '#f23645',
              openVisible: true,
              thinBars: false,
              priceLineVisible: true,
              priceLineStyle: LineStyle.Dashed,
            },
            0
          )
        );
        mainSeries.setData(
          chartCandles.map((c) => ({
            time: c.time as any,
            open: c.open,
            high: c.high,
            low: c.low,
            close: c.close,
          }))
        );
      } else {
        // 'candlestick' (Standard Candles)
        mainSeries = trackSeries(
          chart.addSeries(
            CandlestickSeries,
            {
              upColor: '#089981',
              downColor: '#f23645',
              borderVisible: true,
              borderUpColor: '#089981',
              borderDownColor: '#f23645',
              wickVisible: true,
              wickUpColor: '#089981',
              wickDownColor: '#f23645',
              priceLineVisible: true,
              priceLineStyle: LineStyle.Dashed,
            },
            0
          )
        );
        mainSeries.setData(
          chartCandles.map((c) => ({
            time: c.time as any,
            open: c.open,
            high: c.high,
            low: c.low,
            close: c.close,
          }))
        );
      }

      mainSeriesRef.current = mainSeries;

      // 2. Add Volume Series (Pane 0)
      let volumeSeries: ISeriesApi<any> | undefined;
      if (indicators.volume.enabled) {
        volumeSeries = trackSeries(
          chart.addSeries(
            HistogramSeries,
            {
              priceFormat: { type: 'volume' },
              priceScaleId: 'volume',
            },
            0
          )
        );

        chart.priceScale('volume', 0).applyOptions({
          scaleMargins: {
            top: 0.82,
            bottom: 0,
          },
        });

        volumeSeries.setData(
          chartCandles.map((c) => ({
            time: c.time as any,
            value: c.volume,
            color: c.close >= c.open ? 'rgba(8, 153, 129, 0.35)' : 'rgba(242, 54, 69, 0.35)',
          }))
        );
      }

      // 3. Main Pane Moving Averages & Overlays
      if (indicators.sma20.enabled) {
        const smaData = calculateSMA(chartCandles, indicators.sma20.period);
        const smaSeries = trackSeries(chart.addSeries(LineSeries, { color: indicators.sma20.color, lineWidth: 1 }, 0));
        smaSeries.setData(smaData.map((d) => ({ time: d.time as any, value: d.value })));
      }

      if (indicators.sma50.enabled) {
        const smaData = calculateSMA(chartCandles, indicators.sma50.period);
        const smaSeries = trackSeries(chart.addSeries(LineSeries, { color: indicators.sma50.color, lineWidth: 1 }, 0));
        smaSeries.setData(smaData.map((d) => ({ time: d.time as any, value: d.value })));
      }

      if (indicators.sma200.enabled) {
        const smaData = calculateSMA(chartCandles, indicators.sma200.period);
        const smaSeries = trackSeries(chart.addSeries(LineSeries, { color: indicators.sma200.color, lineWidth: 2 }, 0));
        smaSeries.setData(smaData.map((d) => ({ time: d.time as any, value: d.value })));
      }

      if (indicators.ema9.enabled) {
        const emaData = calculateEMA(chartCandles, indicators.ema9.period);
        const emaSeries = trackSeries(chart.addSeries(LineSeries, { color: indicators.ema9.color, lineWidth: 1 }, 0));
        emaSeries.setData(emaData.map((d) => ({ time: d.time as any, value: d.value })));
      }

      if (indicators.ema21.enabled) {
        const emaData = calculateEMA(chartCandles, indicators.ema21.period);
        const emaSeries = trackSeries(chart.addSeries(LineSeries, { color: indicators.ema21.color, lineWidth: 1 }, 0));
        emaSeries.setData(emaData.map((d) => ({ time: d.time as any, value: d.value })));
      }

      if (indicators.vwap.enabled) {
        const vwapData = calculateVWAP(chartCandles);
        const vwapSeries = trackSeries(chart.addSeries(LineSeries, { color: indicators.vwap.color, lineWidth: 1 }, 0));
        vwapSeries.setData(vwapData.map((d) => ({ time: d.time as any, value: d.value })));
      }

      if (sessionVwapEnabled) {
        // UTC midnight reset, using observed venue OHLCV rather than Heikin-Ashi synthetic candles.
        const sessionPoints=calculateUtcSessionVwap(candles);
        if(sessionPoints.length){
          const sessionSeries=trackSeries(chart.addSeries(LineSeries,{
            color:'#d8a75b',lineWidth:2,lineStyle:LineStyle.Solid,
            priceLineVisible:false,lastValueVisible:true,
            title:'UTC Session VWAP (bar)', 
          },0));
          sessionSeries.setData(sessionPoints.map(p=>({time:p.time as any,value:p.value})));
        }
      }

      if (indicators.bollingerBands.enabled) {
        const bbData = calculateBollingerBands(
          chartCandles,
          indicators.bollingerBands.period,
          indicators.bollingerBands.stdDev
        );

        const bbUpper = trackSeries(chart.addSeries(LineSeries, { color: indicators.bollingerBands.upperColor, lineWidth: 1 }, 0));
        bbUpper.setData(bbData.map((d) => ({ time: d.time as any, value: d.upper })));

        const bbMiddle = trackSeries(
          chart.addSeries(
            LineSeries,
            { color: indicators.bollingerBands.middleColor, lineWidth: 1, lineStyle: LineStyle.Dashed },
            0
          )
        );
        bbMiddle.setData(bbData.map((d) => ({ time: d.time as any, value: d.middle })));

        const bbLower = trackSeries(chart.addSeries(LineSeries, { color: indicators.bollingerBands.lowerColor, lineWidth: 1 }, 0));
        bbLower.setData(bbData.map((d) => ({ time: d.time as any, value: d.lower })));
      }

      // 4. Sub-Pane Oscillators (RSI, MACD)
      let nextPaneIndex = 1;

      if (indicators.rsi.enabled) {
        const rsiData = calculateRSI(chartCandles, indicators.rsi.period);
        const rsiPaneIndex = nextPaneIndex++;

        const rsiSeries = trackSeries(chart.addSeries(LineSeries, { color: indicators.rsi.color, lineWidth: 2 }, rsiPaneIndex));
        rsiSeries.setData(rsiData.map((d) => ({ time: d.time as any, value: d.value })));

        const rsiOverbought = trackSeries(
          chart.addSeries(
            LineSeries,
            { color: 'rgba(242, 54, 69, 0.5)', lineWidth: 1, lineStyle: LineStyle.Dashed },
            rsiPaneIndex
          )
        );
        rsiOverbought.setData(rsiData.map((d) => ({ time: d.time as any, value: indicators.rsi.overbought })));

        const rsiOversold = trackSeries(
          chart.addSeries(
            LineSeries,
            { color: 'rgba(8, 153, 129, 0.5)', lineWidth: 1, lineStyle: LineStyle.Dashed },
            rsiPaneIndex
          )
        );
        rsiOversold.setData(rsiData.map((d) => ({ time: d.time as any, value: indicators.rsi.oversold })));
      }

      if (indicators.macd.enabled) {
        const macdData = calculateMACD(
          chartCandles,
          indicators.macd.fastPeriod,
          indicators.macd.slowPeriod,
          indicators.macd.signalPeriod
        );
        const macdPaneIndex = nextPaneIndex++;

        const histSeries = trackSeries(chart.addSeries(HistogramSeries, { priceFormat: { type: 'volume' } }, macdPaneIndex));
        histSeries.setData(
          macdData.map((d) => ({
            time: d.time as any,
            value: d.histogram,
            color: d.histogram >= 0 ? indicators.macd.histUpColor : indicators.macd.histDownColor,
          }))
        );

        const macdLineSeries = trackSeries(
          chart.addSeries(
            LineSeries,
            { color: indicators.macd.macdColor, lineWidth: 1.5 },
            macdPaneIndex
          )
        );
        macdLineSeries.setData(macdData.map((d) => ({ time: d.time as any, value: d.macd })));

        const signalLineSeries = trackSeries(
          chart.addSeries(
            LineSeries,
            { color: indicators.macd.signalColor, lineWidth: 1.5 },
            macdPaneIndex
          )
        );
        signalLineSeries.setData(macdData.map((d) => ({ time: d.time as any, value: d.signal })));
      }

      if (!bundle || bundle.marketKey !== marketKey || bundle.timeframe !== timeframe || (bundle.candleCount < 10 && candles.length > 10)) {
        chart.timeScale().setVisibleLogicalRange({ from: Math.max(0, candles.length - 180), to: candles.length + 4 });
      } else if (priorViewport) {
        try { chart.timeScale().setVisibleRange(priorViewport); }
        catch { /* Market history changed; retain the chart's safe fitted range. */ }
      }
      mainSeries.applyOptions({visible:priceVisible});
      seriesBundleRef.current = {
        marketKey,
        timeframe,
        chartType,
        indicatorsKey,
        mainSeries,
        volumeSeries,
        candleCount: candles.length,
        renderedCandles:candles.map(bar=>({...bar})),
      };
      refreshSeries(i=>i+1);
    }, [asset.symbol, asset.source, asset.exchange, asset.marketType, asset.chainId, asset.pairAddress,
      timeframe, chartType, candles, indicatorsKey]);

    // Calculate dynamic Y pixel position for open position line overlay
    const [positionY, setPositionY] = useState<number | null>(null);
    const [currentPriceY, setCurrentPriceY] = useState<number | null>(null);
    const [exitLinePositions,setExitLinePositions]=useState<Array<ChartExitLevel & {y:number}>>([]);
    const exitSignature=JSON.stringify(chartPositionExitLevels(openPosition));

    useEffect(() => {
      const chart = chartApiRef.current;
      if (!chart) return;

      let rafId: number | null = null;
      const updateLinePositions = () => {
        if (!mainSeriesRef.current) return;
        try {
          if (openPosition) {
            const y = mainSeriesRef.current.priceToCoordinate(openPosition.entryPrice);
            if (y !== null) {
              setPositionY((prev) => (prev === null || Math.abs(prev - y) >= 1 ? Math.round(y) : prev));
            }
          } else {
            setPositionY(null);
          }
          const exits=chartPositionExitLevels(openPosition).flatMap(level=>{
            const coordinate=mainSeriesRef.current?.priceToCoordinate(level.price);
            return coordinate===null||coordinate===undefined||!Number.isFinite(coordinate)?[]:
              [{...level,y:Math.round(Number(coordinate))}];
          });
          setExitLinePositions(prev=>JSON.stringify(prev)===JSON.stringify(exits)?prev:exits);

          const currY = mainSeriesRef.current.priceToCoordinate(asset.price);
          if (currY !== null) {
            setCurrentPriceY((prev) => (prev === null || Math.abs(prev - currY) >= 1 ? Math.round(currY) : prev));
          }
        } catch {
          // Ignore
        }
      };

      const scheduledUpdate = () => {
        if (rafId !== null) return;
        rafId = requestAnimationFrame(() => {
          rafId = null;
          updateLinePositions();
        });
      };

      scheduledUpdate();

      // Subscribe to time scale change (scrolling, zooming)
      chart.timeScale().subscribeVisibleLogicalRangeChange(scheduledUpdate);

      return () => {
        if (rafId !== null) cancelAnimationFrame(rafId);
        chart.timeScale().unsubscribeVisibleLogicalRangeChange(scheduledUpdate);
      };
    }, [openPosition?.entryPrice,exitSignature,asset.price,asset.symbol,chartType]);

    return (
      <div className="relative flex-1 w-full h-full min-h-0 overflow-hidden bg-[#131722] select-none">
        {/* TradingView Legend Header in top left (matching screenshot) */}
        <div
          id="chart-top-legend-header"
          className="absolute top-1.5 left-2.5 z-20 flex flex-col gap-0.5 pointer-events-auto"
          onClick={e=>e.stopPropagation()}
        >
          {/* Row 1: Symbol & Exchange with eye, settings, delete, more icons */}
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[#d1d4dc] group cursor-pointer">
            <div className="w-3.5 h-3.5 rounded-full bg-[#2962ff] flex items-center justify-center text-white text-[8px] font-bold shadow-xs">
              A
            </div>
            <span>
              {asset.symbol} · {asset.name} · {timeframe} · {asset.exchange}
            </span>

            {displayCandle && (
              <div className="hidden md:flex items-center gap-2 font-mono text-[10px] pl-2 text-[#787b86]">
                <span>
                  O <span className={displayCandle.close >= displayCandle.open ? 'text-[#089981]' : 'text-[#f23645]'}>{displayCandle.open.toFixed(asset.digits ?? 2)}</span>
                </span>
                <span>
                  H <span className={displayCandle.close >= displayCandle.open ? 'text-[#089981]' : 'text-[#f23645]'}>{displayCandle.high.toFixed(asset.digits ?? 2)}</span>
                </span>
                <span>
                  L <span className={displayCandle.close >= displayCandle.open ? 'text-[#089981]' : 'text-[#f23645]'}>{displayCandle.low.toFixed(asset.digits ?? 2)}</span>
                </span>
                <span>
                  C <span className={displayCandle.close >= displayCandle.open ? 'text-[#089981]' : 'text-[#f23645]'}>{displayCandle.close.toFixed(asset.digits ?? 2)}</span>
                </span>
                <span className={`font-semibold ${displayCandle.close >= displayCandle.open ? 'text-[#089981]' : 'text-[#f23645]'}`}>
                  {displayCandle.close >= displayCandle.open ? '+' : ''}{(displayCandle.close - displayCandle.open).toFixed(asset.digits ?? 2)} ({displayCandle.close >= displayCandle.open ? '+' : ''}{displayCandle.open > 0 ? (((displayCandle.close - displayCandle.open) / displayCandle.open) * 100).toFixed(2) : '0.00'}%)
                </span>
              </div>
            )}

            <div className="flex items-center gap-0.5 text-[#a5adbf] ml-1">
              <button type="button" onClick={()=>setPriceVisible(v=>!v)}
                aria-pressed={!priceVisible} aria-label={priceVisible?'Hide price series':'Show price series'}
                className="p-0.5 hover:text-white rounded transition" title={priceVisible?'Hide price series':'Show price series'}>
                <Eye className="w-3 h-3" />
              </button>
              <button type="button" onClick={onOpenIndicators} disabled={!onOpenIndicators}
                className="p-0.5 hover:text-white rounded transition" title="Edit indicators"
                aria-label="Edit chart indicators">
                <Settings className="w-3 h-3" />
              </button>
              <button type="button" onClick={onOpenSymbolSearch} disabled={!onOpenSymbolSearch}
                className="p-0.5 hover:text-white rounded transition" title="Change symbol"
                aria-label="Change chart symbol"><Search className="w-3 h-3"/></button>
              <div className="relative">
                <button type="button" onClick={()=>setMoreOpen(v=>!v)}
                  aria-expanded={moreOpen} aria-label="Chart options"
                  className="p-0.5 hover:text-white rounded transition" title="Chart options">
                  <MoreHorizontal className="w-3 h-3" />
                </button>
                {moreOpen&&<div role="menu" aria-label="Chart options menu"
                  className="absolute left-0 top-full z-50 mt-1 min-w-[140px] rounded border border-[#394556] bg-[#1d2634] shadow-xl p-1 space-y-1 text-xs">
                  <button type="button" role="menuitem" className="w-full text-left p-2 rounded hover:bg-[#31415a]"
                    onClick={()=>{chartApiRef.current?.timeScale().fitContent();setMoreOpen(false);}}>Fit all candles</button>
                  <button type="button" role="menuitem" className="w-full text-left p-2 rounded hover:bg-[#31415a]"
                    onClick={()=>{onRetryChartHistory?.();setMoreOpen(false);}}>Reload chart history</button>
                </div>}
              </div>
            </div>
          </div>

          {/* Actual indicator status replaces the inert "14" mock controls. */}
          <div className="flex items-center gap-1 text-[10px] text-[#98a8bf] pl-5">
            <span>Indicators: {Object.keys(indicators).filter(key=>indicators[key as keyof IndicatorSettings].enabled).length} enabled</span>
            <button type="button" title="Edit indicators" onClick={onOpenIndicators} disabled={!onOpenIndicators}
              className="text-[#9bbdff] hover:text-white underline">Edit</button>
          </div>
        </div>

        {/* Currency Label at Top Right of Price Scale */}
        <div className="absolute top-2 right-2 z-20 pointer-events-none text-[10px] font-mono font-bold text-[#787b86] bg-[#131722] px-1 rounded">
          {asset.currency} ▾
        </div>

        {/* Lightweight Charts Canvas Container */}
        <div ref={chartContainerRef} className="w-full h-full" />
        {sessionVwapEnabled&&candles.length>0&&<div className="absolute top-7 right-2 z-20 pointer-events-none text-[10px] text-[#d8a75b] bg-[#131722]/90 rounded px-1">
          UTC Session VWAP · OHLCV approximation
        </div>}
        {candles.length===0&&<section id="chart-data-recovery" role="status"
          onClick={e=>e.stopPropagation()}
          className="absolute inset-0 z-30 flex items-center justify-center p-4 pointer-events-none">
          <div className="pointer-events-auto w-full max-w-[440px] rounded-xl border border-[#3b4b65] bg-[#161e2c]/95 p-4 shadow-xl text-[#dbe6f8] space-y-3">
            <div className="flex items-center gap-2">
              <div className={`h-2 w-2 rounded-full ${chartHistoryState==='loading'?'bg-[#e9b872] animate-pulse':'bg-[#fc8796]'}`}/>
              <strong className="text-sm">{chartHistoryState==='loading'?'Loading chart candles':'Chart history unavailable'}</strong>
            </div>
            <p className="text-xs text-[#b7c5d9]">{chartEmptyExplanation(asset,timeframe,chartHistoryState as ChartLoadState)}</p>
            <p className="text-[10px] text-[#95a5bc]">
              {asset.symbol} · {asset.source||asset.exchange} · {timeframe} · Exact venue history.
              No made-up candles or silent exchange substitution.
            </p>
            {chartHistoryState!=='loading'&&<div className="flex gap-2 flex-wrap">
              {onRetryChartHistory&&<button type="button" onClick={onRetryChartHistory}
                className="rounded bg-[#2e66df] px-3 py-1.5 text-xs hover:bg-[#4681f5]">Retry history</button>}
              {timeframe!=='1m'&&onTryOneMinute&&<button type="button" onClick={onTryOneMinute}
                className="rounded border border-[#4c6381] px-3 py-1.5 text-xs hover:bg-[#28374c]">Try 1 minute</button>}
            </div>}
            {chartHistoryState!=='loading'&&chartRecoveryMarkets.length>0&&
              <div className="border-t border-[#34425a] pt-2 space-y-1">
                <p className="text-[10px] text-[#9cadc6]">Or select another verified source:</p>
                <div className="flex flex-wrap gap-1">
                  {chartRecoveryMarkets.map(m=><button key={marketIdentity(m)}
                    type="button" onClick={()=>onChooseChartMarket?.(m)}
                    className="rounded border border-[#46536d] px-2 py-1 text-[11px] hover:bg-[#2b3850]">
                    {m.symbol} · {m.source||m.exchange}
                  </button>)}
                </div>
              </div>}
          </div>
        </section>}

        {/* Interactive Open Position Line & Badge (Matching Screenshot!) */}
        {openPosition && positionY !== null && positionY > 30 && (
          <>
            {/* Horizontal Blue Dashed Execution Line */}
            <div
              className="absolute left-0 right-14 border-b border-[#2962ff] border-dashed pointer-events-none z-20"
              style={{ top: `${positionY}px` }}
            />

            {/* Position Controls Marker Pill */}
            <div
              onClick={e=>e.stopPropagation()}
              className="absolute right-12 md:right-16 -translate-y-1/2 z-30 flex items-center max-w-[calc(100%-4rem)] bg-[#131722] border border-[#2962ff] rounded-md text-[10px] md:text-[11px] font-mono shadow-xl overflow-hidden"
              style={{ top: `${positionY}px` }}
            >
              <div className="px-1.5 py-0.5 bg-[#2962ff] text-white font-bold text-[10px]">
                {openPosition.side==='Long'?'L':'S'}
              </div>
              <button type="button" onClick={()=>onEditPositionStop?.(openPosition.id,'tp')}
                className="px-1.5 py-0.5 border-r border-[#2962ff]/40 text-[#66d9b5] hover:bg-[#274438]"
                title="Edit take-profit levels">TP</button>
              <button type="button" onClick={()=>onEditPositionStop?.(openPosition.id,'sl')}
                className="px-1.5 py-0.5 border-r border-[#2962ff]/40 text-[#ff9ca7] hover:bg-[#4a2633]"
                title="Edit stop-loss levels">SL</button>
              <div className="hidden min-[360px]:block px-1 md:px-2 py-0.5 border-r border-[#2962ff]/40 text-[#2962ff] font-semibold truncate">
                {openPosition.qty.toLocaleString()}
              </div>
              <div className="hidden sm:block px-1 md:px-2 py-0.5 border-r border-[#2962ff]/40 text-[#089981] font-semibold">
                {openPosition.unrealizedPnL >= 0 ? '+' : ''}{openPosition.unrealizedPnL.toFixed(2)} {asset.currency}
              </div>
              <button
                onClick={() => onClosePosition?.(openPosition.id)}
                className="px-1.5 py-0.5 text-[#787b86] hover:text-[#f23645] transition cursor-pointer"
                title="Close Position"
              >
                ✕
              </button>
            </div>

            {/* Blue Price Scale Badge on Right */}
            <div
              className="absolute right-0 -translate-y-1/2 bg-[#2962ff] text-white font-mono text-[10px] font-bold px-1 py-0.5 rounded-l shadow-md z-30 pointer-events-none"
              style={{ top: `${positionY}px` }}
            >
              {openPosition.entryPrice.toFixed(asset.digits)}
            </div>
          </>
        )}

        {/* Effective stops and every partial/full target use actual paper-ledger levels.
            They are only visible on the exact market for the displayed position. */}
        {openPosition&&exitLinePositions.map(level=>{
          const isStop=level.kind==='sl';
          const tint=isStop?'#f06b7e':'#31c79a';
          if(level.y<12||level.y>Math.max(0,chartContainerRef.current?.clientHeight||0)-12)return null;
          return <React.Fragment key={level.id}>
            <div aria-hidden="true" className="absolute left-0 right-14 border-b border-dashed pointer-events-none z-20"
              style={{top:level.y,borderColor:tint}}/>
            <button type="button" title={'Edit '+level.label} aria-label={'Edit '+level.label+' at '+level.price}
              onClick={e=>{e.stopPropagation();onEditPositionStop?.(openPosition.id,level.kind);}}
              className="absolute right-12 md:right-16 -translate-y-1/2 z-30 max-w-[calc(100%-4rem)] truncate rounded border px-1.5 py-0.5 text-[9px] font-semibold font-mono shadow-lg bg-[#131722] hover:bg-[#273142]"
              style={{top:level.y,color:tint,borderColor:tint}}>
              {level.label}{level.quantity!==undefined?' · '+level.quantity.toLocaleString():''}
            </button>
            <div aria-hidden="true" className="absolute right-0 -translate-y-1/2 z-30 rounded-l px-1 py-0.5 text-[9px] font-mono font-bold text-[#121820] pointer-events-none"
              style={{top:level.y,backgroundColor:tint}}>
              {level.price.toFixed(asset.digits)}
            </div>
          </React.Fragment>;
        })}

        {/* Active Price Scale Badge on Right (Purple tag as in screenshot!) */}
        {currentPriceY !== null && (
          <div
            className="absolute right-0 -translate-y-1/2 bg-[#b388ff] text-[#131722] font-mono text-[10px] font-bold px-1 py-0.5 rounded-l shadow-md z-30 pointer-events-none"
            style={{ top: `${currentPriceY}px` }}
          >
            {asset.price.toFixed(asset.digits)}
          </div>
        )}

        {/* Drawings Overlay with Trends & Fibonacci */}
        <DrawingOverlay
          chart={chartApiRef.current}
          series={mainSeriesRef.current}
          activeTool={activeTool}
          setActiveTool={setActiveTool}
          drawings={drawings}
          setDrawings={setDrawings}
          isMagnetMode={isMagnetMode}
          areDrawingsLocked={areDrawingsLocked}
          stayInDrawingMode={stayInDrawingMode}
          areDrawingsHidden={areDrawingsHidden}
          currentColor={currentColor}
          candles={candles}
          onOpenConditionalOrder={onOpenConditionalOrder}
        />
      </div>
    );
  }
)
);
MainChart.displayName = 'MainChart';
