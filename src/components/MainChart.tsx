import React, { useEffect, useRef, useState, useMemo, useCallback, useImperativeHandle, forwardRef } from 'react';
import {attachCosmicLine} from '../services/cosmicLine';
import {ChartTradeOverlay} from './ChartTradeOverlay';
import type {ChartExitEdit,ChartEntryTrail,ChartEntryDrafts} from '../services/chartExitEditing';
import {useExclusiveWindow} from '../services/exclusiveWindow';
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
import {pinchGeometry,pinchFactor,scaleAboutAnchor,type PinchAxis} from '../services/chartPinch';
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
  onChartExitEdit?: (id:string,edit:ChartExitEdit)=>string|null;
  chartDraftExits?:ChartEntryDrafts;chartDraftTrail?:ChartEntryTrail;chartDraftScope?:string;
  onChartDraftEdit?:(edit:ChartExitEdit)=>string|null;onChartDraftAdvanced?:(kind:'sl'|'tp')=>void;
  onOpenConditionalOrder?: (dep: DependencyContext) => void;
  chartHistoryState?:ChartLoadState;
  onRetryChartHistory?:()=>void;
  onChooseChartMarket?:(market:Asset)=>void;
  chartRecoveryMarkets?:Asset[];
  onTryOneMinute?:()=>void;
  sessionVwapEnabled?:boolean;
  showMobileChartLegend?:boolean;
  showCurrentPriceLabel?:boolean;
  areDrawingsLocked?:boolean;
  stayInDrawingMode?:boolean;
  onOpenSymbolSearch?:()=>void;
  onOpenIndicators?:()=>void;
}

const MOBILE_ORDER_RAIL_PX=24;

/** Width-bounded labels for the genuinely fixed mobile price rail. The exact
 * price is always available through the current-price marker and axis tooltip. */
function compactMobilePrice(price:number):string {
  if(!Number.isFinite(price))return '–';
  const abs=Math.abs(price);
  if(abs===0)return '0';
  const prefix=price<0?'-':'';
  const shorten=(scaled:number,suffix:string)=>{
    const width=prefix.length+suffix.length;
    const precision=scaled>=100?0:scaled>=10?0:width>=2?0:1;
    return prefix+scaled.toFixed(precision).replace(/\.0$/,'')+suffix;
  };
  if(abs>=1e9)return shorten(abs/1e9,'B');
  if(abs>=1e6)return shorten(abs/1e6,'M');
  if(abs>=1e3)return shorten(abs/1e3,'k');
  if(abs>=100)return prefix+Math.round(abs).toString();
  if(abs>=10)return prefix+Math.round(abs).toString();
  if(abs>=1)return prefix+abs.toFixed(1).replace(/\.0$/,'');
  if(abs>=0.1)return prefix+abs.toFixed(2).replace(/^0/,'');
  if(abs>=0.01)return prefix+abs.toFixed(3).replace(/^0/,'');
  if(abs>=1e-3)return shorten(abs*1e3,'m');
  if(abs>=1e-6)return shorten(abs*1e6,'µ');
  return shorten(abs*1e9,'n');
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
      onChartExitEdit,chartDraftExits,chartDraftTrail,chartDraftScope,onChartDraftEdit,onChartDraftAdvanced,
      onOpenConditionalOrder,
      chartHistoryState='empty',
      onRetryChartHistory,
      onChooseChartMarket,
      chartRecoveryMarkets=[],
      onTryOneMinute,
      sessionVwapEnabled=false,
      showMobileChartLegend=false,
      showCurrentPriceLabel=false,
      areDrawingsLocked=false,
      stayInDrawingMode=false,
      onOpenSymbolSearch,
      onOpenIndicators,
    },
    ref
  ) => {
    const chartContainerRef = useRef<HTMLDivElement>(null);
    const chartGestureRef=useRef<HTMLDivElement>(null);
    const [pinchAxis,setPinchAxis]=useState<PinchAxis|null>(null);
    const [priceVisible,setPriceVisible]=useState(true);
    const [moreOpen,setMoreOpen]=useExclusiveWindow(false);
    const [currencyMenuOpen,setCurrencyMenuOpen]=useExclusiveWindow(false);
    const [priceAxisWidth,setPriceAxisWidth]=useState(24);
    const [compactMobileAxes,setCompactMobileAxes]=useState(()=>window.matchMedia('(max-width:767px), (hover:none) and (pointer:coarse)').matches);
    const [mobileAxisTicks,setMobileAxisTicks]=useState<Array<{y:number;value:number;label:string}>>([]);
    const [mobileAxisHover,setMobileAxisHover]=useState<{y:number;price:number}|null>(null);
    const mobileAxisDrag=useRef<{id:number;startY:number;range:{from:number;to:number}}|null>(null);
    const [,refreshSeries]=useState(0);
    useEffect(()=>{setPriceVisible(true);setMoreOpen(false);setCurrencyMenuOpen(false);},[asset.symbol,asset.source,asset.exchange,asset.marketType,asset.pairAddress,asset.chainId,timeframe]);
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
        chartApiRef.current?.priceScale('right').setAutoScale(true);
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

      const mobileQuery=window.matchMedia('(max-width:767px), (hover:none) and (pointer:coarse)');
      const compactAxes=mobileQuery.matches;
      const compactSize=Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--plutrade-mobile-bar-size'))||MOBILE_ORDER_RAIL_PX;
      const chart = createChart(chartContainerRef.current, {
        width: Math.max(1,chartContainerRef.current.clientWidth),
        height: Math.max(1,chartContainerRef.current.clientHeight),
        layout: {
          background: { type: ColorType.Solid, color: '#131722' },
          attributionLogo: false,
          textColor: '#a5b1c5',
          fontFamily: "'IBM Plex Sans', -apple-system, BlinkMacSystemFont, sans-serif",
          fontSize: compactAxes ? 8 : 10,
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
        handleScale:{pinch:false,mouseWheel:true,axisPressedMouseMove:true,axisDoubleClickReset:true},
        rightPriceScale: {
          visible:!compactAxes,
          borderVisible:true,
          ticksVisible:true,
          minimumWidth:compactAxes?0:24,
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
          visible:true,
          borderVisible:true,
          ticksVisible:true,
          minimumHeight:compactAxes?compactSize:24,
          borderColor: '#2a2e39',
          timeVisible: true,
          secondsVisible: false,
          fixLeftEdge: false,
          fixRightEdge: false,
        },
      });

      chartApiRef.current = chart;
      const syncResponsiveAxes=()=>{
        const small=mobileQuery.matches;
        setCompactMobileAxes(small);
        chart.applyOptions({
          rightPriceScale:{visible:!small,minimumWidth:small?0:24},
          timeScale:{minimumHeight:small?compactSize:24},
          layout:{fontSize:small?8:10},
        });
      };
      mobileQuery.addEventListener('change',syncResponsiveAxes);

      // Handle ResizeObserver
      const resizeObserver = new ResizeObserver((entries) => {
        if (!entries || entries.length === 0) return;
        const { width, height } = entries[0].contentRect;
        if (width > 0 && height > 0) {
          chart.applyOptions({ width, height });
          requestAnimationFrame(()=>{
            if(chartApiRef.current===chart)
              setPriceAxisWidth(Math.max(compactAxes?28:24,chart.priceScale('right').width()));
          });
        }
      });
      resizeObserver.observe(chartContainerRef.current);
      requestAnimationFrame(()=>{
        if(chartApiRef.current===chart)
          setPriceAxisWidth(Math.max(compactAxes?28:24,chart.priceScale('right').width()));
      });

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
        mobileQuery.removeEventListener('change',syncResponsiveAxes);
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

    // The native axis can grow after fresh candle values/indicators load.
    // Recenter the quote label against its actual rendered width.
    useEffect(()=>{
      const frame=requestAnimationFrame(()=>{
        const scale=chartApiRef.current?.priceScale('right');
        if(scale)setPriceAxisWidth(Math.max(compactMobileAxes?MOBILE_ORDER_RAIL_PX:24,scale.width()));
      });
      return ()=>cancelAnimationFrame(frame);
    },[candles,asset.digits,asset.symbol,chartType,indicatorsKey,compactMobileAxes]);

    const updateMobileAxisTicks=useCallback(()=>{
      const series=mainSeriesRef.current;
      const element=chartContainerRef.current;
      if(!series||!element)return;
      const height=element.clientHeight-MOBILE_ORDER_RAIL_PX;
      if(height<70)return;
      const yTop=30,yBottom=height-12;
      const topPrice=series.coordinateToPrice(yTop);
      const bottomPrice=series.coordinateToPrice(yBottom);
      if(topPrice===null||bottomPrice===null||
        !Number.isFinite(topPrice)||!Number.isFinite(bottomPrice))return;
      const range=Math.abs(topPrice-bottomPrice);
      if(range<=0)return;
      const targetSteps=Math.max(2,Math.floor((yBottom-yTop)/52));
      const stepIdeal=range/targetSteps;
      const base=Math.pow(10,Math.floor(Math.log10(stepIdeal)));
      const multiple=[1,2,5,10].find(n=>n*base>=stepIdeal)||10;
      const step=multiple*base;
      const low=Math.min(topPrice,bottomPrice),high=Math.max(topPrice,bottomPrice);
      const first=Math.ceil(low/step)*step;
      const next:Array<{y:number;value:number;label:string}>=[];
      for(let i=0;i<35;i++){
        const value=first+step*i;
        if(value>high+step*0.00001)break;
        const y=series.priceToCoordinate(value);
        if(y!==null&&y>=yTop&&y<=yBottom&&
          (next.length===0||Math.abs(y-next[next.length-1].y)>14))
          next.push({y,value,label:compactMobilePrice(value)});
      }
      next.sort((a,b)=>a.y-b.y);
      setMobileAxisTicks(previous=>{
        if(previous.length===next.length&&previous.every((old,i)=>
          old.label===next[i].label&&Math.abs(old.y-next[i].y)<0.3))return previous;
        return next;
      });
    },[]);
    useEffect(()=>{
      if(!compactMobileAxes){setMobileAxisTicks([]);return;}
      const chart=chartApiRef.current;
      const node=chartContainerRef.current;
      if(!chart||!node)return;
      let frame=0;
      const refresh=()=>{
        cancelAnimationFrame(frame);
        frame=requestAnimationFrame(updateMobileAxisTicks);
      };
      chart.timeScale().subscribeVisibleLogicalRangeChange(refresh);
      window.addEventListener('plutrade-chart-price-zoom',refresh);
      const observer=new ResizeObserver(refresh);
      observer.observe(node);
      refresh();
      return ()=>{
        cancelAnimationFrame(frame);
        observer.disconnect();
        chart.timeScale().unsubscribeVisibleLogicalRangeChange(refresh);
        window.removeEventListener('plutrade-chart-price-zoom',refresh);
      };
    },[compactMobileAxes,updateMobileAxisTicks]);
    useEffect(()=>{
      if(!compactMobileAxes)return;
      const frame=requestAnimationFrame(updateMobileAxisTicks);
      return ()=>cancelAnimationFrame(frame);
    },[compactMobileAxes,candles,asset.symbol,asset.digits,chartType,indicatorsKey,updateMobileAxisTicks]);

    // Native browser/page pinch and the library's horizontal-only pinch are
    // disabled for this chart surface. Apply directional pinch to the chart's
    // public logical/time and price ranges, anchored under the two fingers.
    useEffect(()=>{
      const element=chartGestureRef.current;
      if(!element)return;
      type Range={from:number;to:number};
      let gesture:null|{distance:number;axis:PinchAxis;logical:Range;price:Range;
        logicalAnchor:number;priceAnchor:number}=null;
      const pair=(event:TouchEvent)=>{
        if(event.touches.length!==2)return null;
        const rect=element.getBoundingClientRect();
        return [
          {x:event.touches[0].clientX-rect.left,y:event.touches[0].clientY-rect.top},
          {x:event.touches[1].clientX-rect.left,y:event.touches[1].clientY-rect.top},
        ] as const;
      };
      const start=(event:TouchEvent)=>{
        const fingers=pair(event),chart=chartApiRef.current,series=mainSeriesRef.current;
        if(!fingers||!chart||!series){gesture=null;return;}
        event.preventDefault();
        const geometry=pinchGeometry(...fingers);
        const logical=chart.timeScale().getVisibleLogicalRange();
        const scale=chart.priceScale('right');
        const price=scale.getVisibleRange();
        if(!logical||!price||price.to<=price.from)return;
        const logicalAnchor=chart.timeScale().coordinateToLogical(geometry.midX);
        const priceAnchor=series.coordinateToPrice(geometry.midY);
        if(logicalAnchor===null||priceAnchor===null)return;
        gesture={distance:geometry.distance,axis:geometry.axis,
          logical:{from:Number(logical.from),to:Number(logical.to)},
          price:{from:price.from,to:price.to},
          logicalAnchor:Number(logicalAnchor),priceAnchor:Number(priceAnchor)};
        setPinchAxis(geometry.axis);
      };
      const move=(event:TouchEvent)=>{
        const fingers=pair(event);
        if(!fingers)return;
        event.preventDefault();
        if(!gesture){start(event);return;}
        const chart=chartApiRef.current;
        if(!chart)return;
        const factor=pinchFactor(gesture.distance,pinchGeometry(...fingers).distance);
        if(gesture.axis!=='vertical'){
          const range=scaleAboutAnchor(gesture.logical,gesture.logicalAnchor,factor);
          if(range.to>range.from+2)chart.timeScale().setVisibleLogicalRange({
            from:range.from as any,to:range.to as any});
        }
        if(gesture.axis!=='horizontal'){
          const priceScale=chart.priceScale('right');
          const range=scaleAboutAnchor(gesture.price,gesture.priceAnchor,factor);
          if(Number.isFinite(range.from)&&Number.isFinite(range.to)&&range.to>range.from+1e-12){
            priceScale.setAutoScale(false);
            priceScale.setVisibleRange(range);
            window.dispatchEvent(new CustomEvent('plutrade-chart-price-zoom',{detail:{chart}}));
          }
        }
      };
      const end=(event:TouchEvent)=>{
        if(event.touches.length<2){gesture=null;setPinchAxis(null);}
      };
      // Capture listeners also receive touches starting on the drawing overlay,
      // but a single touch still pans or draws normally.
      element.addEventListener('touchstart',start,{passive:false,capture:true});
      element.addEventListener('touchmove',move,{passive:false,capture:true});
      element.addEventListener('touchend',end,{passive:true,capture:true});
      element.addEventListener('touchcancel',end,{passive:true,capture:true});
      return ()=>{
        element.removeEventListener('touchstart',start,true);
        element.removeEventListener('touchmove',move,true);
        element.removeEventListener('touchend',end,true);
        element.removeEventListener('touchcancel',end,true);
      };
    },[]);

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
              color: 'transparent',
              crosshairMarkerBackgroundColor:'#8260ff',
              lineWidth: 1,
              lineType: LineType.Simple,
              priceLineVisible: true,
              priceLineColor: '#00b9e9',
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
        attachCosmicLine(chart,mainSeries);
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
            }else setPositionY(null);
          } else {
            const y=asset.price>0?mainSeriesRef.current.priceToCoordinate(asset.price):null;
            setPositionY(y!==null&&Number.isFinite(y)?Math.round(y):null);
          }
          const exits=chartPositionExitLevels(openPosition).flatMap(level=>{
            const coordinate=mainSeriesRef.current?.priceToCoordinate(level.price);
            return coordinate===null||coordinate===undefined||!Number.isFinite(coordinate)?[]:
              [{...level,y:Math.round(Number(coordinate))}];
          });
          setExitLinePositions(prev=>JSON.stringify(prev)===JSON.stringify(exits)?prev:exits);

          const currY = showCurrentPriceLabel&&asset.price>0?mainSeriesRef.current.priceToCoordinate(asset.price):null;
          if (currY !== null) {
            setCurrentPriceY((prev) => (prev === null || Math.abs(prev - currY) >= 1 ? Math.round(currY) : prev));
          } else setCurrentPriceY(null);
        } catch {
          // Ignore
        }
      };

      const scheduledUpdate = () => {
        if (rafId !== null) return;
        rafId = requestAnimationFrame(() => {
          rafId = null;
          updateLinePositions();
          if(openPosition)scheduledUpdate();
        });
      };

      scheduledUpdate();

      // Subscribe to time scale change (scrolling, zooming)
      chart.timeScale().subscribeVisibleLogicalRangeChange(scheduledUpdate);

      return () => {
        if (rafId !== null) cancelAnimationFrame(rafId);
        chart.timeScale().unsubscribeVisibleLogicalRangeChange(scheduledUpdate);
      };
    }, [openPosition?.id,openPosition?.entryPrice,exitSignature,asset.price,asset.symbol,chartType,showCurrentPriceLabel]);

    return (
      <div ref={chartGestureRef} data-testid="chart-pinch-surface" className="relative flex-1 w-full h-full min-h-0 overflow-hidden bg-[#131722] select-none" style={{touchAction:'none'}}>
        {/* TradingView Legend Header in top left (matching screenshot) */}
        <div
          id="chart-top-legend-header"
          data-mobile-legend={showMobileChartLegend?'shown':'hidden'}
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

        {/* The quote control is anchored to the actual right price scale width.
            The quote unit is market-defined: changing it requires changing instrument,
            not relabeling prices without an FX conversion. */}
        <div id="chart-quote-currency-anchor"
          className="absolute top-1 right-0 z-[60] flex flex-col items-center"
          style={{width:priceAxisWidth}}>
          <button id="chart-quote-currency-trigger" type="button"
            aria-label={`Quote currency ${asset.currency}`}
            aria-expanded={currencyMenuOpen}
            title={`Quoted in ${asset.currency}`}
            onClick={e=>{e.stopPropagation();setCurrencyMenuOpen(v=>!v);}}
            className="flex max-w-full items-center justify-center gap-[1px] border-0 bg-transparent p-0 text-[9px] font-semibold text-[#a6b6ca] shadow-none hover:text-white">
            <span className="truncate">{asset.currency}</span>
            <ChevronDown size={9} className="shrink-0"/>
          </button>
          {currencyMenuOpen&&<div role="menu" aria-label="Quote currency"
            className="absolute right-0 top-full z-[80] mt-1 w-40 rounded-md border border-[#3b4960] bg-[#1b2738] p-2 text-left text-[11px] text-[#d8e1ed] shadow-xl"
            onClick={e=>e.stopPropagation()}>
            <p className="font-semibold">Quoted in {asset.currency}</p>
            <p className="mt-1 text-[10px] text-[#9faec5]">Currency follows the selected market.</p>
            <button type="button" role="menuitem" disabled={!onOpenSymbolSearch}
              onClick={()=>{setCurrencyMenuOpen(false);onOpenSymbolSearch?.();}}
              className="mt-2 w-full rounded bg-[#283b56] px-2 py-1 text-left hover:bg-[#395074] disabled:opacity-50">
              Change market
            </button>
          </div>}
        </div>

        {/* Price ticks remain at right; candle times remain along chart bottom. */}
        <div ref={chartContainerRef} id="plutrade-native-chart-canvas"
          className="w-full h-full" aria-label="Trading chart with time axis at bottom and price axis at right" />
        {compactMobileAxes&&<>
          <div id="plutrade-mobile-price-axis" aria-label="Price axis; drag to zoom, double tap to reset"
            title="Drag to zoom price scale · double-tap to reset"
            className="z-[50] touch-none select-none"
            onPointerDown={event=>{
              if(event.button!==0)return;
              const scale=chartApiRef.current?.priceScale('right');
              const range=scale?.getVisibleRange();
              if(!range)return;
              mobileAxisDrag.current={id:event.pointerId,startY:event.clientY,
                range:{from:range.from,to:range.to}};
              try{event.currentTarget.setPointerCapture(event.pointerId);}catch{}
            }}
            onPointerMove={event=>{
              const rect=event.currentTarget.getBoundingClientRect();
              const y=event.clientY-rect.top;
              const scale=chartApiRef.current?.priceScale('right');
              if(mobileAxisDrag.current?.id===event.pointerId&&scale){
                const drag=mobileAxisDrag.current;
                const center=(drag.range.from+drag.range.to)/2;
                const half=(drag.range.to-drag.range.from)/2*Math.exp((event.clientY-drag.startY)/160);
                if(Number.isFinite(half)&&half>0){
                  scale.setAutoScale(false);
                  scale.setVisibleRange({from:center-half,to:center+half});
                  window.dispatchEvent(new CustomEvent('plutrade-chart-price-zoom',{detail:{chart:chartApiRef.current}}));
                }
              }
              const price=mainSeriesRef.current?.coordinateToPrice(y);
              setMobileAxisHover(price!=null&&Number.isFinite(price)?{y,price}:null);
            }}
            onPointerUp={event=>{if(mobileAxisDrag.current?.id===event.pointerId)mobileAxisDrag.current=null;}}
            onPointerCancel={event=>{if(mobileAxisDrag.current?.id===event.pointerId)mobileAxisDrag.current=null;setMobileAxisHover(null);}}
            onPointerLeave={()=>{if(!mobileAxisDrag.current)setMobileAxisHover(null);}}
            onDoubleClick={()=>{chartApiRef.current?.priceScale('right').setAutoScale(true);
              window.dispatchEvent(new CustomEvent('plutrade-chart-price-zoom',{detail:{chart:chartApiRef.current}}));}}>
            {mobileAxisTicks.map((tick,i)=><span key={i}
              title={tick.value.toFixed(asset.digits??2)}
              className="absolute right-0 block w-full truncate px-[1px] text-center font-mono leading-[10px] text-[#b4bdd0] pointer-events-none"
              style={{top:tick.y-5,fontSize:7}}>{tick.label}</span>)}
            {mobileAxisHover&&<span role="status"
              className="absolute right-full z-[70] whitespace-nowrap rounded-l border border-[#546581] bg-[#192538] px-1.5 py-0.5 font-mono text-[10px] text-white pointer-events-none"
              style={{top:Math.max(18,Math.min((chartContainerRef.current?.clientHeight||200)-35,mobileAxisHover.y))-9}}>
              {mobileAxisHover.price.toFixed(asset.digits??2)}
            </span>}
          </div>
          <div id="plutrade-mobile-price-axis-corner" aria-hidden="true"/>
        </>}
        {pinchAxis&&<span aria-live="off" className="absolute bottom-7 left-2 z-20 rounded bg-[#202c40]/90 px-1.5 py-0.5 text-[9px] text-[#b8cee8] pointer-events-none">
          {pinchAxis==='horizontal'?'Time zoom':pinchAxis==='vertical'?'Price zoom':'Time + price zoom'}
        </span>}
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

        {<ChartTradeOverlay
          position={openPosition} positionY={positionY} levels={exitLinePositions}
          height={chartContainerRef.current?.clientHeight||240}
          axisWidth={compactMobileAxes?MOBILE_ORDER_RAIL_PX:priceAxisWidth}
          digits={asset.digits} currency={asset.currency}
          coordinateToPrice={y=>mainSeriesRef.current?.coordinateToPrice(y)??null}
          onEdit={onChartExitEdit} onAdvanced={onEditPositionStop} onClose={onClosePosition}
          draftExits={chartDraftExits} draftTrail={chartDraftTrail} draftScope={chartDraftScope}
          onDraftEdit={onChartDraftEdit} onDraftAdvanced={onChartDraftAdvanced}/>}

        {/* Current price tag lives entirely inside the plotting area, never on
            the fixed mobile price rail or the time axis. Its blue is identical
            to the chart's blue line/price-line stroke. */}
        {showCurrentPriceLabel && currentPriceY !== null && Number.isFinite(currentPriceY) && (
          <div id="chart-current-price-label"
            role="status" aria-label={`Current price ${asset.price.toFixed(asset.digits)}`}
            className="absolute z-10 pointer-events-none -translate-y-1/2 max-w-[calc(100%-36px)] truncate whitespace-nowrap rounded-[2px] bg-[#2962ff] px-1 py-[1px] font-mono text-[9px] font-bold leading-[12px] text-white shadow-sm"
            style={{
              right: compactMobileAxes ? MOBILE_ORDER_RAIL_PX + 2 : 2,
              top: Math.max(9,Math.min(currentPriceY,
                Math.max(9,(chartContainerRef.current?.clientHeight||240)-(compactMobileAxes?MOBILE_ORDER_RAIL_PX:24)-9))),
            }}>
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
          priceDigits={asset.digits}
          onOpenConditionalOrder={onOpenConditionalOrder}
        />
      </div>
    );
  }
)
);
MainChart.displayName = 'MainChart';
