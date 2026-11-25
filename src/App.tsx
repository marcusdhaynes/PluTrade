import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Asset,
  ChartType,
  Drawing,
  DrawingToolType,
  IndicatorSettings,
  OHLCV,
  OrderBookItem,
  PriceAlert,
  AlertLogEntry,
  Timeframe,
  TradeItem,
  Watchlist,
  DetailedAlert,
  PaperPosition,
} from './types';
import {
  INITIAL_ASSETS,
  INITIAL_WATCHLISTS,
  INITIAL_DRAWINGS,
} from './data/assets';
import {
  fetchHistoricalData,
  fetchRealTicker24h,
  subscribeRealMarketData,
  generateOrderBook,
  generateLiveTrade,
  TIMEFRAME_SECONDS,
} from './services/dataFeed';
import { TopNavbar } from './components/TopNavbar';
import { LeftDrawingToolbar } from './components/LeftDrawingToolbar';
import { MainChart, MainChartRef } from './components/MainChart';
import { MultiChartWorkspace } from './components/layout/MultiChartWorkspace';
import { LayoutTemplate, LayoutSyncSettings, ChartWindowState, SavedChartLayout } from './types/layout';
import { LAYOUT_TEMPLATES, DEFAULT_SYNC_SETTINGS, getLayoutTemplateById } from './data/layoutTemplates';
import { RightSidebar, RightSidebarTab } from './components/RightSidebar';
import { BottomToolbar } from './components/BottomToolbar';
import { BottomTradingPanel } from './components/BottomTradingPanel';
import { PaperTradeTicket } from './components/PaperTradeTicket';
import { MobileTradingControls } from './components/MobileTradingControls';
import {ViewportPortal} from './components/FloatingPortal';
import { PaperAccountModal } from './components/PaperAccountModal';
import { SavedChartsModal } from './components/SavedChartsModal';
import type { SavedChartIdea } from './services/savedCharts';
import {combineHistoryWithLive,mergeLiveCandle} from './services/chartCandles';
import {customIntervalBase,isCustomInterval,resampleCustomCandles,
  type CustomInterval} from './services/customChartIntervals';
import {chartStarterMarket,type ChartLoadState} from './services/chartRecovery';
import { cancelPaperOrder,amendPendingPaperOrder,evaluatePaperOrders,expirePaperOrders,submitPaperOrder,estimatePaperQty,withOrderReservations,type PaperOrderRequest,type PaperAmendRequest,type PaperExitMode } from './services/paperOrders';
import { SymbolSearchModal } from './components/SymbolSearchModal';
import { IndicatorsModal } from './components/IndicatorsModal';
import { StrategyLabPanel } from './components/StrategyLabPanel';
import { AlertsModal } from './components/AlertsModal';
const TradeJournalModal=React.lazy(()=>import('./components/journal/TradeJournalModal')
  .then(mod=>({default:mod.TradeJournalModal})));
import { ChartPictureInPicture, ChartPictureInPictureRef } from './components/ChartPictureInPicture';
import { ConditionalOrder, DependencyContext } from './types';
import { INITIAL_CONDITIONAL_ORDERS } from './data/initialConditionalOrders';
import { ConditionalOrderModal } from './components/orders/ConditionalOrderModal';
import { Bell } from 'lucide-react';
import WebBuildBanner from './updates/WebBuildBanner';
import {KeyboardShortcutsDialog} from './components/KeyboardShortcutsDialog';
import {ruleCanActivate,ruleMatchesMarket} from './services/conditionalSafety';
import {routeConditionalRuleToPaperAccounts} from './services/conditionalAccountRouting';
import {quantityForConditional} from './services/conditionalExecution';
import {ruleConditionsMet,ruleEligibleOnTick} from './services/conditionalEvaluation';
import {closedMinuteRun,appendClosedMinute,completedIndicatorSignal,type IndicatorSignal} from './services/indicatorSignals';
import {marketIdentity,alertMarketIdentity,matchesExactMarket} from './services/marketIdentity';
import {attachDynamicTrailing,disableDynamicTrailing,applyDynamicTrailingFromBars,
  completedDynamicBars,validDynamicTrail,type DynamicTrailingSettings,
  type DynamicTrailTimeframe} from './services/dynamicTrailing';
import {evaluatePriceAlerts,ALERT_CONDITIONS,ALERT_FREQUENCIES,alertIsExpired,type AlertObservation} from './services/priceAlertEngine';
import {paperLedgerCriticalChanged} from './services/paperPersistence';
import {loadRiskPolicy,saveRiskPolicy,evaluateRiskPolicy} from './services/riskCenter';
import {updateFeedHealth,type MarketEvent,type FeedHealth} from './services/marketEvents';
import {createPaperWriterLease} from './services/paperTabOwnership';
import {loadWatchlists,persistWatchlists,isWatchlistStorageBlocked,readWatchlistBackupRaw,WATCHLIST_KEY,WATCHLIST_LEGACY_KEY} from './services/watchlistStorage';
import { emptyPaperPortfolio, closePaperPosition, updatePaperStops, updatePaperTargetLevels, enableTrailingPaperStop, disableTrailingPaperStop, isFreshPaperQuote, accountLeverage, paperCommission, paperExecutionPrice, configurePaperPortfolio, type PaperPortfolio, type PaperSettings } from './services/paperTrading';
import { loadPaperAccounts, savePaperAccounts, updateActivePaperAccount, createPaperAccountRecord, initialPaperAccounts,isPaperStorageBlocked,PAPER_ACCOUNTS_STORAGE_KEY, type PaperAccountsState } from './services/paperAccounts';

const assetIdentity = marketIdentity;
function readLocalJson<T>(key: string, fallback: T): T {
  try { const raw = localStorage.getItem(key); return raw === null ? fallback : JSON.parse(raw) as T; }
  catch { return fallback; }
}
function preserveInvalidPreference(key:string){
  try{
    const saved=localStorage.getItem(key),backup='plutrade_invalid_pref_backup_'+key;
    if(saved&&!localStorage.getItem(backup))localStorage.setItem(backup,saved);
  }catch(error){console.warn('Unable to back up invalid saved preference',key,error);}
}
const storedAssetValid=(value:unknown):value is Asset=>{
  if(!value||typeof value!=='object')return false;
  const asset=value as Asset;
  return typeof asset.symbol==='string'&&!!asset.symbol &&
    typeof asset.exchange==='string'&&!!asset.exchange&&
    typeof asset.marketType==='string'&&Number.isFinite(asset.price)&&
    typeof asset.currency==='string';
};
export default function App() {
  // State: Assets & Selection (fresh installs default to a public spot feed; saved exact market is preserved)
  const [assets, setAssets] = useState<Asset[]>(() => {
    const saved = readLocalJson<unknown>('tv_assets',null) ?? readLocalJson<unknown>('tv_assets_v4',null);
    // Old raw asset-list storage is no longer an authoritative exchange directory.
    let base = INITIAL_ASSETS;
    if(saved){
      if(Array.isArray(saved)&&saved.length>500&&saved.every(storedAssetValid))base=saved;
      else preserveInvalidPreference(localStorage.getItem('tv_assets')?'tv_assets':'tv_assets_v4');
    }
    try {
      const custom = JSON.parse(localStorage.getItem('plutrade_saved_markets_v1') || '[]') as Asset[];
      if(!Array.isArray(custom))return base;
      const seen=new Set(base.map(assetIdentity));
      return [...base,...custom.filter(a => {
        if(!storedAssetValid(a))return false;
        const id = assetIdentity(a);
        if (seen.has(id)) return false;
        seen.add(id);
        return true;
      })];
    } catch { return base; }
  });
  const [activeAsset, setActiveAsset] = useState<Asset>(() => {
    const savedSym = localStorage.getItem('tv_active_symbol');
    const savedVenue = localStorage.getItem('plutrade_active_source');
    const savedType = localStorage.getItem('plutrade_active_market_type');
    const savedChain=localStorage.getItem('plutrade_active_chain_id');
    const savedPool=localStorage.getItem('plutrade_active_pair_address');
    if (savedSym) {
      const matches=assets.filter(a=>a.symbol===savedSym&&(a.source||a.exchange)===savedVenue&&
        (a.marketType||'')===savedType&&
        (!a.pairAddress?!savedPool:a.pairAddress.toLowerCase()===savedPool?.toLowerCase())&&
        (!a.chainId?!savedChain:a.chainId.toLowerCase()===savedChain?.toLowerCase()));
      if(matches.length===1)return matches[0];
      if(!savedVenue){
        const matches=assets.filter(a=>a.symbol===savedSym);
        if(matches.length===1)return matches[0];
      }
    }
    return chartStarterMarket(assets);
  });
  const [activeTimeframe, setActiveTimeframe] = useState<Timeframe>(() => {
    const saved = localStorage.getItem('tv_timeframe');
    const allowed:Timeframe[]=['1s','5s','15s','30s','1m','3m','5m','15m','30m',
      '45m','1h','2h','3h','4h','1D','1W','1M','3M','12M'];
    return allowed.includes(saved as Timeframe) ? saved as Timeframe : '1m';
  });
  const [customChartInterval,setCustomChartInterval]=useState<CustomInterval|null>(()=>{
    const saved=readLocalJson<unknown>('plutrade_custom_chart_interval_v1',null);
    return isCustomInterval(saved)?saved:null;
  });
  useEffect(()=>{
    try{
      if(customChartInterval)localStorage.setItem('plutrade_custom_chart_interval_v1',JSON.stringify(customChartInterval));
      else localStorage.removeItem('plutrade_custom_chart_interval_v1');
    }catch(error){console.warn('Could not persist custom chart interval',error);}
  },[customChartInterval]);
  const selectStandardChartTimeframe=(timeframe:Timeframe)=>{
    setCustomChartInterval(null);
    setActiveTimeframe(timeframe);
  };
  const selectCustomChartTimeframe=(spec:CustomInterval):string|null=>{
    const availability=customIntervalBase(spec,activeAsset);
    if(!availability.base)return availability.warning;
    setCustomChartInterval({...spec});
    setActiveTimeframe(availability.base);
    return null;
  };
  useEffect(()=>{
    if(!customChartInterval)return;
    const availability=customIntervalBase(customChartInterval,activeAsset);
    if(!availability.base){
      // Moving from a supported 1-second market to a venue without that feed
      // should restore a usable default, not strand the chart on empty 1s data.
      setCustomChartInterval(null);
      setActiveTimeframe('1m');
      return;
    }
    if(activeTimeframe!==availability.base)setActiveTimeframe(availability.base);
  },[activeAsset.symbol,activeAsset.source,activeAsset.exchange,customChartInterval,activeTimeframe]);
  const [chartType, setChartType] = useState<ChartType>(() => {
    const saved = localStorage.getItem('tv_chart_type');
    const allowed:ChartType[]=['candlestick','bar','hollow','heikin-ashi','line',
      'area','baseline','column','step-line','high-low'];
    return allowed.includes(saved as ChartType) ? saved as ChartType : 'candlestick';
  });

  // State: Chart Data & Candles
  const [candles, setCandles] = useState<OHLCV[]>([]);
  const [isLoadingCandles, setIsLoadingCandles] = useState(true);
  const [chartHistoryState,setChartHistoryState]=useState<ChartLoadState>('loading');
  const [chartRetry,setChartRetry]=useState(0);
  // The live feed, order engine and verified source history retain their actual
  // provider timeframe. Custom chart intervals are derived only from those
  // observed candles and never create synthetic broker quotes or tick bars.
  const chartCandles=useMemo(()=>customChartInterval?
    resampleCustomCandles(candles,customChartInterval,activeTimeframe):candles,
    [candles,customChartInterval,activeTimeframe]);
  const [sessionVwapEnabled,setSessionVwapEnabled]=useState<boolean>(()=>readLocalJson<boolean>('plutrade_utc_session_vwap_v1',false)===true);
  useEffect(()=>{try{localStorage.setItem('plutrade_utc_session_vwap_v1',JSON.stringify(sessionVwapEnabled));}catch{}},[sessionVwapEnabled]);

  // State: Watchlists
  const [watchlists,setWatchlistsRaw]=useState<Watchlist[]>(()=>loadWatchlists(INITIAL_WATCHLISTS));
  const [watchlistStorageError,setWatchlistStorageError]=useState('');
  const watchlistRecoveryBlocked=isWatchlistStorageBlocked();
  const setWatchlists:React.Dispatch<React.SetStateAction<Watchlist[]>>=(change)=>{
    if(isWatchlistStorageBlocked()){
      setWatchlistStorageError('Saved watchlists are quarantined. Export the backup before resetting.');
      return;
    }
    setWatchlistsRaw(change);
  };
  const resetCorruptWatchlists=()=>{
    if(!isWatchlistStorageBlocked())return;
    try{
      const damaged=localStorage.getItem(WATCHLIST_LEGACY_KEY)??localStorage.getItem(WATCHLIST_KEY);
      if(!damaged||readWatchlistBackupRaw()!==damaged)
        throw Error('Recovery backup does not match the damaged watchlist; original collection is protected.');
      if(!window.confirm('Your original watchlists are backed up. Reset active watchlists to defaults? Export the backup first.'))return;
      localStorage.removeItem(WATCHLIST_KEY);
      localStorage.removeItem(WATCHLIST_LEGACY_KEY);
      setWatchlistsRaw(INITIAL_WATCHLISTS);
      setWatchlistStorageError('');
    }catch(error){setWatchlistStorageError(error instanceof Error?error.message:'Watchlist recovery failed');}
  };
  const [activeWatchlistId, setActiveWatchlistId] = useState<string>(() => {
    const saved = localStorage.getItem('tv_active_watchlist_id');
    return saved && watchlists.some(w=>w.id===saved) ? saved : watchlists[0].id;
  });

  // Store latest directory without reconnecting sockets for quote-only updates.
  const marketCatalogRef=useRef(assets);
  marketCatalogRef.current=assets;
  // The exported Kraken catalog is bundled locally; no AI Studio server is needed.

  // Price Flash Map for Watchlist ticker animations
  const [priceFlashMap, setPriceFlashMap] = useState<Record<string, 'up' | 'down'>>({});

  // Real Market Data Feed Connection Status
  const [marketStatus, setMarketStatus] = useState<{
    connected: boolean;
    provider: string;
    latencyMs: number;
  }>({
    connected: false,
    provider: 'Connecting to Market Data...',
    latencyMs: 0,
  });

  const feedHealthRef=useRef<Record<string,FeedHealth>>({});
  const [feedHealth,setFeedHealth]=useState<Record<string,FeedHealth>>({});
  const recordFeedEvent=useCallback((event:MarketEvent)=>{
    feedHealthRef.current[event.marketId]=updateFeedHealth(feedHealthRef.current[event.marketId],event);
  },[]);
  useEffect(()=>{
    const timer=window.setInterval(()=>setFeedHealth({...feedHealthRef.current}),1000);
    return ()=>window.clearInterval(timer);
  },[]);
  // State: Drawing Tools & Drawings
  const [activeTool, setActiveTool] = useState<DrawingToolType>('crosshair');
  const [areDrawingsLocked,setAreDrawingsLocked]=useState<boolean>(()=>
    readLocalJson<boolean>('tv_drawing_locked',false)===true);
  const [stayInDrawingMode,setStayInDrawingMode]=useState<boolean>(()=>
    readLocalJson<boolean>('tv_drawing_stay_mode',false)===true);
  useEffect(()=>{try{localStorage.setItem('tv_drawing_locked',JSON.stringify(areDrawingsLocked));}catch{}},[areDrawingsLocked]);
  useEffect(()=>{try{localStorage.setItem('tv_drawing_stay_mode',JSON.stringify(stayInDrawingMode));}catch{}},[stayInDrawingMode]);
  const [isMagnetMode, setIsMagnetMode] = useState<boolean>(() => {
    return readLocalJson<boolean>('tv_magnet_mode', false) === true;
  });
  const [areDrawingsHidden, setAreDrawingsHidden] = useState<boolean>(() => {
    return readLocalJson<boolean>('tv_drawings_hidden', false) === true;
  });
  const [currentColor, setCurrentColor] = useState<string>(() => {
    const saved = localStorage.getItem('tv_drawing_color');
    return saved || '#2962ff';
  });

  const [drawingsByMarket,setDrawingsByMarket]=useState<Record<string,Drawing[]>>(()=>{
    const saved=readLocalJson<Record<string,Drawing[]>|null>('tv_drawings_by_market_v1',null);
    if(saved&&typeof saved==='object'&&!Array.isArray(saved)){
      if(Object.values(saved).every(rows=>Array.isArray(rows)&&rows.every(d=>d&&
        typeof d.id==='string'&&typeof d.type==='string'&&Array.isArray(d.points))))
        return saved;
      preserveInvalidPreference('tv_drawings_by_market_v1');
    }
    // Only assign old global drawings to the exact market recorded in
    // the prior version; don't project them across every symbol.
    const old=readLocalJson<Drawing[]>('tv_drawings',[]);
    const savedSymbol=localStorage.getItem('tv_active_symbol');
    const savedVenue=localStorage.getItem('plutrade_active_source');
    const savedType=localStorage.getItem('plutrade_active_market_type')||'';
    if(Array.isArray(old)&&old.length&&savedSymbol&&savedVenue)
      return {[savedSymbol+'|'+savedVenue+'|'+savedType]:old};
    return {};
  });
  const drawings=drawingsByMarket[marketIdentity(activeAsset)]||[];
  // Backward-compatible preservation: copy older DEX drawings only when
  // the former three-part market key maps to one and only one pool.
  useEffect(()=>{
    setDrawingsByMarket(prev=>{
      let next=prev;
      for(const asset of assets){
        if(!asset.pairAddress||!asset.chainId)continue;
        const oldKey=[asset.symbol,asset.source||asset.exchange,asset.marketType||''].join('|');
        const exactKey=marketIdentity(asset);
        const matches=assets.filter(a=>[a.symbol,a.source||a.exchange,a.marketType||''].join('|')===oldKey);
        if(matches.length===1 && prev[oldKey] && !prev[exactKey]){
          if(next===prev)next={...prev};
          next[exactKey]=structuredClone(prev[oldKey]);
        }
      }
      return next;
    });
  },[assets]);
  const setDrawingsForMarket=useCallback((asset:Asset,change:React.SetStateAction<Drawing[]>)=>{
    const key=marketIdentity(asset);
    setDrawingsByMarket(prev=>{
      const current=prev[key]||[];
      const next=typeof change==='function'?change(current):change;
      return {...prev,[key]:next};
    });
  },[]);
  const setDrawings=useCallback<React.Dispatch<React.SetStateAction<Drawing[]>>>(
    change=>setDrawingsForMarket(activeAsset,change),
    [activeAsset.symbol,activeAsset.source,activeAsset.exchange,activeAsset.marketType,
      activeAsset.chainId,activeAsset.pairAddress,setDrawingsForMarket]);
  useEffect(()=>{
    try{localStorage.setItem('tv_drawings_by_market_v1',JSON.stringify(drawingsByMarket));}
    catch(e){console.warn('Could not save per-market drawings',e);}
  },[drawingsByMarket]);
  const drawingHistoryRef=useRef<Record<string,{past:Drawing[][];future:Drawing[][]}>>({});
  const drawingLastRef=useRef<Record<string,Drawing[]>>({...drawingsByMarket});
  const replayingDrawingKeysRef=useRef<Set<string>>(new Set());
  useEffect(()=>{
    for(const [key,current] of Object.entries(drawingsByMarket)){
      const previous=drawingLastRef.current[key];
      if(previous&&JSON.stringify(previous)!==JSON.stringify(current)){
        if(replayingDrawingKeysRef.current.has(key))replayingDrawingKeysRef.current.delete(key);
        else{
          const history=drawingHistoryRef.current[key]||{past:[],future:[]};
          history.past.push(structuredClone(previous));
          if(history.past.length>100)history.past.shift();
          history.future=[];
          drawingHistoryRef.current[key]=history;
        }
      }
      drawingLastRef.current[key]=structuredClone(current);
    }
  },[drawingsByMarket]);

  // Keep the mobile chart legend hidden by default; desktop still shows it.
  const [showMobileChartLegend,setShowMobileChartLegend]=useState(()=>{
    try{return localStorage.getItem('plutrade_mobile_chart_legend_v1')==='true';}
    catch{return false;}
  });
  useEffect(()=>{
    try{localStorage.setItem('plutrade_mobile_chart_legend_v1',String(showMobileChartLegend));}
    catch{}
  },[showMobileChartLegend]);

  const [showCurrentPriceLabel,setShowCurrentPriceLabel]=useState(()=>{try{return localStorage.getItem('plutrade_current_price_label_v1')==='true';}catch{return false;}});
  useEffect(()=>{try{localStorage.setItem('plutrade_current_price_label_v1',String(showCurrentPriceLabel));}catch{}},[showCurrentPriceLabel]);

  // State: Indicators
  const [indicators, setIndicators] = useState<IndicatorSettings>(() => {
    const saved = localStorage.getItem('tv_indicators');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        const keys=['sma20','sma50','sma200','ema9','ema21','bollingerBands',
          'vwap','supertrend','volume','rsi','macd'];
        if(!parsed || typeof parsed!=='object' ||
          !keys.every(k=>parsed[k] && typeof parsed[k].enabled==='boolean'))
          throw new Error('Invalid saved indicator configuration');
        if (!localStorage.getItem('tv_indicators_vol_v2')) {
          if (parsed.volume) parsed.volume.enabled = false;
          localStorage.setItem('tv_indicators_vol_v2', 'true');
          localStorage.setItem('tv_indicators', JSON.stringify(parsed));
        }
        return parsed;
      } catch {
        // fallback
      }
    }
    return {
      sma20: { enabled: false, period: 20, color: '#ffb74d' },
      sma50: { enabled: false, period: 50, color: '#29b6f6' },
      sma200: { enabled: false, period: 200, color: '#ab47bc' },
      ema9: { enabled: false, period: 9, color: '#26c6da' },
      ema21: { enabled: false, period: 21, color: '#ff7043' },
      bollingerBands: {
        enabled: false,
        period: 20,
        stdDev: 2,
        upperColor: 'rgba(41, 98, 255, 0.7)',
        middleColor: 'rgba(255, 152, 0, 0.7)',
        lowerColor: 'rgba(41, 98, 255, 0.7)',
        fillColor: 'rgba(41, 98, 255, 0.05)',
      },
      vwap: { enabled: false, color: '#ba68c8' },
      supertrend: { enabled: false, period: 10, multiplier: 3, upColor: '#089981', downColor: '#f23645' },
      volume: { enabled: false, upColor: 'rgba(8, 153, 129, 0.35)', downColor: 'rgba(242, 54, 69, 0.35)' },
      rsi: { enabled: false, period: 14, overbought: 70, oversold: 30, color: '#e040fb' },
      macd: {
        enabled: false,
        fastPeriod: 12,
        slowPeriod: 26,
        signalPeriod: 9,
        macdColor: '#2962ff',
        signalColor: '#ff9800',
        histUpColor: '#089981',
        histDownColor: '#f23645',
      },
    };
  });

  // State: Detailed Alerts & Price Alerts (Matching Screenshot with 4 alerts)
  const [detailedAlerts, setDetailedAlerts] = useState<DetailedAlert[]>(() => {
    const saved = readLocalJson<DetailedAlert[]>('tv_detailed_alerts', []);
    return Array.isArray(saved) ? saved.filter(a=>a && typeof a.id==='string' &&
      typeof a.symbol==='string' && typeof a.status==='string') : [];
  });

  const [alerts, setAlerts] = useState<PriceAlert[]>(() => {
    const saved = readLocalJson<PriceAlert[]>('tv_alerts', []);
    // Unbound legacy alerts are visible but paused, not allowed to fire on
    // whichever exchange happens to be selected.
    return Array.isArray(saved) ? saved.filter(a=>a && typeof a.id==='string' &&
      typeof a.symbol==='string' && Number.isFinite(a.targetPrice) &&
      ALERT_CONDITIONS.includes(a.condition) && (!a.frequency || ALERT_FREQUENCIES.includes(a.frequency)))
      .map(a=>a.exchange && (!a.symbol.includes('@')||(a.pairAddress&&a.chainId))?
        a:{...a,paused:true}) : [];
  });
  const alertsRef = useRef<PriceAlert[]>(alerts);
  const previousAlertPricesRef = useRef<Record<string, number>>({});
  const [alertLog, setAlertLog] = useState<AlertLogEntry[]>(() => {
    try {
      const value = JSON.parse(localStorage.getItem('plutrade_alert_log_v1') || '[]');
      return Array.isArray(value) ? value.slice(0, 100) : [];
    } catch { return []; }
  });
  useEffect(() => {
    alertsRef.current = alerts;
    try { localStorage.setItem('tv_alerts', JSON.stringify(alerts)); }
    catch (error) { console.warn('Price alert storage unavailable', error); }
  }, [alerts]);
  useEffect(() => {
    try { localStorage.setItem('plutrade_alert_log_v1', JSON.stringify(alertLog)); }
    catch (error) { console.warn('Alert log storage unavailable', error); }
  }, [alertLog]);
  const [activeNotification, setActiveNotification] = useState<{ id: string; message: string; type: 'alert' | 'info' } | null>(null);
  const processPriceAlertTick = useCallback((
    market:Asset,price:number,now=Date.now(),observation:AlertObservation={kind:'tick'}
  ):string[] => {
    // Use separate price histories for realtime ticks and confirmed candle closes;
    // an intrabar print cannot provide the previous bar-close value.
    const key=alertMarketIdentity(market)+(observation.kind==='closed-bar'?
      '|close|'+(observation.timeframe||''):'|tick');
    const previous=previousAlertPricesRef.current[key];
    if(!Number.isFinite(price)||price<=0||!Number.isFinite(now))return [];
    previousAlertPricesRef.current[key]=price;
    const result=evaluatePriceAlerts(alertsRef.current,market,previous,price,now,observation);
    if(!result.hits.length)return [];
    alertsRef.current=result.updated;
    setAlerts(result.updated);
    const venue=market.source||market.exchange;
    const entries:AlertLogEntry[]=result.hits.map((alert,index)=>({
      id:alert.id+'-'+now+'-'+index,symbol:market.symbol,price,at:now,
      message:alert.notes?
        `${market.symbol} (${venue}): ${alert.notes} · ${price} ${market.currency}`:
        `${market.symbol} (${venue}) ${alert.condition.replaceAll('_',' ')} ${alert.targetPrice} at ${price} ${market.currency}`,
    }));
    setAlertLog(prev=>[...entries,...prev].slice(0,1000));
    setActiveNotification({id:String(now),message:entries[0].message,type:'alert'});
    if(typeof Notification!=='undefined'&&Notification.permission==='granted'){
      try{
        // Permission is only requested from the user's explicit Alerts dialog button.
        new Notification('PluTrade alert · '+market.symbol,{body:entries[0].message,
          tag:'plutrade-price-alert-'+result.hits[0].id});
      }catch(error){console.debug('Browser notification unavailable',error);}
    }
    return result.hits.map(a=>a.id);
  }, []);
  // Poll dormant/inactive-chart alerts at their exact venue. These snapshots
  // are not tick streams; users must keep the browser open for notifications.
  const monitoredAlertKeys = alerts.filter(a=>!a.triggered&&!a.paused&&!alertIsExpired(a,Date.now())&&!!a.exchange)
    .map(alertMarketIdentity).sort().join('~');
  useEffect(() => {
    const wanted = new Set(monitoredAlertKeys.split('~').filter(Boolean));
    const selectedKey = alertMarketIdentity(activeAsset);
    const targets = marketCatalogRef.current.filter(a=>wanted.has(alertMarketIdentity(a))&&alertMarketIdentity(a)!==selectedKey);
    if (!targets.length) return;
    let stopped=false, cursor=0;
    const poll = async () => {
      const batch=targets.slice(cursor,cursor+8);
      cursor=(cursor+8)%targets.length;
      const quotes=await Promise.all(batch.map(a=>fetchRealTicker24h(a).catch(()=>null)));
      if(stopped)return;
      quotes.forEach((q,i)=>{
        if(q && Number.isFinite(q.price) && q.price!>0)
          processPriceAlertTick(batch[i],q.price!,q.quoteUpdatedAt||Date.now());
      });
    };
    void poll();
    const interval=window.setInterval(()=>{void poll();},20000);
    return ()=>{stopped=true;window.clearInterval(interval);};
  },[monitoredAlertKeys,activeAsset.symbol,activeAsset.source,activeAsset.exchange,activeAsset.marketType,
    activeAsset.chainId,activeAsset.pairAddress,assets.length,processPriceAlertTick]);


  const [riskPolicy,setRiskPolicy]=useState(loadRiskPolicy);
  useEffect(()=>{try{saveRiskPolicy(riskPolicy);}catch(error){console.warn('Could not persist risk policy',error);}},[riskPolicy]);
  // Each account owns independent cash, holdings, fills, conditional orders and fee policy.
  const [paperAccounts,setPaperAccountsRaw]=useState<PaperAccountsState>(()=>loadPaperAccounts(assets));
  const [paperStorageWriteFailed,setPaperStorageWriteFailed]=useState(false);
  const paperStorageBlockedRef=useRef(isPaperStorageBlocked());
  const paperWriterOwnedRef=useRef(false);
  const [paperWriterOwned,setPaperWriterOwned]=useState(false);
  const paperTradingBlocked=paperStorageBlockedRef.current||paperStorageWriteFailed||!paperWriterOwned;
  // Every source of account changes (tickets, rules, fills, tick subscriptions)
  // passes through this fail-closed gate. Recovering a broken ledger is explicit.
  const setPaperAccounts:typeof setPaperAccountsRaw=(change)=>{
    if(paperStorageBlockedRef.current||paperStorageWriteFailed||!paperWriterOwnedRef.current){
      setPaperError(!paperWriterOwnedRef.current?
        'This tab is read-only. Another PluTrade tab owns paper trading, or secure Web Locks are unavailable.':
        'Paper trading is locked while ledger recovery or persistence repair is required.');
      return;
    }
    setPaperAccountsRaw(change);
  };
  const activePaperRecord=paperAccounts.accounts.find(a=>a.id===paperAccounts.activeId)||paperAccounts.accounts[0];
  const paperPortfolio=activePaperRecord.portfolio;
  const {account:paperAccount,positions:paperPositions,fills:paperFills}=paperPortfolio;
  const conditionalOrders=activePaperRecord.orders;
  const setPaperPortfolio=(action:PaperPortfolio|((prev:PaperPortfolio)=>PaperPortfolio))=>
    setPaperAccounts(prev=>updateActivePaperAccount(prev,record=>({...record,
      portfolio:typeof action==='function'?action(record.portfolio):action})));
  const setConditionalOrders=(action:ConditionalOrder[]|((prev:ConditionalOrder[])=>ConditionalOrder[]))=>
    setPaperAccounts(prev=>updateActivePaperAccount(prev,record=>({...record,
      orders:typeof action==='function'?action(record.orders):action})));
  const [paperError,setPaperError]=useState(()=>
    isPaperStorageBlocked()?'Saved paper ledger is unreadable. Export its backup before starting a new account.':'');
  const resolvePaperRecovery=()=>{
    if(!isPaperStorageBlocked())return;
    if(!window.confirm('An unreadable paper ledger was backed up. Starting fresh permanently replaces the damaged active ledger. Export the backup first. Continue?'))return;
    try{
      localStorage.removeItem(PAPER_ACCOUNTS_STORAGE_KEY);
      setPaperAccountsRaw(initialPaperAccounts());
      paperStorageBlockedRef.current=false;
      setPaperStorageWriteFailed(false);
      setPaperError('Fresh paper account created. Original unreadable ledger remains in the recovery backup.');
    }catch(e){setPaperError('Storage unavailable; recovery cannot be completed.');}
  };
  const [closeReviewId,setCloseReviewId]=useState<string|null>(null);
  const [closeReviewQty,setCloseReviewQty]=useState('');
  const previousRulePrices=useRef<Record<string,number>>({});
  const previousRuleTimes=useRef<Record<string,number>>({});
  const applyRuleToPortfolio = useCallback((order:ConditionalOrder,base:PaperPortfolio,market:Asset):PaperPortfolio => {
    if(!ruleMatchesMarket(order,market)||!ruleCanActivate(order)||!isFreshPaperQuote(market))
      throw new Error('Conditional order needs a fresh quote from the selected market.');
    let next:PaperPortfolio=base;
    const submitWithRisk=(request:PaperOrderRequest)=>{
      const verdict=evaluateRiskPolicy(next,market,request,riskPolicy);
      if(!verdict.allowed)throw new Error(verdict.reason||'Risk policy rejected this paper order');
      return submitPaperOrder(next,market,request);
    };
        const side=order.action==='enter_short'?'Short':'Long';
        const spec=order.execution;
        const qtyFor=(_kind:'market'|'limit',price:number)=>
          quantityForConditional(spec,next,market,price);
        const match=next.positions.find(p=>matchesExactMarket(p,market)&&
          (!spec.positionId||p.id===spec.positionId));
        if(order.action==='enter_long'||order.action==='enter_short'){
          const kind=spec.orderType==='limit'?'limit':'market';
          const price=kind==='limit'?(spec.limitPrice||0):market.price;
          const tp=spec.tpPrice||(spec.tpPercent?
            price*(1+(side==='Long'?1:-1)*spec.tpPercent/100):undefined);
          const sl=spec.slPrice||(spec.slPercent?
            price*(1-(side==='Long'?1:-1)*spec.slPercent/100):undefined);
          next=submitWithRisk({side,kind,qty:qtyFor(kind,price),
            price:kind==='limit'?price:undefined,tp,sl,timeInForce:'GTC'});
        }else if(order.action==='increase_position'){
          if(!match)throw new Error('No position to increase.');
          const percent=Number(spec.increasePercent)||50;
          if(!Number.isFinite(percent)||percent<=0||percent>100)
            throw new Error('Scale-in percentage must be 0–100%.');
          next=submitWithRisk({side:match.side,kind:'market',
            qty:match.qty*percent/100});
        }else if(order.action==='exit_long'||order.action==='exit_short'){
          const expected=order.action==='exit_long'?'Long':'Short';
          if(!match||match.side!==expected)throw new Error('No matching position to close.');
          next=withOrderReservations(closePaperPosition(next,match.id,market.price));
        }else if(order.action==='tp'){
          if(!match)throw new Error('No position for take profit.');
          next=withOrderReservations(closePaperPosition(next,match.id,market.price));
        }else if(order.action==='reduce_position'){
          if(!match)throw new Error('No position to reduce.');
          const percent=Number(spec.reducePercent)||50;
          if(percent<=0||percent>100)throw new Error('Invalid reduction percentage.');
          next=withOrderReservations(closePaperPosition(next,match.id,market.price,match.qty*percent/100));
        }else if(order.action==='sl_set'){
          if(!match)throw new Error('No position to protect.');
          const value=spec.slPrice||(spec.slPercent?
            match.entryPrice*(1-(match.side==='Long'?1:-1)*spec.slPercent/100):undefined);
          if(!value)throw new Error('Choose a valid stop-loss price.');
          if(match.side==='Long'?value>=market.price:value<=market.price)
            throw new Error('Stop loss must be protective relative to the latest quote.');
          next=updatePaperStops(next,match.id,match.tp,value);
        }else if(order.action==='sl_trailing'){
          if(!match)throw new Error('No position for trailing stop.');
          next=enableTrailingPaperStop(next,match.id,Number(spec.trailingPercent));
        }else if(order.action==='sl_dynamic'){
          if(!match)throw new Error('No position for dynamic ATR protection.');
          if(!validDynamicTrail(spec.dynamicTrailing))throw new Error('Invalid dynamic ATR settings.');
          next=attachDynamicTrailing(next,match.id,spec.dynamicTrailing);
        }else if(order.action==='cancel_all'){
          for(const pending of [...(next.pendingOrders||[])])
            next=cancelPaperOrder(next,pending.id);
        }else{
          throw new Error('Unsupported paper order action.');
        }
    return next;
  },[riskPolicy]);

  const executeObservedTick=useCallback((market:Asset,at:number,events:string[]=[],indicator?:IndicatorSignal)=>{
    if(!isFreshPaperQuote(market,at))return;
    const key=marketIdentity(market),previous=previousRulePrices.current[key];
    const previousAt=previousRuleTimes.current[key];
    previousRulePrices.current[key]=market.price;
    previousRuleTimes.current[key]=at;
    const eventIds=new Set(events);
    setPaperAccounts(state=>{
      let changed=false;
      const accounts=state.accounts.map(record=>{
        let portfolio=evaluatePaperOrders(record.portfolio,market,at);
        let orders=record.orders;
        for(let i=0;i<record.orders.length;i++){
          const order=orders[i];
          if(order.status!=='active'||(order.accountId&&order.accountId!==record.id)||
            !ruleCanActivate(order)||!ruleMatchesMarket(order,market))continue;
          const dependsOnIndicator=order.conditions.some(c=>c.dependencyType==='indicator');
          if(dependsOnIndicator!==Boolean(indicator))continue;
          const met=ruleConditionsMet(order,market,previous,portfolio,eventIds,drawingsByMarket[key]||[],previousAt,indicator);
          // Re-arm WHENEVER only after a false observation. Alert dependencies
          // require an actual new event, never a persisted "triggered" flag.
          if((order.conditionLogic==='WHENEVER'||order.conditionLogic==='WHILE') &&
             Boolean(order.lastConditionSatisfied)!==met){
            if(orders===record.orders)orders=[...orders];
            orders[i]={...order,lastConditionSatisfied:met};
          }
          if(!ruleEligibleOnTick(order,met,at))continue;
          try{
            portfolio=applyRuleToPortfolio(order,portfolio,market);
            if(orders===record.orders)orders=[...orders];
            orders[i]={...order,triggerCount:order.triggerCount+1,lastTriggeredAt:at,
              lastConditionSatisfied:true,
              status:order.conditionLogic==='WHENEVER'||order.conditionLogic==='WHILE'?'active':'triggered'};
          }catch(error){
            console.warn('Paper conditional rule could not execute',order.id,error);
          }
        }
        if(portfolio===record.portfolio&&orders===record.orders)return record;
        changed=true;return {...record,portfolio,orders};
      });
      return changed?{...state,accounts}:state;
    });
  },[applyRuleToPortfolio,drawingsByMarket]);

  const indicatorMarketKeys=[...new Set(paperAccounts.accounts.flatMap(record=>
    record.orders.filter(o=>o.status==='active'&&ruleCanActivate(o)&&
      o.conditions.some(c=>c.dependencyType==='indicator')).map(marketIdentity)))].sort().join('~');
  // Indicator automation has a dedicated 1m verified-trade subscription per market.
  // It never uses ticker/REST snapshots, synthesized bars or open candles.
  useEffect(()=>{
    const keys=indicatorMarketKeys.split('~').filter(Boolean);
    if(!keys.length)return;
    let cancelled=false;
    const stops:Array<()=>void>=[];
    for(const key of keys){
      const market=marketCatalogRef.current.find(a=>marketIdentity(a)===key);
      if(!market)continue;
      let history:OHLCV[]=[],liveClosed:OHLCV[]=[];
      let lastSignalAt=0,pending:IndicatorSignal|undefined;
      void fetchHistoricalData(market,'1m').then(data=>{
        if(cancelled)return;
        history=closedMinuteRun([...data,...liveClosed]);
      }).catch(()=>{ /* Missing history leaves indicator rules unarmed. */ });
      stops.push(subscribeRealMarketData(market,'1m',{
        onCandleTick:(bar,isClosed)=>{
          if(cancelled||!isClosed)return;
          liveClosed=appendClosedMinute(liveClosed,bar);
          history=appendClosedMinute(history,bar);
          const signal=completedIndicatorSignal(history);
          if(signal&&signal.candleTime>lastSignalAt){
            lastSignalAt=signal.candleTime;pending=signal;
          }
        },
        onPriceUpdate:(price,_ch,_pct,origin)=>{
          if(cancelled||origin!=='stream'||!pending||!Number.isFinite(price)||price<=0)return;
          const signal=pending;pending=undefined;
          const at=Date.now();
          executeObservedTick({...market,price,quoteStatus:'live',
            quoteUpdatedAt:at,streamConnected:true},at,[],signal);
        },
        onMarketEvent:recordFeedEvent,
        onOrderBook:()=>{},onTrade:()=>{},onStatusChange:()=>{},
      }));
    }
    return ()=>{cancelled=true;stops.forEach(stop=>stop());};
  },[indicatorMarketKeys,assets.length,executeObservedTick,recordFeedEvent]);
  // One venue-scoped, timeframe-scoped verified candle pipeline for every
  // active ATR-Chandelier stop in any paper account. All copies share this
  // subscription; only the local writer tab may mutate paper ledgers.
  const dynamicTrailingKeys=[...new Set(paperAccounts.accounts.flatMap(record=>
    record.portfolio.positions.filter(p=>p.dynamicTrailing).map(p=>
      marketIdentity(p)+'::'+p.dynamicTrailing!.timeframe)))].sort().join('~');
  useEffect(()=>{
    if(!paperWriterOwned)return;
    const combinations=dynamicTrailingKeys.split('~').filter(Boolean);
    if(!combinations.length)return;
    let stopped=false;
    const unsubs:Array<()=>void>=[];
    for(const combination of combinations){
      const split=combination.lastIndexOf('::');
      if(split<0)continue;
      const key=combination.slice(0,split);
      const timeframe=combination.slice(split+2) as DynamicTrailTimeframe;
      const market=marketCatalogRef.current.find(a=>marketIdentity(a)===key);
      if(!market)continue;
      let history:OHLCV[]=[],pending:OHLCV[]=[],historyLoaded=false;
      const refresh=()=>{
        if(stopped)return;
        const closed=completedDynamicBars([...history,...pending],timeframe,Date.now());
        if(!closed.length)return;
        setPaperAccounts(state=>{
          let changed=false;
          const accounts=state.accounts.map(record=>{
            const portfolio=applyDynamicTrailingFromBars(record.portfolio,market,timeframe,closed,Date.now());
            if(portfolio===record.portfolio)return record;
            changed=true;
            return {...record,portfolio};
          });
          return changed?{...state,accounts}:state;
        });
      };
      // Stream only confirmed closed venue bars. REST history is verified
      // by the market provider; synthetic example candles are never used.
      unsubs.push(subscribeRealMarketData(market,timeframe,{
        onCandleTick:(bar,isClosed)=>{
          if(stopped||!isClosed)return;
          pending=[...pending,bar].slice(-250);
          if(historyLoaded)refresh();
        },
        onPriceUpdate:()=>{},onMarketEvent:recordFeedEvent,
        onOrderBook:()=>{},onTrade:()=>{},onStatusChange:()=>{},
      }));
      void fetchHistoricalData(market,timeframe).then(bars=>{
        if(stopped)return;
        history=bars;
        historyLoaded=true;
        refresh();
      }).catch(()=>{
        // Without trustworthy sufficient bars, a dynamic stop shows
        // warming/unavailable; any existing fixed stop stays in place.
        historyLoaded=true;
        refresh();
      });
    }
    return ()=>{stopped=true;unsubs.forEach(fn=>fn());};
  },[dynamicTrailingKeys,paperWriterOwned,assets.length,recordFeedEvent]);

  // Held paper positions and pending orders need real, venue-scoped stream
  // updates; REST snapshots must never fill a pending order or protective stop.
  const heldMarketKeys=[...new Set(paperAccounts.accounts.flatMap(record=>[
    ...record.portfolio.positions.map(marketIdentity),
    ...(record.portfolio.pendingOrders||[]).map(marketIdentity),
    ...record.orders.filter(o=>o.status==='active'&&ruleCanActivate(o)).map(marketIdentity),
  ]))].sort().join('~');
  useEffect(()=>{
    const activeKey=marketIdentity(activeAsset);
    const pending=heldMarketKeys.split('~').filter(k=>k&&k!==activeKey);
    let stopped=false;
    const unsubs:Array<()=>void>=[];
    for(const key of pending){
      const market=marketCatalogRef.current.find(asset=>marketIdentity(asset)===key);
      if(!market)continue;
      unsubs.push(subscribeRealMarketData(market,'1m',{
        onPriceUpdate:(price,_change,_percent,origin)=>{
          if(stopped||origin!=='stream'||!Number.isFinite(price)||price<=0)return;
          const at=Date.now(),quote:Asset={...market,price,quoteStatus:'live',quoteUpdatedAt:at,streamConnected:true};
          const hits=processPriceAlertTick(market,price,at);
          executeObservedTick(quote,at,hits);
        },
        onMarketEvent:recordFeedEvent,
        onCandleTick:()=>{},onOrderBook:()=>{},onTrade:()=>{},onStatusChange:()=>{},
      }));
    }
    return ()=>{stopped=true;unsubs.forEach(unsub=>unsub());};
  },[heldMarketKeys,activeAsset.symbol,activeAsset.source,activeAsset.exchange,activeAsset.marketType,
    activeAsset.chainId,activeAsset.pairAddress,assets.length,executeObservedTick,processPriceAlertTick,recordFeedEvent]);
  useEffect(() => {
    const expire = () => setPaperAccounts(prev => {
      let changed = false;
      const accounts = prev.accounts.map(record => {
        const portfolio = expirePaperOrders(record.portfolio);
        if (portfolio === record.portfolio) return record;
        changed = true;
        return {...record, portfolio};
      });
      return changed ? {...prev, accounts} : prev;
    });
    expire();
    const interval = window.setInterval(expire, 60000);
    return () => window.clearInterval(interval);
  }, []);
  const selectPaperAccount=(id:string)=>{
    setPaperAccounts(prev=>prev.accounts.some(a=>a.id===id)?{...prev,activeId:id}:prev);
    setPaperError('');
  };
  const savePaperAccount=(id:string|null,name:string,settings:PaperSettings)=>{
    if(id){
      // Validate before touching React state so the dialog receives any error.
      const record=paperAccounts.accounts.find(a=>a.id===id);
      if(!record)throw new Error('Account not found.');
      const updated=withOrderReservations(configurePaperPortfolio(record.portfolio,settings,name));
      setPaperAccounts(prev=>({...prev,accounts:prev.accounts.map(a=>a.id===id?{...a,portfolio:updated}:a)}));
    }else{
      const record=createPaperAccountRecord(name,settings);
      setPaperAccounts(prev=>({activeId:record.id,accounts:[...prev.accounts,record]}));
    }
    setPaperError('');
  };
  const deletePaperAccount=(id:string)=>{
    setPaperAccounts(prev=>{
      if(prev.accounts.length<=1)return prev;
      const accounts=prev.accounts.filter(a=>a.id!==id);
      return {accounts,activeId:prev.activeId===id?accounts[0].id:prev.activeId};
    });
    setPaperError('');
  };
  // A single browser tab may author simulated trades. Competing tabs are
  // read-only and must reacquire the lock and reload the latest durable ledger.
  useEffect(()=>{
    const manager=typeof navigator!=='undefined'?navigator.locks:undefined;
    const lease=createPaperWriterLease(manager,()=>{
      paperWriterOwnedRef.current=false;
      const blocked=isPaperStorageBlocked();
      paperStorageBlockedRef.current=blocked;
      if(blocked){
        setPaperStorageWriteFailed(true);
        setPaperError('Paper ledger needs recovery; this tab is locked.');
        return;
      }
      const latest=loadPaperAccounts();
      setPaperAccountsRaw(latest);
      paperWriterOwnedRef.current=true;
      setPaperWriterOwned(true);
      setPaperStorageWriteFailed(false);
      setPaperError('');
    },()=>{
      paperWriterOwnedRef.current=false;
      setPaperWriterOwned(false);
      setPaperError('Paper writer ownership was lost; trading locked until reacquired.');
    });
    if(!lease.supported)setPaperError('This browser lacks Web Locks: safe cross-tab paper trading is unavailable.');
    lease.attempt();
    const retry=window.setInterval(()=>lease.attempt(),2500);
    return ()=>{window.clearInterval(retry);paperWriterOwnedRef.current=false;lease.release();};
  },[]);
  // React's ordered state-updater queue processes every observed price tick,
  // but mark-to-market UI refreshes must not rewrite localStorage each tick.
  const latestPaperRef=useRef(paperAccounts);
  const lastDurablePaperRef=useRef<PaperAccountsState|null>(null);
  const paperWriteTimerRef=useRef<number|null>(null);
  latestPaperRef.current=paperAccounts;
  const persistPaperNow=useCallback(()=>{
    if(paperWriteTimerRef.current!==null){
      window.clearTimeout(paperWriteTimerRef.current);paperWriteTimerRef.current=null;
    }
    if(paperStorageBlockedRef.current||!paperWriterOwnedRef.current)return;
    const latest=latestPaperRef.current;
    try{
      savePaperAccounts(latest);
      lastDurablePaperRef.current=latest;
    }catch(e){
      console.warn('Paper ledger persistence blocked',e);
      paperStorageBlockedRef.current=true;
      setPaperStorageWriteFailed(true);
      setPaperError(e instanceof Error?e.message:'Paper account saving is blocked.');
      if(lastDurablePaperRef.current)setPaperAccountsRaw(lastDurablePaperRef.current);
    }
  },[]);
  useEffect(()=>{
    if(paperTradingBlocked)return;
    if(paperLedgerCriticalChanged(lastDurablePaperRef.current,paperAccounts))persistPaperNow();
    else if(paperWriteTimerRef.current===null)
      paperWriteTimerRef.current=window.setTimeout(persistPaperNow,350);
  },[paperAccounts,paperTradingBlocked,persistPaperNow]);
  useEffect(()=>{
    const onHide=()=>persistPaperNow();
    const onStorage=(event:StorageEvent)=>{
      if(event.key!==PAPER_ACCOUNTS_STORAGE_KEY)return;
      // Even structurally valid writes by another (possibly older) application
      // must not be merged into our execution state without reconciliation.
      paperStorageBlockedRef.current=true;
      setPaperStorageWriteFailed(true);
      setPaperError('Paper ledger was changed by another tab. Trading is locked to prevent overwrite; reload to reconcile.');
    };
    window.addEventListener('pagehide',onHide);
    window.addEventListener('storage',onStorage);
    return ()=>{
      window.removeEventListener('pagehide',onHide);
      window.removeEventListener('storage',onStorage);
      if(paperWriteTimerRef.current!==null)window.clearTimeout(paperWriteTimerRef.current);
    };
  },[persistPaperNow]);
  const [isBottomTradingOpen, setIsBottomTradingOpen] = useState(false);
  const [isTradeTicketOpen,setIsTradeTicketOpen]=useState(false);
  // Mobile quick-entry sizing is explicit: % of currently AVAILABLE funds or
  // an exact amount of available account-currency margin (not total equity).
  const [mobileQuickSize,setMobileQuickSize]=useState<{mode:'equity'|'cash';value:number}>(()=>{
    try{
      const saved=JSON.parse(localStorage.getItem('plutrade_mobile_quick_size_v2')||'null');
      if(saved&&(saved.mode==='equity'||saved.mode==='cash')&&Number.isFinite(saved.value)&&
        saved.value>0&&(saved.mode==='cash'||saved.value<=100))return saved;
      const old=Number(localStorage.getItem('plutrade_mobile_equity_percent_v1'));
      return {mode:'equity',value:Number.isFinite(old)&&old>0&&old<=100?old:99};
    }catch{return {mode:'equity',value:99};}
  });
  const [mobileEntryExits,setMobileEntryExits]=useState<
    Partial<Record<'sl'|'tp',{mode:PaperExitMode;value:string}>>
  >({});
  const [mobileQuickTicket,setMobileQuickTicket]=useState<{focus?:'sl'|'tp';seq:number}|null>(null);
  const [mobileExitRequest,setMobileExitRequest]=useState<{id:string;kind:'sl'|'tp';seq:number}|null>(null);
  useEffect(()=>{
    try{localStorage.setItem('plutrade_mobile_quick_size_v2',JSON.stringify(mobileQuickSize));}catch{}
  },[mobileQuickSize]);
  // Never carry entry-exit drafts across markets or paper accounts.
  useEffect(()=>setMobileEntryExits({}),[
    activeAsset.symbol,activeAsset.exchange,activeAsset.source,activeAsset.marketType,
    paperAccounts.activeId,
  ]);
  const openMobileEntry=(focus?:'sl'|'tp')=>{
    setMobileQuickTicket(prev=>({focus,seq:(prev?.seq||0)+1}));
    setIsTradeTicketOpen(true);
  };
  const [tradeTicketAccountSettings,setTradeTicketAccountSettings]=useState<boolean|string>(false);
  const [isBottomTradingExpanded, setIsBottomTradingExpanded] = useState(false);

  // State: Order Book & Trades
  const [orderBook, setOrderBook] = useState<{ asks: OrderBookItem[]; bids: OrderBookItem[] }>({
    asks: [],
    bids: [],
  });
  const [recentTrades, setRecentTrades] = useState<TradeItem[]>([]);

  // State: Modals & Panels (Right sidebar active tab defaults to 'alerts' as in screenshot!)
  const [isSymbolSearchOpen, setIsSymbolSearchOpen] = useState(false);
  const [addingWatchlistSymbol,setAddingWatchlistSymbol]=useState(false);
  const [isIndicatorsOpen, setIsIndicatorsOpen] = useState(false);
  const [isAlertsOpen, setIsAlertsOpen] = useState(false);
  const [isTradeJournalOpen, setIsTradeJournalOpen] = useState(false);
  const [isSavedChartsOpen,setIsSavedChartsOpen]=useState(false);
  const [isPipActive, setIsPipActive] = useState(false);
  const pipRef = useRef<ChartPictureInPictureRef>(null);

  const [shortcutHelpOpen,setShortcutHelpOpen]=useState(false);
  const [requestedDockTab,setRequestedDockTab]=useState<{tab:string;seq:number}|undefined>();
  const [activeDockTab,setActiveDockTab]=useState('positions');
  const [networkOffline,setNetworkOffline]=useState(()=>typeof navigator!=='undefined'&&!navigator.onLine);
  useEffect(()=>{
    const update=()=>setNetworkOffline(!navigator.onLine);
    window.addEventListener('online',update);window.addEventListener('offline',update);
    return ()=>{window.removeEventListener('online',update);window.removeEventListener('offline',update);};
  },[]);
  const requestBottomPanel=(tab:string)=>{
    setIsBottomTradingOpen(true);
    setRequestedDockTab(prev=>({tab,seq:(prev?.seq||0)+1}));
  };
  const [isConditionalOrderModalOpen, setIsConditionalOrderModalOpen] = useState(false);
  const [selectedDependencyForOrder, setSelectedDependencyForOrder] = useState<DependencyContext | null>(null);
  const [orderToEdit, setOrderToEdit] = useState<ConditionalOrder | null>(null);

   const [isRightSidebarOpen, setIsRightSidebarOpen] = useState(false);
  const [rightSidebarTab, setRightSidebarTab] = useState<RightSidebarTab>(() => {
    const saved = localStorage.getItem('tv_right_sidebar_tab');
    return saved&&['alerts','watchlist','orderbook','technicals','news','calendar','notifications'].includes(saved) ? (saved as RightSidebarTab) : 'alerts';
  });
  const [isFullscreen, setIsFullscreen] = useState(false);
  useEffect(()=>{
    const onKey=(event:KeyboardEvent)=>{
      if(event.repeat)return;
      const target=event.target as HTMLElement|null;
      const editable=!!target?.closest('input,textarea,select,[contenteditable="true"],[role="textbox"]');
      if(event.key==='Escape'){
        if(editable&&!shortcutHelpOpen)return;
        setShortcutHelpOpen(false);
        setIsSymbolSearchOpen(false);setIsIndicatorsOpen(false);setIsAlertsOpen(false);
        setIsSavedChartsOpen(false);setIsConditionalOrderModalOpen(false);
        return;
      }
      if(editable||event.altKey)return;
      if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='k'){
        event.preventDefault();setAddingWatchlistSymbol(false);setIsSymbolSearchOpen(true);return;
      }
      if(event.ctrlKey||event.metaKey)return;
      if(event.key==='?'||(event.shiftKey&&(event.key==='/'||event.code==='Slash'))){
        event.preventDefault();setShortcutHelpOpen(true);return;
      }
      if(event.key==='/'&&!event.shiftKey){
        event.preventDefault();setAddingWatchlistSymbol(false);setIsSymbolSearchOpen(true);return;
      }
      if(!event.shiftKey)return;
      const key=event.key.toLowerCase();
      if(key==='j'){event.preventDefault();setIsTradeJournalOpen(true);}
      else if(key==='p'){event.preventDefault();setIsBottomTradingOpen(v=>!v);}
      else if(key==='r'){event.preventDefault();requestBottomPanel('replay');}
      else if(key==='s'){event.preventDefault();requestBottomPanel('screener');}
      else if(key==='d'){event.preventDefault();requestBottomPanel('dataHealth');}
    };
    window.addEventListener('keydown',onKey);
    // Readiness is set only after keyboard shortcuts have been subscribed.
    // Also helps UI automation avoid dispatching keystrokes before hydration.
    document.documentElement.dataset.plutradeShortcutsReady='true';
    return ()=>{
      window.removeEventListener('keydown',onKey);
      delete document.documentElement.dataset.plutradeShortcutsReady;
    };
  },[shortcutHelpOpen]);


  // State: Scales
  const [isLogScale, setIsLogScale] = useState<boolean>(() => {
    return readLocalJson<boolean>('tv_is_log_scale', false) === true;
  });
  const [isPercentScale, setIsPercentScale] = useState<boolean>(() => {
    return readLocalJson<boolean>('tv_is_percent_scale', false) === true;
  });

  // Chart Ref
  const chartRef = useRef<MainChartRef>(null);
  const lastSecondarySyncRef = useRef<number>(0);
  const lastPriceRenderRef = useRef<number>(0);
  const lastFlashTimeRef = useRef<number>(0);

  // Window Layout & Multi-Chart Workspace State
  // Default to single window ('1'), remember last used template
  const [currentTemplateId, setCurrentTemplateId] = useState<string>(() => {
    return localStorage.getItem('tv_last_used_template_id') || '1';
  });

  const [syncSettings, setSyncSettings] = useState<LayoutSyncSettings>(() => {
    const saved = localStorage.getItem('tv_layout_sync_settings');
    if (saved) {
      try {
        const parsed=JSON.parse(saved);
        if(parsed&&typeof parsed==='object'&&!Array.isArray(parsed))
          return {...DEFAULT_SYNC_SETTINGS,...Object.fromEntries(
            Object.entries(DEFAULT_SYNC_SETTINGS).map(([key,value])=>
              [key,typeof parsed[key]===typeof value?parsed[key]:value]))};
      } catch {}
    }
    return DEFAULT_SYNC_SETTINGS;
  });

  const [savedLayouts, setSavedLayouts] = useState<SavedChartLayout[]>(() => {
    const saved = localStorage.getItem('tv_saved_chart_layouts');
    if(saved){
      try{
        const parsed=JSON.parse(saved);
        if(Array.isArray(parsed)&&parsed.length>0&&parsed.every((layout:any)=>
          layout&&typeof layout.id==='string'&&typeof layout.name==='string'&&
          typeof layout.templateId==='string'&&Array.isArray(layout.windows)&&
          layout.windows.every((win:any)=>win&&typeof win.symbol==='string'&&
            Object.prototype.hasOwnProperty.call(TIMEFRAME_SECONDS,win.timeframe))&&
          layout.syncSettings&&typeof layout.syncSettings==='object'&&
          typeof layout.autosave==='boolean'))return parsed;
        preserveInvalidPreference('tv_saved_chart_layouts');
      }catch{preserveInvalidPreference('tv_saved_chart_layouts');}
    }
    return [
      {
        id: 'layout-default',
        name: 'Unnamed',
        lastModified: Date.now(),
        templateId: localStorage.getItem('tv_last_used_template_id') || '1',
        syncSettings: DEFAULT_SYNC_SETTINGS,
        autosave: true,
        shareEnabled: false,
        windows: [{id:'win-0',symbol:activeAsset.symbol,
          source:activeAsset.source||activeAsset.exchange,marketType:activeAsset.marketType,
          chainId:activeAsset.chainId,pairAddress:activeAsset.pairAddress,
          timeframe:activeTimeframe}],
        activeWindowIndex: 0,
      },
    ];
  });

  const [currentLayoutId, setCurrentLayoutId] = useState<string>(() => {
    return localStorage.getItem('tv_current_layout_id') || 'layout-default';
  });

  const [windowStates, setWindowStates] = useState<ChartWindowState[]>(() => {
    const saved = localStorage.getItem('tv_chart_window_states');
    if (saved) {
      try {
        const list=JSON.parse(saved);
        if(Array.isArray(list)&&list.length>0&&list.length<=16&&list.every(
          (v:any)=>v&&typeof v.id==='string'&&typeof v.symbol==='string'&&
          typeof v.timeframe==='string'&&Object.prototype.hasOwnProperty.call(TIMEFRAME_SECONDS,v.timeframe)))return list;
      } catch {}
      preserveInvalidPreference('tv_chart_window_states');
    }
    return [{ id:'win-0',symbol:activeAsset.symbol,source:activeAsset.source||activeAsset.exchange,
      marketType:activeAsset.marketType,chainId:activeAsset.chainId,pairAddress:activeAsset.pairAddress,
      timeframe:activeTimeframe }];
  });

  const [activeWindowIndex, setActiveWindowIndex] = useState<number>(0);
  const [splitSizes, setSplitSizes] = useState<number[]>(() => {
    const saved = localStorage.getItem('tv_chart_splits');
    if (saved) {
      try {
        const splits=JSON.parse(saved);
        if(Array.isArray(splits)&&splits.length<=8&&splits.length>0&&
          splits.every((v:unknown)=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=100))
          return splits;
      } catch {}
    }
    return [50, 50];
  });

  const [isLayoutDropdownOpen, setIsLayoutDropdownOpen] = useState(false);
  const [isLayoutManagerOpen, setIsLayoutManagerOpen] = useState(false);

  // Active Layout and Template Helpers
  const currentLayout =
    savedLayouts.find((l) => l.id === currentLayoutId) || savedLayouts[0];

  const currentTemplate = getLayoutTemplateById(currentTemplateId);

  const handleSelectTemplate = (template: LayoutTemplate) => {
    setCurrentTemplateId(template.id);
    localStorage.setItem('tv_last_used_template_id', template.id);

    if (currentLayout.autosave) {
      setSavedLayouts((prev) => {
        const updated = prev.map((l) =>
          l.id === currentLayout.id
            ? { ...l, templateId: template.id, lastModified: Date.now() }
            : l
        );
        localStorage.setItem('tv_saved_chart_layouts', JSON.stringify(updated));
        return updated;
      });
    }
  };

  const handleUpdateSyncSettings = (settings: LayoutSyncSettings) => {
    setSyncSettings(settings);
    localStorage.setItem('tv_layout_sync_settings', JSON.stringify(settings));

    if (currentLayout.autosave) {
      setSavedLayouts((prev) => {
        const updated = prev.map((l) =>
          l.id === currentLayout.id
            ? { ...l, syncSettings: settings, lastModified: Date.now() }
            : l
        );
        localStorage.setItem('tv_saved_chart_layouts', JSON.stringify(updated));
        return updated;
      });
    }
  };

  const handleSaveLayout = useCallback(() => {
    setSavedLayouts((prev) => {
      const updated = prev.map((l) =>
        l.id === currentLayout.id
          ? {
              ...l,
              templateId: currentTemplateId,
              syncSettings: syncSettings,
              splitSizes: splitSizes,
              windows: windowStates,
              activeWindowIndex: activeWindowIndex,
              lastModified: Date.now(),
            }
          : l
      );
      localStorage.setItem('tv_saved_chart_layouts', JSON.stringify(updated));
      return updated;
    });

    setActiveNotification({
      id: String(Date.now()),
      message: `Layout "${currentLayout.name}" saved.`,
      type: 'info',
    });
  }, [currentLayout.id, currentLayout.name, currentTemplateId, syncSettings, splitSizes, windowStates, activeWindowIndex]);

  const handleAutosaveToggle = (enabled: boolean) => {
    setSavedLayouts((prev) => {
      const updated = prev.map((l) =>
        l.id === currentLayout.id ? { ...l, autosave: enabled } : l
      );
      localStorage.setItem('tv_saved_chart_layouts', JSON.stringify(updated));
      return updated;
    });
  };

  const handleShareToggle = (enabled: boolean) => {
    setSavedLayouts((prev) => {
      const updated = prev.map((l) =>
        l.id === currentLayout.id ? { ...l, shareEnabled: enabled } : l
      );
      localStorage.setItem('tv_saved_chart_layouts', JSON.stringify(updated));
      return updated;
    });
  };

  const handleMakeCopy = (newName: string) => {
    const newId = `layout-${Date.now()}`;
    const copy: SavedChartLayout = {
      ...currentLayout,
      id: newId,
      name: newName,
      templateId: currentTemplateId,
      syncSettings: syncSettings,
      splitSizes: splitSizes,
      windows: windowStates,
      activeWindowIndex: activeWindowIndex,
      lastModified: Date.now(),
    };
    const updated = [...savedLayouts, copy];
    setSavedLayouts(updated);
    setCurrentLayoutId(newId);
    localStorage.setItem('tv_saved_chart_layouts', JSON.stringify(updated));
    localStorage.setItem('tv_current_layout_id', newId);
    setActiveNotification({
      id: String(Date.now()),
      message: `Created copy: "${newName}".`,
      type: 'info',
    });
  };

  const handleRename = (newName: string) => {
    setSavedLayouts((prev) => {
      const updated = prev.map((l) =>
        l.id === currentLayout.id ? { ...l, name: newName } : l
      );
      localStorage.setItem('tv_saved_chart_layouts', JSON.stringify(updated));
      return updated;
    });
    setActiveNotification({
      id: String(Date.now()),
      message: `Layout renamed to "${newName}".`,
      type: 'info',
    });
  };

  const handleUpdateWindowStates = useCallback((states: ChartWindowState[]) => {
    setWindowStates(states);
    localStorage.setItem('tv_chart_window_states', JSON.stringify(states));
  }, []);

  const handleUpdateSplitSizes = useCallback((splits: number[]) => {
    setSplitSizes(splits);
    localStorage.setItem('tv_chart_splits', JSON.stringify(splits));
  }, []);

  const handleSetChartType = useCallback((newType: ChartType) => {
    setChartType(newType);
    localStorage.setItem('tv_chart_type', newType);
    setWindowStates((prev) => {
      const next = prev.map((w, idx) =>
        idx === activeWindowIndex ? { ...w, chartType: newType } : w
      );
      localStorage.setItem('tv_chart_window_states', JSON.stringify(next));
      return next;
    });
  }, [activeWindowIndex]);

  useEffect(() => {
    const activeWin = windowStates[activeWindowIndex];
    if (activeWin?.chartType && activeWin.chartType !== chartType) {
      setChartType(activeWin.chartType);
    }
  }, [activeWindowIndex]);

  const handleDownloadData = () => {
    if (candles.length === 0) return;
    const headers = 'Time,Open,High,Low,Close,Volume\n';
    const rows = candles
      .map(
        (c) =>
          `${new Date(c.time * 1000).toISOString()},${c.open},${c.high},${c.low},${c.close},${c.volume || 0}`
      )
      .join('\n');
    const blob = new Blob([headers + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activeAsset.symbol}_${activeTimeframe}_chart_data.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleCreateNewLayout = () => {
    const newId = `layout-${Date.now()}`;
    const freshLayout: SavedChartLayout = {
      id: newId,
      name: 'Unnamed',
      lastModified: Date.now(),
      templateId: '1',
      syncSettings: DEFAULT_SYNC_SETTINGS,
      autosave: true,
      shareEnabled: false,
      windows: [{id:'win-0',symbol:activeAsset.symbol,
        source:activeAsset.source||activeAsset.exchange,marketType:activeAsset.marketType,
        chainId:activeAsset.chainId,pairAddress:activeAsset.pairAddress,timeframe:activeTimeframe}],
      activeWindowIndex: 0,
    };
    const updated = [...savedLayouts, freshLayout];
    setSavedLayouts(updated);
    setCurrentLayoutId(newId);
    setCurrentTemplateId('1');
    localStorage.setItem('tv_last_used_template_id', '1');
    localStorage.setItem('tv_saved_chart_layouts', JSON.stringify(updated));
    localStorage.setItem('tv_current_layout_id', newId);
    setActiveNotification({
      id: String(Date.now()),
      message: 'Created new chart layout.',
      type: 'info',
    });
  };

  const handleSelectLayout = (layout: SavedChartLayout) => {
    setCurrentLayoutId(layout.id);
    setCurrentTemplateId(layout.templateId || '1');
    localStorage.setItem('tv_last_used_template_id', layout.templateId || '1');
    localStorage.setItem('tv_current_layout_id', layout.id);
    if (layout.syncSettings) setSyncSettings(layout.syncSettings);
    if (layout.splitSizes) setSplitSizes(layout.splitSizes);
    if (layout.windows && layout.windows.length > 0) {
      setWindowStates(layout.windows);
    }
    setActiveNotification({
      id: String(Date.now()),
      message: `Loaded layout: "${layout.name}".`,
      type: 'info',
    });
  };

  const handleDeleteLayout = (id: string) => {
    if (savedLayouts.length <= 1) return;
    const remaining = savedLayouts.filter((l) => l.id !== id);
    setSavedLayouts(remaining);
    localStorage.setItem('tv_saved_chart_layouts', JSON.stringify(remaining));
    if (currentLayoutId === id) {
      handleSelectLayout(remaining[0]);
    }
  };

  // Save changes to LocalStorage
  // Do not serialize the entire catalog on every price tick. Custom markets
  // are separately persisted under plutrade_saved_markets_v1.

  useEffect(() => {
    try {
      persistWatchlists(watchlists);
    } catch (error) {
      console.warn('Unable to persist watchlist', error);
      setWatchlistStorageError(error instanceof Error?error.message:'Watchlists could not be saved');
    }
  }, [watchlists]);

  // Drawings are persisted under tv_drawings_by_market_v1 by exact market.

  useEffect(() => {
    localStorage.setItem('tv_indicators', JSON.stringify(indicators));
  }, [indicators]);

  useEffect(() => {
    localStorage.setItem('tv_detailed_alerts', JSON.stringify(detailedAlerts));
  }, [detailedAlerts]);

 
  useEffect(() => {
    localStorage.setItem('tv_active_symbol', activeAsset.symbol);
    localStorage.setItem('plutrade_active_source', activeAsset.source || activeAsset.exchange);
    localStorage.setItem('plutrade_active_market_type', activeAsset.marketType || '');
    localStorage.setItem('plutrade_active_chain_id',activeAsset.chainId||'');
    localStorage.setItem('plutrade_active_pair_address',activeAsset.pairAddress||'');
  }, [activeAsset.symbol, activeAsset.source, activeAsset.exchange, activeAsset.marketType,
    activeAsset.chainId,activeAsset.pairAddress]);

  useEffect(() => {
    localStorage.setItem('tv_timeframe', activeTimeframe);
  }, [activeTimeframe]);

  useEffect(() => {
    localStorage.setItem('tv_chart_type', chartType);
  }, [chartType]);

  useEffect(() => {
    localStorage.setItem('tv_active_watchlist_id', activeWatchlistId);
  }, [activeWatchlistId]);

  useEffect(() => {
    localStorage.setItem('tv_right_sidebar_open', JSON.stringify(isRightSidebarOpen));
  }, [isRightSidebarOpen]);

  useEffect(() => {
    localStorage.setItem('tv_right_sidebar_tab', rightSidebarTab);
  }, [rightSidebarTab]);

  useEffect(() => {
    localStorage.setItem('tv_bottom_trading_open', JSON.stringify(isBottomTradingOpen));
  }, [isBottomTradingOpen]);

  useEffect(() => {
    localStorage.setItem('tv_bottom_trading_expanded', JSON.stringify(isBottomTradingExpanded));
  }, [isBottomTradingExpanded]);

  useEffect(() => {
    localStorage.setItem('tv_magnet_mode', JSON.stringify(isMagnetMode));
  }, [isMagnetMode]);

  useEffect(() => {
    localStorage.setItem('tv_drawings_hidden', JSON.stringify(areDrawingsHidden));
  }, [areDrawingsHidden]);

  useEffect(() => {
    localStorage.setItem('tv_drawing_color', currentColor);
  }, [currentColor]);

  useEffect(() => {
    localStorage.setItem('tv_is_log_scale', JSON.stringify(isLogScale));
  }, [isLogScale]);

  useEffect(() => {
    localStorage.setItem('tv_is_percent_scale', JSON.stringify(isPercentScale));
  }, [isPercentScale]);

  // Initial background quote refresh for major watchlist assets
  useEffect(() => {
    const majorSymbols = ['BTCUSD', 'BTCUSDT', 'ETHUSD', 'SOLUSD', 'AAPL', 'TSLA', 'NVDA', 'EURUSD', 'XAUUSD'];
    const candidates = assets.filter((a) => majorSymbols.includes(a.symbol));
    candidates.forEach((asset) => {
      fetchRealTicker24h(asset).then((ticker) => {
        if (ticker) {
          setAssets((prev) =>
            prev.map((a) => (assetIdentity(a) === assetIdentity(asset) ? { ...a, ...ticker } : a))
          );
        }
      });
    });
  }, []);

  // Load Historical Candlesticks and connect Real Market Feed when activeAsset or timeframe changes
  useEffect(() => {
    let isCancelled = false;
    setIsLoadingCandles(true);
    setChartHistoryState('loading');
    // Clear the former instrument immediately; do not display its candles
    // under the next symbol while awaiting the exact-venue history response.
    setCandles([]);

    fetchHistoricalData(activeAsset, activeTimeframe).then((data) => {
      if (!isCancelled) {
        setCandles(live => combineHistoryWithLive(data,live));
        setChartHistoryState(data.length>0?'ready':'empty');
        setIsLoadingCandles(false);
      }
    }).catch(() => {
      if (!isCancelled){setChartHistoryState('error');setIsLoadingCandles(false);}
    });

    // 2. Fetch Real 24h Ticker data (high, low, volume, 24h price change)
    fetchRealTicker24h(activeAsset).then((ticker) => {
      if (!isCancelled && ticker) {
        setActiveAsset(prev=>{
          const keepLive=!!prev.quoteUpdatedAt&&Date.now()-prev.quoteUpdatedAt<30000&&(prev.quoteOrigin==='ticker'||prev.quoteStatus==='live')&&ticker.quoteStatus!=='live';
          return {...prev,...ticker,...(keepLive?{price:prev.price,quoteStatus:prev.quoteStatus,
            quoteUpdatedAt:prev.quoteUpdatedAt,quoteOrigin:prev.quoteOrigin}:{})};
        });
        setAssets((prev) =>
          prev.map((a) => {
            if(assetIdentity(a)!==assetIdentity(activeAsset))return a;
            const keepLive=!!a.quoteUpdatedAt&&Date.now()-a.quoteUpdatedAt<30000&&(a.quoteOrigin==='ticker'||a.quoteStatus==='live')&&ticker.quoteStatus!=='live';
            return {...a,...ticker,...(keepLive?{price:a.price,quoteStatus:a.quoteStatus,
              quoteUpdatedAt:a.quoteUpdatedAt,quoteOrigin:a.quoteOrigin}:{})};
          })
        );
      }
    });

    // Order depth and tape require real subscribed feeds; do not seed fabricated data.
    setOrderBook({ bids: [], asks: [] });
    setRecentTrades([]);
    // A new stream must establish its own first observed price before a
    // crossing can be computed; a stale prior subscription must not trigger.
    delete previousAlertPricesRef.current[alertMarketIdentity(activeAsset)];
    delete previousAlertPricesRef.current[alertMarketIdentity(activeAsset)+'|tick'];
    delete previousAlertPricesRef.current[alertMarketIdentity(activeAsset)+'|close|'+activeTimeframe];

    // 4. Subscribe to Real Market Data (Binance WebSocket for crypto, high-precision feed for others)
    const unsubscribe = subscribeRealMarketData(activeAsset, activeTimeframe, {
      onMarketEvent:recordFeedEvent,
      onPriceUpdate: (newPrice, change24h, changePercent24h, origin='snapshot') => {
        if (isCancelled) return;

        const now = Date.now();
        // Only verified venue ticks may trigger the price-alert evaluator.
        const alertEvents=origin==='stream'||origin==='ticker'||activeAsset.pairAddress?
          processPriceAlertTick(activeAsset,newPrice,now):[];
        const renderNow=origin!=='stream'||now-lastPriceRenderRef.current>=120;
        if(renderNow)lastPriceRenderRef.current=now;
        if(renderNow)setActiveAsset((prev) => {
          if(origin!=='stream'&&isFreshPaperQuote(prev,now))return prev;
          const priceDelta = newPrice - prev.price;
          if (priceDelta !== 0 && now - lastFlashTimeRef.current > 350) {
            lastFlashTimeRef.current = now;
            const flashDirection = priceDelta > 0 ? 'up' : 'down';
            setPriceFlashMap((pfm) => ({ ...pfm, [prev.symbol]: flashDirection }));
            setTimeout(() => {
              setPriceFlashMap((pfm) => {
                const next = { ...pfm };
                delete next[prev.symbol];
                return next;
              });
            }, 350);
          }

          const updatedChange = change24h !== undefined ? change24h : Number((prev.change24h + priceDelta).toFixed(prev.digits));
          const updatedChangePct = changePercent24h !== undefined ? changePercent24h : Number((((newPrice) / (prev.price - prev.change24h) - 1) * 100).toFixed(2));

          return {
            ...prev,
            price: newPrice,
            change24h: updatedChange,
            changePercent24h: updatedChangePct,
            high24h: Math.max(prev.high24h, newPrice),
            low24h: prev.low24h > 0 ? Math.min(prev.low24h, newPrice) : newPrice,
            quoteStatus: origin==='stream'&&!activeAsset.pairAddress ? 'live' : 'delayed',
            quoteUpdatedAt: now,
            streamConnected:origin==='stream',
            quoteOrigin:origin,
          };
        });

        if(origin==='stream'){
          const quote:Asset={...activeAsset,price:newPrice,quoteStatus:'live',quoteUpdatedAt:now,streamConnected:true};
          executeObservedTick(quote,now,alertEvents);
        }
        // Throttle secondary UI updates to 150ms to keep render cycles smooth and light
        if (now - lastSecondarySyncRef.current > 150) {
          lastSecondarySyncRef.current = now;

          // Update in assets array
          setAssets((prev) =>
            prev.map((a) =>
              assetIdentity(a) === assetIdentity(activeAsset)&&!(origin!=='stream'&&isFreshPaperQuote(a,now))
                ? {
                    ...a,
                    price: newPrice,
                    high24h: Math.max(a.high24h, newPrice),
                    low24h: a.low24h > 0 ? Math.min(a.low24h, newPrice) : newPrice,
                    quoteStatus: origin==='stream'&&!activeAsset.pairAddress ? 'live' : 'delayed',
                    quoteUpdatedAt: now,
                    streamConnected:origin==='stream',
            quoteOrigin:origin,
                  }
                : a
            )
          );

          // Market risk processing runs on every WS event outside UI throttle.
        }
      },

      onCandleTick: (candle, isClosed) => {
        if (isCancelled) return;
        setCandles(previous=>mergeLiveCandle(previous,candle));
        if(isClosed&&Number.isFinite(candle.close)&&candle.close>0)
          processPriceAlertTick(activeAsset,candle.close,Date.now(),
            {kind:'closed-bar',barTime:candle.time,timeframe:activeTimeframe});
      },

      onOrderBook: (book) => {
        if (isCancelled) return;
        setOrderBook(book);
      },

      onTrade: (trade) => {
        if (isCancelled) return;
        setRecentTrades((prev) => [trade, ...prev.slice(0, 24)]);
      },

      onStatusChange: (status) => {
        if (isCancelled) return;
        setMarketStatus(status);
        // A REST endpoint can be reachable while the real trade stream is
        // disconnected. Never allow the previous live tick to authorize an order.
        const realStream=status.connected&&(status.provider.includes('live WebSocket')||status.provider.includes('ticker-only WebSocket'));
        if(!realStream){
          setActiveAsset(prev=>({...prev,streamConnected:false,
            quoteStatus:prev.quoteStatus==='live'?'delayed':prev.quoteStatus,quoteOrigin:prev.quoteOrigin?'snapshot':undefined}));
          setAssets(prev=>prev.map(asset=>assetIdentity(asset)===assetIdentity(activeAsset)?
            {...asset,streamConnected:false,quoteStatus:asset.quoteStatus==='live'?'delayed':asset.quoteStatus,quoteOrigin:asset.quoteOrigin?'snapshot':undefined}:asset));
        }
      },
    });

    return () => {
      isCancelled = true;
      unsubscribe();
    };
  }, [activeAsset.symbol, activeAsset.source, activeAsset.exchange, activeAsset.marketType, activeTimeframe, chartRetry,processPriceAlertTick,executeObservedTick,recordFeedEvent]);

  // All new paper trades must pass through the validated right-side order ticket.
  const handleSubmitTicketOrder = (request:PaperOrderRequest):string|null => {
    try {
      const verdict=evaluateRiskPolicy(paperPortfolio,activeAsset,request,riskPolicy);
      if(!verdict.allowed)throw new Error(verdict.reason||'Risk policy rejected this paper entry.');
      const next=submitPaperOrder(paperPortfolio,activeAsset,request);
      // Revalidate against current state at application time; never replace
      // an intervening tick fill with a portfolio computed from a stale render.
      setPaperPortfolio(prev=>{
        if(prev===paperPortfolio)return next;
        const refreshed=evaluateRiskPolicy(prev,activeAsset,request,riskPolicy);
        return refreshed.allowed?submitPaperOrder(prev,activeAsset,request):prev;
      });
      setPaperError('');
      if(request.kind!=='market')setIsBottomTradingOpen(true);
      return null;
    }catch(e){
      const message=e instanceof Error?e.message:'Unable to submit paper order';
      setPaperError(message);return message;
    }
  };
  const executeClosePosition = (id:string,quantity?:number) => {
    const p=paperPositions.find(x=>x.id===id);
    if(!p)return;
    if(!matchesExactMarket(p,activeAsset)||!isFreshPaperQuote(activeAsset)||
      !p.lastMarkedAt||Date.now()<p.lastMarkedAt||Date.now()-p.lastMarkedAt>15000){
      setPaperError('Select the exact position market and establish a currently connected verified trade stream to close.');
      return;
    }
    try {
      setPaperPortfolio(closePaperPosition(paperPortfolio,id,p.currentPrice,quantity));
      setCloseReviewId(null);
      setPaperError('');
      setActiveNotification({id:String(Date.now()),message:`Simulated close: ${quantity??p.qty} ${p.symbol} at ${p.currentPrice}`,type:'info'});
    } catch(e){setPaperError(e instanceof Error?e.message:'Close rejected');}
  };
  const handleClosePosition = (id:string) => {
    const p=paperPositions.find(x=>x.id===id);
    if(!p)return;
    // TradingView's default is review-before-close. One-click is user opt-in.
    let oneClick=false;
    try {oneClick=localStorage.getItem('plutrade_paper_one_click_v1')==='true';}catch{}
    if(oneClick){executeClosePosition(id);return;}
    setCloseReviewQty(String(p.qty));
    setCloseReviewId(id);
  };
  const handleEditPaperStops = (id:string,tp?:number,sl?:number,trailing?:number|null,
    dynamic?:DynamicTrailingSettings|null) => {
    try {
      const position=paperPositions.find(item=>item.id===id);
      if(!position)throw new Error('Position unavailable.');
      if(tp!==undefined&&(!Number.isFinite(tp)||tp<=0||(position.side==='Long'?tp<=position.entryPrice:tp>=position.entryPrice)))
        throw new Error('Take-profit target must be on the profitable side of the entry.');
      // A ratcheted stop may legitimately lock in profit past entry. Changed
      // levels must instead remain untriggered relative to the observed mark.
      if(sl!==undefined&&(!Number.isFinite(sl)||sl<=0||
        (sl!==position.sl&&(position.side==='Long'?sl>=position.currentPrice:sl<=position.currentPrice))))
        throw new Error('Stop-loss target must be beyond the currently observed price.');
      let next=updatePaperStops(paperPortfolio,id,tp,sl);
      if(trailing===null)next=disableTrailingPaperStop(next,id);
      else if(trailing!==undefined)next=enableTrailingPaperStop(next,id,trailing);
      if(dynamic===null)next=disableDynamicTrailing(next,id);
      else if(dynamic!==undefined)next=attachDynamicTrailing(next,id,dynamic);
      setPaperPortfolio(next);
      setPaperError('');
    }catch(e){setPaperError(e instanceof Error?e.message:'Invalid stops');}
  };
  const handleEditPaperTargets=(id:string,targets:Array<{price:number;sharePercent:number}>)=>{
    try{
      const next=updatePaperTargetLevels(paperPortfolio,id,targets);
      setPaperPortfolio(next);
      setPaperError('');
    }catch(e){setPaperError(e instanceof Error?e.message:'Invalid take-profit levels');}
  };
  const handleChartEditPositionStop=(id:string,kind:'sl'|'tp')=>{
    if(typeof window!=='undefined'&&window.matchMedia('(max-width: 767px)').matches)
      setMobileExitRequest(prev=>({id,kind,seq:(prev?.seq||0)+1}));
    else requestBottomPanel('positions');
  };
  const handleCancelPendingOrder=(id:string)=>{setPaperPortfolio(p=>cancelPaperOrder(p,id));setPaperError('');};
  const handleAmendPendingOrder=(id:string,request:PaperAmendRequest):string|null=>{
    try{
      // Validate against current account/quote first, then revalidate within
      // the state update in case another fill consumed available margin.
      amendPendingPaperOrder(paperPortfolio,activeAsset,id,request);
      setPaperPortfolio(previous=>amendPendingPaperOrder(previous,activeAsset,id,request));
      setPaperError('');
      return null;
    }catch(error){
      const message=error instanceof Error?error.message:'Order amendment rejected';
      setPaperError(message);return message;
    }
  };
  const handleResetPaper = () => {
    setPaperPortfolio(emptyPaperPortfolio(paperPortfolio.settings,paperPortfolio.account.name));
    setConditionalOrders([]);
    setPaperError('');
  };

  // Conditional Orders Handlers
  const handleOpenCreateConditionalOrder = useCallback((dep?: DependencyContext | null) => {
    setSelectedDependencyForOrder(dep || null);
    setOrderToEdit(null);
    setIsConditionalOrderModalOpen(true);
  }, []);

  const handleEditConditionalOrder = useCallback((order: ConditionalOrder) => {
    setOrderToEdit(order);
    setSelectedDependencyForOrder(null);
    setIsConditionalOrderModalOpen(true);
  }, []);

  const handleSaveConditionalOrder=useCallback((order:ConditionalOrder)=>{
    if(paperTradingBlocked){
      setPaperError('Unlock the single writer paper ledger before saving conditional rules.');
      return;
    }
    try{
      // Verify the target synchronously so the user cannot select a deleted
      // account and receive an inaccurate success notification.
      routeConditionalRuleToPaperAccounts(paperAccounts,order);
      setPaperAccounts(state=>routeConditionalRuleToPaperAccounts(state,order));
      setPaperError('');
      setActiveNotification({id:String(Date.now()),type:'info',
        message:`Rule "${order.title}" assigned to ${order.accountScope==='all_paper'?
          'all paper accounts':'the selected paper account'}. Each account evaluates independently while this browser remains open.`});
    }catch(error){
      setPaperError(error instanceof Error?error.message:'Unable to assign conditional rule.');
    }
  },[paperTradingBlocked,paperAccounts]);

  const handleToggleConditionalOrderStatus = useCallback((id: string) => {
    setConditionalOrders((prev) =>
      prev.map((o) => {
        if (o.id !== id) return o;
        const newStatus = o.status === 'active' ? 'paused' : 'active';
        return { ...o, status: newStatus==='active'&&!ruleCanActivate(o)?'paused':newStatus };
      })
    );
  }, []);

  const handleDeleteConditionalOrder = useCallback((id: string) => {
    setConditionalOrders((prev) => prev.filter((o) => o.id !== id));
  }, []);

  // Pure execution permits multiple triggered rules to apply sequentially to
  // one current portfolio without replacing earlier fills in the same tick.
  const handleTestTriggerConditionalOrder = useCallback((order:ConditionalOrder)=>{
    // Forced dry-run of THEN action only, not a live trigger nor persisted fills.
    const targets=paperAccounts.accounts.filter(a=>
      order.accountScope==='all_paper'||a.id===(order.accountId||paperAccounts.activeId));
    try{
      let fills=0;
      let details:string[]=[];
      for(const target of targets){
        const simulated=applyRuleToPortfolio({...order,accountId:target.id},target.portfolio,activeAsset);
        const count=simulated.fills.length-target.portfolio.fills.length;
        fills+=count;
        details.push(`${target.portfolio.account.name}: ${count} hypothetical fill(s)`);
      }
      setActiveNotification({id:String(Date.now()),type:'info',
        message:`Dry run only · ${fills} hypothetical fills. ${details.join('; ')}. No ledger changes.`});
      setPaperError('');
    }catch(e){setPaperError(e instanceof Error?e.message:'Simulation unavailable');}
  },[applyRuleToPortfolio,paperAccounts,activeAsset]);

  // Toggle Alert Status
  const handleToggleAlertStatus = (id: string) => {
    setAlerts(prev => prev.map(a => a.id !== id ? a : a.triggered
      ? {...a, triggered:false, paused:false}
      : {...a, paused:!a.paused}));
    setDetailedAlerts((prev) =>
      prev.map((a) =>
        a.id === id ? { ...a, status: a.status === 'Active' ? 'Paused' : 'Active' } : a
      )
    );
  };

  // Delete Alert
  const handleDeleteDetailedAlert = (id: string) => {
    setAlerts(prev => prev.filter(a => a.id !== id));
    setDetailedAlerts((prev) => prev.filter((a) => a.id !== id));
  };

  // Clear drawings
  const handleClearDrawings=()=>{if(drawings.length)setDrawings([]);};
  const handleUndoDrawing=()=>{
    const key=marketIdentity(activeAsset),history=drawingHistoryRef.current[key];
    if(!history?.past.length)return;
    history.future.push(structuredClone(drawings));
    replayingDrawingKeysRef.current.add(key);
    setDrawings(history.past.pop()!);
  };
  const handleRedoDrawing=()=>{
    const key=marketIdentity(activeAsset),history=drawingHistoryRef.current[key];
    if(!history?.future.length)return;
    history.past.push(structuredClone(drawings));
    replayingDrawingKeysRef.current.add(key);
    setDrawings(history.future.pop()!);
  };

  // Asset Selection
  const handleSelectAsset = (selected: Asset) => {
    setAssets(prev => prev.some(a => assetIdentity(a) === assetIdentity(selected)) ? prev : [...prev, selected]);
    try {
      const custom = JSON.parse(localStorage.getItem('plutrade_saved_markets_v1') || '[]') as Asset[];
      if (!custom.some(a => assetIdentity(a) === assetIdentity(selected))) {
        localStorage.setItem('plutrade_saved_markets_v1', JSON.stringify([...custom, selected].slice(-100)));
      }
    } catch { /* persistence is optional */ }
    setMarketStatus({ connected: false, provider: 'Connecting to ' + (selected.source || selected.exchange), latencyMs: 0 });
    setActiveAsset(selected);
    setWindowStates(prev=>prev.map((v,i)=>i===activeWindowIndex?
      {...v,symbol:selected.symbol,source:selected.source||selected.exchange,marketType:selected.marketType,
        chainId:selected.chainId,pairAddress:selected.pairAddress}:v));
  };

  // Toggle Fullscreen
  const handleToggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  const handleRestoreSavedChart=(idea:SavedChartIdea)=>{
    const candidates=assets.filter(a=>a.symbol===idea.symbol&&(a.source||a.exchange)===idea.source&&
      (!idea.marketType||a.marketType===idea.marketType)&&
      (!idea.chainId||a.chainId?.toLowerCase()===idea.chainId.toLowerCase())&&
      (!idea.pairAddress||a.pairAddress?.toLowerCase()===idea.pairAddress.toLowerCase()));
    const match=candidates.length===1?candidates[0]:undefined;
    if(!match){
      setActiveNotification({id:String(Date.now()),
        message:'Saved chart market is no longer in the current instrument directory.',
        type:'info'});
      return;
    }
    setActiveAsset(match);
    setActiveTimeframe(idea.timeframe);
    handleSetChartType(idea.chartType);
    setDrawingsForMarket(match,structuredClone(idea.drawings));
    setWindowStates(prev=>prev.map((win,i)=>i===activeWindowIndex?
      {...win,symbol:match.symbol,source:match.source||match.exchange,
        marketType:match.marketType,chainId:match.chainId,pairAddress:match.pairAddress,
        timeframe:idea.timeframe}:win));
    setIndicators(structuredClone(idea.indicators));
    setActiveNotification({id:String(Date.now()),message:'Chart restored from local saved charts.',type:'info'});
  };
  const activePosition =
    paperPositions.find(p => matchesExactMarket(p,activeAsset)) || null;
  const closeReviewPosition=paperPositions.find(p=>p.id===closeReviewId);
  const closeQuantity=Number(closeReviewQty);
  const closeValid=!!closeReviewPosition && Number.isFinite(closeQuantity) &&
    closeQuantity>0 && closeQuantity<=closeReviewPosition.qty &&
    !!closeReviewPosition.lastMarkedAt && Date.now()>=closeReviewPosition.lastMarkedAt &&
    Date.now()-closeReviewPosition.lastMarkedAt<30000;
  const closePreviewFee=closeReviewPosition&&Number.isFinite(closeQuantity)&&closeQuantity>0?
    paperCommission(paperPortfolio.settings,{
      category:closeReviewPosition.category||'crypto',
      marketType:closeReviewPosition.marketType||'spot',
    },closeQuantity,paperExecutionPrice(paperPortfolio.settings,closeReviewPosition.currentPrice,
      closeReviewPosition.side,'exit')):0;
  const closePreviewPnl=closeReviewPosition&&Number.isFinite(closeQuantity)?
    (closeReviewPosition.side==='Long'?1:-1)*
    (paperExecutionPrice(paperPortfolio.settings,closeReviewPosition.currentPrice,closeReviewPosition.side,'exit')-
      closeReviewPosition.entryPrice)*closeQuantity-closePreviewFee:0;

  return (
    <div
      id="tradingview-app-root"
      className="flex flex-col h-[100dvh] w-full max-w-full min-h-0 overflow-hidden bg-[#131722] text-[#d1d4dc] font-sans antialiased"
    >
      <WebBuildBanner />
      {/* Keep the trading workspace full-size. Data/quote availability is shown at the
          actual quote and order-entry controls; do not fill the header with demo copy. */}
      {/* Top Navbar */}
      <TopNavbar
        activeAsset={activeAsset}
        activeTimeframe={activeTimeframe}
        chartType={chartType}
        setChartType={handleSetChartType}
        onOpenSymbolSearch={() => {setAddingWatchlistSymbol(false);setIsSymbolSearchOpen(true);}}
        onOpenIndicators={() => setIsIndicatorsOpen(true)}
        onOpenAlerts={() => setIsAlertsOpen(true)}
        indicators={indicators}
        onTakeSnapshot={() => chartRef.current?.takeSnapshot()}
        onTogglePip={() => pipRef.current?.togglePip()}
        isPipActive={isPipActive}
        onUndoDrawing={handleUndoDrawing}
        onRedoDrawing={handleRedoDrawing}
        canUndo={!!drawingHistoryRef.current[marketIdentity(activeAsset)]?.past.length}
        canRedo={!!drawingHistoryRef.current[marketIdentity(activeAsset)]?.future.length}
        isFullscreen={isFullscreen}
        onToggleFullscreen={handleToggleFullscreen}
        onSelectQuickTool={(tool) => setActiveTool(tool)}
        activeTool={activeTool}
        onToggleTradingPanel={() => setIsTradeTicketOpen(prev=>!prev)}
        onTogglePaperWorkspace={()=>setIsBottomTradingOpen(v=>!v)}
        onOpenSavedCharts={()=>setIsSavedChartsOpen(true)}
        onOpenReplay={()=>requestBottomPanel('replay')}
        onOpenStrategyLab={()=>requestBottomPanel('strategyLab')}
        sessionVwapEnabled={sessionVwapEnabled}
        onToggleSessionVwap={()=>setSessionVwapEnabled(v=>!v)}
        marketStatus={marketStatus}
        currentTemplateId={currentTemplateId}
        onSelectTemplate={handleSelectTemplate}
        syncSettings={syncSettings}
        onUpdateSyncSettings={handleUpdateSyncSettings}
        currentLayout={currentLayout}
        savedLayouts={savedLayouts}
        onSaveLayout={handleSaveLayout}
        onAutosaveToggle={handleAutosaveToggle}
        onShareToggle={handleShareToggle}
        onMakeCopy={handleMakeCopy}
        onRename={handleRename}
        onDownloadData={handleDownloadData}
        onCreateNewLayout={handleCreateNewLayout}
        onSelectLayout={handleSelectLayout}
        onDeleteLayout={handleDeleteLayout}
        isLayoutDropdownOpen={isLayoutDropdownOpen}
        setIsLayoutDropdownOpen={setIsLayoutDropdownOpen}
        isLayoutManagerOpen={isLayoutManagerOpen}
        setIsLayoutManagerOpen={setIsLayoutManagerOpen}
      />

      {/* Main Workspace (Left Drawing Bar + Main Chart Area + Right Sidebar) */}
      <div className="flex-1 flex min-h-0 overflow-hidden relative">
        {/* Left Drawing Toolbar */}
        <LeftDrawingToolbar
          activeTool={activeTool}
          setActiveTool={setActiveTool}
          isMagnetMode={isMagnetMode}
          setIsMagnetMode={setIsMagnetMode}
          areDrawingsHidden={areDrawingsHidden}
          setAreDrawingsHidden={setAreDrawingsHidden}
          onClearDrawings={handleClearDrawings}
          currentColor={currentColor}
          setCurrentColor={setCurrentColor}
          isLocked={areDrawingsLocked}
          setIsLocked={setAreDrawingsLocked}
          stayInDrawingMode={stayInDrawingMode}
          setStayInDrawingMode={setStayInDrawingMode}
          onZoomIn={()=>{
            const scale=chartRef.current?.getChart()?.timeScale();
            const range=scale?.getVisibleLogicalRange();
            if(!range){scale?.fitContent();return;}
            const center=(Number(range.from)+Number(range.to))/2;
            const radius=Math.max(2,(Number(range.to)-Number(range.from))*.35);
            scale?.setVisibleLogicalRange({from:center-radius as any,to:center+radius as any});
          }}
        />

        {/* Center: Multi-Chart Resizable Workspace + Bottom Trading Panel + Bottom Bar */}
        <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden relative">
          {/* Chart-attached interval row and calendar; native axes remain inside the plot. */}
          <BottomToolbar
            chart={chartRef.current?.getChart() || null}
            activeAsset={activeAsset}
            activeTimeframe={activeTimeframe}
            onStandardTimeframe={selectStandardChartTimeframe}
            customInterval={customChartInterval}
            onCustomTimeframe={selectCustomChartTimeframe}
            onFitContent={() => chartRef.current?.fitContent()}
            onGoToDate={date=>chartRef.current?.goToUtcDate(date)??false}
            showMobileChartLegend={showMobileChartLegend}
            onShowMobileChartLegend={setShowMobileChartLegend}
            showCurrentPriceLabel={showCurrentPriceLabel} onShowCurrentPriceLabel={setShowCurrentPriceLabel}
            onApplyTimeScaleSettings={({barSpacing,rightOffset})=>{
              const chart=chartRef.current?.getChart();
              if(!chart)return false;
              try{chart.timeScale().applyOptions({barSpacing,rightOffset});return true;}
              catch{return false;}
            }}
          />
          <div className="flex-1 min-h-0 w-full relative isolate" id="chart-workspace-viewport">
          <MultiChartWorkspace
            ref={chartRef}
            template={currentTemplate}
            syncSettings={syncSettings}
            activeAsset={activeAsset}
            setActiveAsset={setActiveAsset}
            activeTimeframe={activeTimeframe}
            setActiveTimeframe={setActiveTimeframe}
            chartType={chartType}
            primaryCandles={chartCandles}
            primaryHistoryState={chartHistoryState}
            onReloadPrimary={()=>setChartRetry(n=>n+1)}
            sessionVwapEnabled={sessionVwapEnabled}
            showMobileChartLegend={showMobileChartLegend}
            showCurrentPriceLabel={showCurrentPriceLabel}
            areDrawingsLocked={areDrawingsLocked}
            stayInDrawingMode={stayInDrawingMode}
            onOpenSymbolSearch={()=>{setAddingWatchlistSymbol(false);setIsSymbolSearchOpen(true);}}
            onOpenIndicators={()=>setIsIndicatorsOpen(true)}
            indicators={indicators}
            activeTool={activeTool}
            setActiveTool={setActiveTool}
            drawings={drawings}
            setDrawings={setDrawings}
            drawingsByMarket={drawingsByMarket}
            onSetMarketDrawings={setDrawingsForMarket}
            isMagnetMode={isMagnetMode}
            areDrawingsHidden={areDrawingsHidden}
            currentColor={currentColor}
            isLogScale={isLogScale}
            isPercentScale={isPercentScale}
            openPosition={activePosition}
            openPositions={paperPositions}
            onClosePosition={handleClosePosition}
            onEditPositionStop={handleChartEditPositionStop}
            allAssets={assets}
            windowStates={windowStates}
            onUpdateWindowStates={handleUpdateWindowStates}
            activeWindowIndex={activeWindowIndex}
            setActiveWindowIndex={setActiveWindowIndex}
            splitSizes={splitSizes}
            onUpdateSplitSizes={handleUpdateSplitSizes}
            onOpenConditionalOrder={handleOpenCreateConditionalOrder}
          />
          </div>

          {/* Bottom Trading Dock (Paper Trading Panel) */}
          <BottomTradingPanel
            onOpenTicket={()=>setIsTradeTicketOpen(true)}
            account={paperAccount}
            positions={paperPositions}
            paperAccounts={paperAccounts.accounts}
            activePaperAccountId={paperAccounts.activeId}
            onSelectPaperAccount={selectPaperAccount}
            onSavePaperAccount={savePaperAccount}
            onDeletePaperAccount={deletePaperAccount}
            paperSettings={paperPortfolio.settings}
            portfolio={paperPortfolio}
            allMarkets={assets}
            onSelectScreenedMarket={handleSelectAsset}
            onAddScreenedMarket={asset=>setWatchlists(prev=>prev.map(list=>list.id===activeWatchlistId?
              {...list,symbols:[...new Set([...list.symbols,marketIdentity(asset)])]}:list))}
            feedHealth={feedHealth}
            marketStatus={marketStatus}
            riskPolicy={riskPolicy}
            onRiskPolicyChange={setRiskPolicy}
            onClosePosition={handleClosePosition}
            pendingOrders={paperPortfolio.pendingOrders||[]}
            orderEvents={paperPortfolio.orderEvents||[]}
            onCancelPendingOrder={handleCancelPendingOrder}
            onAmendPendingOrder={handleAmendPendingOrder}
            activeAsset={activeAsset}
            activeTimeframe={activeTimeframe}
            onEditPosition={handleEditPaperStops}
            onResolvePaperRecovery={resolvePaperRecovery}
          onResetPaper={handleResetPaper}
            paperError={paperError}
            paperTradingBlocked={paperTradingBlocked}
            requestedTab={requestedDockTab}
            onActiveTabChange={setActiveDockTab}
            fills={paperFills}
            conditionalOrders={conditionalOrders}
            onOpenCreateConditionalOrder={handleOpenCreateConditionalOrder}
            onEditConditionalOrder={handleEditConditionalOrder}
            onToggleConditionalOrderStatus={handleToggleConditionalOrderStatus}
            onDeleteConditionalOrder={handleDeleteConditionalOrder}
            onTestTriggerConditionalOrder={handleTestTriggerConditionalOrder}
            isOpen={isBottomTradingOpen}
            setIsOpen={setIsBottomTradingOpen}
            isExpanded={isBottomTradingExpanded}
            setIsExpanded={setIsBottomTradingExpanded}
          />


          <MobileTradingControls
            asset={activeAsset} position={activePosition}
            accountEquity={paperAccount.equity} availableEquity={withOrderReservations(paperPortfolio).account.availableFunds}
            accountBalance={paperAccount.balance}
            accountUnrealizedPnl={paperAccount.unrealizedPnL}
            accountCurrency={paperPortfolio.settings.currency}
            activeAccountName={activePaperRecord?.portfolio.account.name??null}
            activeAccountId={paperAccounts.activeId}
            availableAccounts={paperAccounts.accounts.map(record=>({
              id:record.id,name:record.portfolio.account.name,currency:record.portfolio.settings.currency
            }))}
            onSelectAccount={selectPaperAccount}
            onManageAccounts={()=>requestBottomPanel('positions')}
            onEditAccount={id=>{setTradeTicketAccountSettings(id);}}
            quickSize={mobileQuickSize} onQuickSize={setMobileQuickSize}
            preparedExits={mobileEntryExits}
            onPrepareExit={(kind,draft)=>setMobileEntryExits(prev=>({...prev,[kind]:draft}))}
            onClearPreparedExit={kind=>setMobileEntryExits(prev=>{
              const next={...prev};delete next[kind];return next;
            })}
            onEnter={openMobileEntry}
            onOpenOrder={()=>openMobileEntry()}
            onOpenPaperWorkspace={()=>setIsBottomTradingOpen(open=>!open)}
            onExit={()=>{if(activePosition)handleClosePosition(activePosition.id);}}
            onEditStops={handleEditPaperStops}
            onEditTargets={handleEditPaperTargets}
            editRequest={mobileExitRequest}
            onAdvancedConditional={()=>handleOpenCreateConditionalOrder({
              type:'position',label:(activePosition?.symbol||activeAsset.symbol)+' position'})}
          />
        </div>

        {/* Tickets are viewport overlays, never descendants of clipped chart columns. */}
        <ViewportPortal>
        <PaperTradeTicket open={isTradeTicketOpen} onClose={()=>setIsTradeTicketOpen(false)}
          asset={activeAsset} portfolio={paperPortfolio} bids={orderBook.bids} asks={orderBook.asks}
          onSubmit={handleSubmitTicketOrder} error={paperError}
          quickSize={mobileQuickSize}
          preparedExits={mobileEntryExits}
          quickFocus={mobileQuickTicket?.focus} quickOpenSequence={mobileQuickTicket?.seq}
          onOpenAccount={()=>setTradeTicketAccountSettings(true)}/>
        {tradeTicketAccountSettings&&<PaperAccountModal existing={paperAccounts.accounts.find(a=>a.id===(typeof tradeTicketAccountSettings==='string'?tradeTicketAccountSettings:paperAccounts.activeId))}
          proposedName={paperAccount.name}
          onClose={()=>setTradeTicketAccountSettings(false)}
          onSave={(name,settings)=>savePaperAccount(typeof tradeTicketAccountSettings==='string'?tradeTicketAccountSettings:paperAccounts.activeId,name,settings)}/>}
        </ViewportPortal>
        {/* Right Dock / Sidebar */}
        <RightSidebar
          assets={assets}
          activeAsset={activeAsset}
          onSelectAsset={handleSelectAsset}
          watchlists={watchlists}
          setWatchlists={setWatchlists}
          watchlistRecoveryBlocked={watchlistRecoveryBlocked}
          watchlistStorageError={watchlistStorageError}
          onResetCorruptWatchlists={resetCorruptWatchlists}
          activeWatchlistId={activeWatchlistId}
          setActiveWatchlistId={setActiveWatchlistId}
          onOpenAddSymbolModal={() => {setAddingWatchlistSymbol(true);setIsSymbolSearchOpen(true);}}
          priceFlashMap={priceFlashMap}
          asks={orderBook.asks}
          bids={orderBook.bids}
          trades={recentTrades}
          detailedAlerts={[...alerts.map(a => ({
            id:a.id, symbol:a.symbol,
            title:`${a.symbol} ${a.condition.replaceAll('_',' ')} ${a.targetPrice}`,
            message:a.notes || `Trigger at ${a.targetPrice}`, timeframe:'Live',
            status:(alertIsExpired(a,Date.now())?'Expired':a.paused?'Paused':a.triggered?'Triggered':'Active') as DetailedAlert['status'],
            dateStr:new Date(a.createdAt).toLocaleString(), type:'price' as const,
          })),...detailedAlerts]}
          alertLog={alertLog}
          notification={activeNotification}
          onOpenCreateAlertModal={() => setIsAlertsOpen(true)}
          onToggleAlertStatus={handleToggleAlertStatus}
          onDeleteDetailedAlert={handleDeleteDetailedAlert}
          news={[]}
          candles={candles}
          isOpen={isRightSidebarOpen}
          setIsOpen={setIsRightSidebarOpen}
          activeTab={rightSidebarTab}
          setActiveTab={setRightSidebarTab}
          onOpenTradeJournal={() => setIsTradeJournalOpen(true)}
          onOpenHelp={()=>setShortcutHelpOpen(true)}
          onOpenIndicators={()=>setIsIndicatorsOpen(true)}
          indicatorsOpen={isIndicatorsOpen}
          tradeJournalOpen={isTradeJournalOpen}
          onOpenStrategyLab={()=>{setIsRightSidebarOpen(false);requestBottomPanel('strategyLab');}}
          strategyLabOpen={isBottomTradingOpen&&activeDockTab==='strategyLab'}
          mobileToolContent={{
            indicators:<IndicatorsModal embedded isOpen onClose={()=>setIsRightSidebarOpen(false)} indicators={indicators} setIndicators={setIndicators}/>,
            strategies:<div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden"><StrategyLabPanel asset={activeAsset} timeframe={activeTimeframe} markets={assets}/></div>,
            journal:<React.Suspense fallback={<div role="status" className="p-2 text-xs">Opening Trading Journal…</div>}>
              <TradeJournalModal embedded isOpen onClose={()=>setIsRightSidebarOpen(false)} currentSymbol={activeAsset.symbol}
                onOpenReplay={()=>{setIsRightSidebarOpen(false);requestBottomPanel('replay');}}
                onOpenRiskCenter={()=>{setIsRightSidebarOpen(false);requestBottomPanel('risk');}}/>
            </React.Suspense>,
            help:<KeyboardShortcutsDialog embedded onClose={()=>setIsRightSidebarOpen(false)}/>,
          }}
          onOpenConditionalOrder={handleOpenCreateConditionalOrder}
        />
      </div>

      <ViewportPortal>
      {closeReviewPosition&&<div className="fixed inset-0 z-[290] bg-black/70 flex items-center justify-center p-3"
        role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)setCloseReviewId(null);}}>
        <section role="dialog" aria-modal="true" aria-label="Review paper position close"
          className="w-full max-w-[395px] rounded-xl border border-[#464d5c] bg-[#191d26] text-[#eff2fa] shadow-2xl p-5 space-y-4">
          <div className="flex justify-between items-center"><strong>Close position · Paper Trading</strong>
            <button title="Cancel close review" onClick={()=>setCloseReviewId(null)} className="text-[#a6adbd]">✕</button>
          </div>
          <p className="text-xs text-[#aab4c5]">Review the simulated close before executing. No real funds are involved.</p>
          <div className="flex justify-between text-xs"><span>Market</span><strong>{closeReviewPosition.exchange}:{closeReviewPosition.symbol}</strong></div>
          <div className="flex justify-between text-xs"><span>Position</span><strong>{closeReviewPosition.side} · {closeReviewPosition.qty} units</strong></div>
          <label className="text-xs text-[#aab4c5] block">Quantity to close
            <input type="number" min="0" step="any" max={closeReviewPosition.qty}
              aria-label="Close quantity" value={closeReviewQty} onChange={e=>setCloseReviewQty(e.target.value)}
              className="block w-full mt-1 bg-[#10151f] border border-[#4d5566] rounded-md px-3 py-2 text-white"/>
          </label>
          <div className="flex gap-2">
            <button type="button" onClick={()=>setCloseReviewQty(String(closeReviewPosition.qty/2))}
              className="rounded border border-[#4c5668] px-3 py-1.5 text-xs">50%</button>
            <button type="button" onClick={()=>setCloseReviewQty(String(closeReviewPosition.qty))}
              className="rounded border border-[#4c5668] px-3 py-1.5 text-xs">100%</button>
          </div>
          <div className="space-y-1.5 text-xs border-t border-[#373f4e] pt-3">
            <div className="flex justify-between"><span>Last verified observed price</span><strong>{closeReviewPosition.currentPrice}</strong></div>
            <div className="flex justify-between"><span>Est. closing commission</span><strong>{closePreviewFee.toFixed(4)} {paperPortfolio.settings.currency}</strong></div>
            <div className="flex justify-between"><span>Est. realized P&amp;L</span><strong className={closePreviewPnl>=0?'text-[#24c39b]':'text-[#fc8290]'}>{closePreviewPnl.toFixed(4)} {paperPortfolio.settings.currency}</strong></div>
          </div>
          {!closeValid&&<p role="alert" className="text-[#f5a5b3] text-xs">Invalid close size or stale quote. Wait for a fresh observed market price.</p>}
          {paperError&&<p role="alert" className="text-[#f5a5b3] text-xs">{paperError}</p>}
          <div className="grid grid-cols-2 gap-2">
            <button onClick={()=>setCloseReviewId(null)} className="rounded-md border border-[#4d5360] py-2 text-sm">Back</button>
            <button disabled={!closeValid} onClick={()=>executeClosePosition(closeReviewPosition.id,closeQuantity)}
              className="rounded-md bg-[#2962ff] disabled:bg-[#424957] py-2 text-sm font-semibold">Confirm close</button>
          </div>
        </section>
      </div>}
      {/* Floating Notification Toast */}
      {activeNotification && (
        <div
          id="active-notification-toast"
          className="fixed bottom-12 right-6 z-50 bg-[#1e222d] border border-[#2962ff] text-[#d1d4dc] px-4 py-3 rounded-xl shadow-2xl flex items-center gap-3 animate-in fade-in slide-in-from-bottom-4 duration-200"
        >
          <div className="p-2 rounded-lg bg-[#2962ff]/20 text-[#2962ff]">
            <Bell className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs font-semibold text-white">{activeNotification.type==='alert'?'Price Alert Notification':'PluTrade Notice'}</div>
            <div className="text-xs text-[#d1d4dc] mt-0.5">{activeNotification.message}</div>
          </div>
          <button
            onClick={() => setActiveNotification(null)}
            className="ml-2 text-[#787b86] hover:text-white text-xs px-2 py-1 rounded hover:bg-[#2a2e39]"
          >
            Dismiss
          </button>
        </div>
      )}

      {networkOffline&&<div role="alert" className="fixed bottom-0 right-0 z-[120] bg-[#513c25] text-[#ffe0b4] px-4 py-2 text-xs max-w-sm">
        Offline: cached workspace may be visible, but live quotes and simulated executions cannot be verified.
      </div>}
      {shortcutHelpOpen&&<KeyboardShortcutsDialog onClose={()=>setShortcutHelpOpen(false)}/>}
      {/* Modals */}
      {isSymbolSearchOpen && (
        <SymbolSearchModal
          isOpen={isSymbolSearchOpen}
          onClose={() => setIsSymbolSearchOpen(false)}
          assets={assets}
          onSelectAsset={selected=>{
            handleSelectAsset(selected);
            if(addingWatchlistSymbol){
              const key=marketIdentity(selected);
              setWatchlists(prev=>prev.map(w=>w.id===activeWatchlistId&&!w.symbols.includes(key)?
                {...w,symbols:[...w.symbols,key]}:w));
            }
            setAddingWatchlistSymbol(false);
          }}
          currentSymbol={activeAsset.symbol}
        />
      )}

      <IndicatorsModal
        isOpen={isIndicatorsOpen}
        onClose={() => setIsIndicatorsOpen(false)}
        indicators={indicators}
        setIndicators={setIndicators}
      />

      <AlertsModal
        isOpen={isAlertsOpen}
        onClose={() => setIsAlertsOpen(false)}
        activeAsset={activeAsset}
        alerts={alerts}
        setAlerts={setAlerts}
        activeTimeframe={activeTimeframe}
      />

      <SavedChartsModal open={isSavedChartsOpen} onClose={()=>setIsSavedChartsOpen(false)}
        asset={activeAsset} timeframe={activeTimeframe} chartType={chartType}
        drawings={drawings} indicators={indicators} onRestore={handleRestoreSavedChart}/>
      {isTradeJournalOpen&&<React.Suspense fallback={
        <div role="status" className="fixed inset-0 z-[110] flex items-center justify-center bg-black/70 text-white">
          Opening Trade Journal…
        </div>}>
        <TradeJournalModal isOpen={isTradeJournalOpen}
          onClose={()=>setIsTradeJournalOpen(false)}
          onOpenReplay={()=>{setIsTradeJournalOpen(false);requestBottomPanel('replay');}}
          onOpenRiskCenter={()=>{setIsTradeJournalOpen(false);requestBottomPanel('risk');}}
          currentSymbol={activeAsset.symbol}/>
      </React.Suspense>}

      </ViewportPortal>
      <ChartPictureInPicture
        ref={pipRef}
        activeAsset={activeAsset}
        candles={candles}
        activeTimeframe={activeTimeframe}
        chartType={chartType}
        onChangeTimeframe={(tf) => setActiveTimeframe(tf)}
        onPipStateChange={(active) => setIsPipActive(active)}
        onError={(msg) => {
          setActiveNotification({
            id: String(Date.now()),
            message: msg,
            type: 'info',
          });
        }}
      />

      <ViewportPortal>
      <ConditionalOrderModal
        isOpen={isConditionalOrderModalOpen}
        onClose={() => setIsConditionalOrderModalOpen(false)}
        activeAsset={activeAsset}
        drawings={drawings}
        alerts={alerts.map(a=>({
          id:a.id,symbol:a.symbol,
          title:`${a.symbol} ${a.condition.replaceAll('_',' ')} ${a.targetPrice}`,
          message:a.notes||'Price alert event',timeframe:a.timeframe||'1m',
          status:(a.paused?'Paused':a.triggered?'Triggered':'Active') as DetailedAlert['status'],
          dateStr:new Date(a.createdAt).toLocaleString(),type:'price' as const,
        }))}
        positions={paperPositions}
        accountOptions={paperAccounts.accounts.map(a=>({
          id:a.id,name:a.portfolio.account.name,currency:a.portfolio.settings.currency
        }))}
        activeAccountId={paperAccounts.activeId}
        accountPositions={Object.fromEntries(paperAccounts.accounts.map(record=>[
          record.id,record.portfolio.positions
        ]))}
        initialDependency={selectedDependencyForOrder}
        orderToEdit={orderToEdit}
        onSaveOrder={handleSaveConditionalOrder}
        onTestTrigger={handleTestTriggerConditionalOrder}
      />
      </ViewportPortal>
    </div>
  );
}
