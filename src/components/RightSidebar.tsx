import React, {useEffect,useLayoutEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {
  Asset,
  Watchlist,
  OrderBookItem,
  TradeItem,
  PriceAlert,
  MarketNews,
  OHLCV,
  DetailedAlert,
  AlertLogEntry,
  DependencyContext,
} from '../types';
import { WatchlistPanel } from './WatchlistPanel';
import { OrderBookWidget } from './OrderBookWidget';
import { TechnicalSummaryGauge } from './TechnicalSummaryGauge';
import { AlertsPanel } from './AlertsPanel';
import {
  List,
  BellRing,
  SlidersHorizontal,
  Newspaper,
  Layers,
  Gauge,
  Bell,
  Calendar,
  Lightbulb,
  MessageSquare,
  Bookmark,
  ChevronRight,
  ChevronLeft,
  HelpCircle,
  BookOpen,
} from 'lucide-react';

export type RightSidebarTab =
  | 'alerts'
  | 'watchlist'
  | 'orderbook'
  | 'technicals'
  | 'news'
  | 'calendar'
  | 'notifications';

interface RightSidebarProps {
  assets: Asset[];
  activeAsset: Asset;
  onSelectAsset: (asset: Asset) => void;
  watchlists: Watchlist[];
  setWatchlists: React.Dispatch<React.SetStateAction<Watchlist[]>>;
  watchlistRecoveryBlocked?:boolean;
  watchlistStorageError?:string;
  onResetCorruptWatchlists?:()=>void;
  activeWatchlistId: string;
  setActiveWatchlistId: (id: string) => void;
  onOpenAddSymbolModal: () => void;
  priceFlashMap: Record<string, 'up' | 'down'>;
  asks: OrderBookItem[];
  bids: OrderBookItem[];
  trades: TradeItem[];
  detailedAlerts: DetailedAlert[];
  alertLog: AlertLogEntry[];
  notification: {id:string;message:string;type:'alert'|'info'}|null;
  onOpenCreateAlertModal: () => void;
  onToggleAlertStatus: (id: string) => void;
  onDeleteDetailedAlert: (id: string) => void;
  news: MarketNews[];
  candles: OHLCV[];
  isOpen: boolean;
  setIsOpen: (val: boolean | ((prev: boolean) => boolean)) => void;
  activeTab: RightSidebarTab;
  setActiveTab: (tab: RightSidebarTab) => void;
  onOpenTradeJournal?: () => void;
  onOpenHelp?:()=>void;
  onOpenIndicators:()=>void;
  indicatorsOpen?:boolean;
  tradeJournalOpen?:boolean;
  onOpenStrategyLab?:()=>void;
  strategyLabOpen?:boolean;
  onOpenConditionalOrder?: (dep: DependencyContext) => void;
}


type RightRailButtonProps={
  id?:string;
  label:string;
  title?:string;
  icon:React.ReactNode;
  onClick?:()=>void;
  active?:boolean;
  disabled?:boolean;
  expanded?:boolean;
  badge?:React.ReactNode;
};
/** Every rail control is the same 24px button / centered 14px icon shape.
 * The responsive rail CSS scales every button to the same 22px grid. */
const RightRailButton:React.FC<RightRailButtonProps>=({
  id,label,title,icon,onClick,active=false,disabled=false,expanded,badge
})=><button type="button" id={id} data-right-rail-button="true"
  aria-label={label} title={title??label} aria-pressed={active}
  aria-expanded={expanded} disabled={disabled} onClick={onClick}
  className={[
    'relative flex h-[24px] w-[24px] shrink-0 items-center justify-center rounded-md',
    'border-0 p-0 transition-colors duration-100',
    'focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#8bb5ff]',
    active?'bg-[#2962ff] text-white':'bg-transparent text-[#787b86] hover:bg-[#1e222d] hover:text-[#d1d4dc]',
    disabled?'cursor-not-allowed opacity-50':'cursor-pointer'
  ].join(' ')}>
  <span data-right-rail-icon="true" className="flex h-3.5 w-3.5 shrink-0 items-center justify-center">
    {icon}
  </span>
  {badge&&<span data-right-rail-badge="true"
    className="absolute -right-0.5 -top-0.5 flex h-3 min-w-3 items-center justify-center rounded-full bg-[#f23645] px-0.5 text-[8px] font-bold leading-none text-white">
    {badge}
  </span>}
</button>;

export const RightSidebar: React.FC<RightSidebarProps> = React.memo(({
  assets,
  activeAsset,
  onSelectAsset,
  watchlists,
  setWatchlists,
  watchlistRecoveryBlocked,
  watchlistStorageError,
  onResetCorruptWatchlists,
  activeWatchlistId,
  setActiveWatchlistId,
  onOpenAddSymbolModal,
  priceFlashMap,
  asks,
  bids,
  trades,
  detailedAlerts,
  alertLog,
  notification,
  onOpenCreateAlertModal,
  onToggleAlertStatus,
  onDeleteDetailedAlert,
  news,
  candles,
  isOpen,
  setIsOpen,
  activeTab,
  setActiveTab,
  onOpenTradeJournal,
  onOpenHelp,
  onOpenIndicators,
  indicatorsOpen=false,
  tradeJournalOpen=false,
  onOpenStrategyLab,
  strategyLabOpen=false,
  onOpenConditionalOrder,
}) => {
  const dockRef=useRef<HTMLDivElement>(null);
  const paneRef=useRef<HTMLDivElement>(null);
  const [compactDock,setCompactDock]=useState(()=>{
    return typeof window!=='undefined'&&window.matchMedia('(max-width:767px), (hover:none) and (pointer:coarse)').matches;
  });
  const [paneGeometry,setPaneGeometry]=useState({top:0,left:0,width:0,height:0,ready:false});

  useEffect(()=>{
    const query=window.matchMedia('(max-width:767px), (hover:none) and (pointer:coarse)');
    const update=()=>setCompactDock(query.matches);
    update();
    query.addEventListener('change',update);
    return ()=>query.removeEventListener('change',update);
  },[]);
  // The expandable panel used to be an absolutely positioned child of the
  // chart workspace. That workspace clips overflow and its timeframe row
  // could sit on top of the panel's heading, intercepting every tap.
  // Anchor the panel to the fixed right rail, but portal it into document.body.
  useLayoutEffect(()=>{
    if(!isOpen||!compactDock)return;
    let frame=0;
    const place=()=>{
      const dock=dockRef.current?.getBoundingClientRect();
      if(!dock)return;
      const vw=window.innerWidth,vh=window.innerHeight;
      const width=Math.max(0,Math.min(320,vw*0.82,vw-58,dock.left-28));
      const top=Math.max(0,Math.min(vh,dock.top));
      const height=Math.max(0,Math.min(vh,dock.bottom)-top);
      const left=Math.max(0,Math.min(vw-width,dock.left-width));
      setPaneGeometry(prev=>prev.ready&&
        Math.abs(prev.top-top)<0.25&&Math.abs(prev.left-left)<0.25&&
        Math.abs(prev.width-width)<0.25&&Math.abs(prev.height-height)<0.25?
          prev:{top,left,width,height,ready:true});
    };
    const schedule=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(place);};
    const resizeObserver=new ResizeObserver(schedule);
    if(dockRef.current)resizeObserver.observe(dockRef.current);
    place();
    window.addEventListener('resize',schedule);
    window.addEventListener('orientationchange',schedule);
    window.addEventListener('scroll',schedule,true);
    window.visualViewport?.addEventListener('resize',schedule);
    return ()=>{
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      window.removeEventListener('resize',schedule);
      window.removeEventListener('orientationchange',schedule);
      window.removeEventListener('scroll',schedule,true);
      window.visualViewport?.removeEventListener('resize',schedule);
    };
  },[isOpen,compactDock]);

  useEffect(()=>{
    if(!isOpen)return;
    const dismiss=(event:PointerEvent)=>{
      const target=event.target;
      // Watchlist menus/dialogs are intentionally rendered in document.body.
      // Treat them as belonging to the dock so clicking a menu item does not
      // tear down the very panel that owns its callback.
      if(dockRef.current?.contains(target as Node)||paneRef.current?.contains(target as Node))return;
      if(target instanceof Element&&target.closest(
        '#watchlist-dropdown-menu, #watchlist-create-modal'))return;
      setIsOpen(false);
    };
    const escape=(event:KeyboardEvent)=>{if(event.key==='Escape')setIsOpen(false);};
    window.addEventListener('pointerdown',dismiss,true);
    window.addEventListener('keydown',escape);
    return ()=>{
      window.removeEventListener('pointerdown',dismiss,true);
      window.removeEventListener('keydown',escape);
    };
  },[isOpen,setIsOpen]);
  const activateTab=(tab:RightSidebarTab)=>{
    if(isOpen&&activeTab===tab)setIsOpen(false);
    else{setActiveTab(tab);setIsOpen(true);}
  };
  const pane=isOpen?(
        <div
          ref={paneRef}
          id="right-sidebar-content-pane"
          data-viewport-drawer={compactDock?'true':'false'}
          style={compactDock?{
            position:'fixed',top:paneGeometry.top,left:paneGeometry.left,
            right:'auto',width:paneGeometry.width,height:paneGeometry.height,
            maxWidth:'none',zIndex:1450,pointerEvents:'auto',
            visibility:paneGeometry.ready?'visible':'hidden'
          }:undefined}
          className="w-64 md:w-72 h-full bg-[#131722] border-l border-[#2a2e39] flex flex-col overflow-hidden"
        >
          {activeTab === 'alerts' && (
            <AlertsPanel
              alerts={detailedAlerts}
              alertLog={alertLog}
              onOpenCreateModal={onOpenCreateAlertModal}
              onToggleStatus={onToggleAlertStatus}
              onDeleteAlert={onDeleteDetailedAlert}
              onOpenConditionalOrder={onOpenConditionalOrder}
            />
          )}

          {activeTab === 'watchlist' && (
            <WatchlistPanel
              assets={assets}
              activeAsset={activeAsset}
              onSelectAsset={onSelectAsset}
              watchlists={watchlists}
              setWatchlists={setWatchlists}
              watchlistRecoveryBlocked={watchlistRecoveryBlocked}
              watchlistStorageError={watchlistStorageError}
              onResetCorruptWatchlists={onResetCorruptWatchlists}
              activeWatchlistId={activeWatchlistId}
              setActiveWatchlistId={setActiveWatchlistId}
              onOpenAddSymbolModal={onOpenAddSymbolModal}
              priceFlashMap={priceFlashMap}
            />
          )}

          {activeTab === 'orderbook' && (
            <OrderBookWidget
              asks={asks}
              bids={bids}
              trades={trades}
              currentPrice={activeAsset.price}
              digits={activeAsset.digits}
            />
          )}

          {activeTab === 'technicals' && (
            <div className="h-full overflow-y-auto">
              <TechnicalSummaryGauge asset={activeAsset} candles={candles} />
            </div>
          )}

          {activeTab === 'news' && (
            <div className="flex flex-col h-full bg-[#131722] p-2 overflow-y-auto divide-y divide-[#2a2e39]/50">
              <div className="text-[10.5px] font-semibold text-[#787b86] uppercase tracking-wider pb-1.5">
                Market Sentiment & News
              </div>
              {news.length === 0 && <p className="text-[#8b93a4] text-[11px] py-4 leading-relaxed">No verified market-news feed is connected. PluTrade does not generate or display fictional news headlines.</p>}
              {news.map((item) => (
                <div key={item.id} className="py-2 group cursor-pointer">
                  <div className="flex items-center justify-between text-[9px] text-[#787b86] mb-0.5">
                    <span>{item.source}</span>
                    <span>{item.timeAgo}</span>
                  </div>
                  <h4 className="text-[11px] font-medium text-[#d1d4dc] group-hover:text-[#2962ff] leading-snug transition">
                    {item.title}
                  </h4>
                  <div className="mt-1 flex items-center gap-1">
                    <span
                      className={`text-[8.5px] px-1.5 py-0.2 rounded font-medium uppercase ${
                        item.sentiment === 'bullish'
                          ? 'bg-[#089981]/20 text-[#089981]'
                          : item.sentiment === 'bearish'
                          ? 'bg-[#f23645]/20 text-[#f23645]'
                          : 'bg-[#787b86]/20 text-[#787b86]'
                      }`}
                    >
                      {item.sentiment}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'calendar' && (
            <section id="plutrade-calendar-availability" role="status" className="h-full p-4 bg-[#131722] text-[#d1d4dc] space-y-3">
              <h3 className="font-semibold text-sm">Economic Calendar</h3>
              <p className="text-xs text-[#9facbd]">A verified economic-event feed is not connected. PluTrade does not invent event dates, impact ratings, or actual/forecast values.</p>
              <p className="text-[11px] text-[#9facbd]">Use an authoritative market calendar until licensed event data is connected here.</p>
            </section>
          )}

          {activeTab === 'notifications' && (
            <div className="flex flex-col h-full bg-[#131722] p-2.5 overflow-y-auto">
              <div className="flex items-center justify-between mb-2.5">
                <span className="font-semibold text-xs text-[#d1d4dc]">Notifications</span>
                {notification && <span className="text-[9px] px-1.5 py-0.2 bg-[#f23645] text-white rounded-full font-bold">1</span>}
              </div>
              {notification ? <div className="p-2 bg-[#1e222d] rounded border border-[#2a2e39] text-[11px]">
                <div className="font-medium text-white">{notification.type === 'alert' ? 'Price alert' : 'Workspace notification'}</div>
                <p className="text-[#d1d4dc] mt-1">{notification.message}</p>
              </div> : <p className="text-[#787b86] text-[11px]">No current notifications. Alerts are evaluated only while PluTrade is running.</p>}
            </div>
          )}
        </div>
      ):null;
  return (
    <div ref={dockRef} id="tradingview-right-dock" className="flex h-full shrink-0 select-none z-20">
      {/* On mobile the pane must escape the clipped chart workspace.
          Desktop keeps its existing in-flow split layout. */}
      {compactDock&&typeof document!=='undefined'?createPortal(pane,document.body):pane}

      {/* Every right tool shares an identical structure, icon box,
          spacing, active state and keyboard focus treatment. */}
      <div id="tradingview-right-icon-bar"
        className="flex w-[32px] shrink-0 select-none flex-col items-center justify-between border-l border-[#2a2e39] bg-[#131722] py-1">
        <div className="flex w-full flex-col items-center gap-1">
          <RightRailButton id="right-tab-watchlist" label="Watchlist and Details"
            icon={<List className="h-3.5 w-3.5"/>}
            active={isOpen&&activeTab==='watchlist'} expanded={isOpen&&activeTab==='watchlist'}
            onClick={()=>activateTab('watchlist')}/>
          <RightRailButton id="right-tab-alerts" label="Alerts"
            icon={<BellRing className="h-3.5 w-3.5"/>}
            active={isOpen&&activeTab==='alerts'} expanded={isOpen&&activeTab==='alerts'}
            onClick={()=>activateTab('alerts')}/>
          <RightRailButton id="right-tab-indicators" label="Indicators"
            title="Indicators and studies" icon={<SlidersHorizontal className="h-3.5 w-3.5"/>}
            active={indicatorsOpen} onClick={onOpenIndicators}/>
          <RightRailButton id="right-tab-metrics" label="Metrics"
            title="Metrics · technical summary" icon={<Gauge className="h-3.5 w-3.5"/>}
            active={isOpen&&activeTab==='technicals'} expanded={isOpen&&activeTab==='technicals'}
            onClick={()=>activateTab('technicals')}/>
          <RightRailButton id="right-tab-strategies" label="Strategies"
            title="Strategies · strategy lab" icon={<Lightbulb className="h-3.5 w-3.5"/>}
            active={strategyLabOpen} disabled={!onOpenStrategyLab} onClick={onOpenStrategyLab}/>
          <RightRailButton id="right-tab-news" label="News"
            icon={<Newspaper className="h-3.5 w-3.5"/>}
            active={isOpen&&activeTab==='news'} expanded={isOpen&&activeTab==='news'}
            onClick={()=>activateTab('news')}/>
          <RightRailButton id="right-tab-orderbook" label="Order Book & Depth"
            icon={<Layers className="h-3.5 w-3.5"/>}
            active={isOpen&&activeTab==='orderbook'} expanded={isOpen&&activeTab==='orderbook'}
            onClick={()=>activateTab('orderbook')}/>
          <RightRailButton id="right-tab-calendar" label="Economic Calendar"
            title="Economic Calendar (feed not connected)" icon={<Calendar className="h-3.5 w-3.5"/>}
            active={isOpen&&activeTab==='calendar'} expanded={isOpen&&activeTab==='calendar'}
            onClick={()=>activateTab('calendar')}/>
          <RightRailButton label="Community Ideas unavailable"
            title="Community Ideas requires a moderated backend and is not connected"
            icon={<Bookmark className="h-3.5 w-3.5"/>} disabled/>
          <RightRailButton label="Public and Private Chats unavailable"
            title="Chats require authenticated messaging and moderation and are not connected"
            icon={<MessageSquare className="h-3.5 w-3.5"/>} disabled/>
          <RightRailButton id="right-tab-notifications" label="Notifications"
            icon={<Bell className="h-3.5 w-3.5"/>} badge={notification?'1':undefined}
            active={isOpen&&activeTab==='notifications'} expanded={isOpen&&activeTab==='notifications'}
            onClick={()=>activateTab('notifications')}/>
        </div>
        <div className="flex w-full flex-col items-center gap-1">
          <RightRailButton id="right-tab-trade-journal" label="Trade Journal"
            title="Trade Journal" icon={<BookOpen className="h-3.5 w-3.5"/>}
            active={tradeJournalOpen} onClick={onOpenTradeJournal}/>
          <RightRailButton id="right-tab-help" label="Keyboard Shortcuts & Help"
            icon={<HelpCircle className="h-3.5 w-3.5"/>}
            disabled={!onOpenHelp} onClick={onOpenHelp}/>
          <RightRailButton id="toggle-right-sidebar-btn"
            label={isOpen?'Collapse Panel':'Expand Panel'}
            icon={isOpen?<ChevronRight className="h-3.5 w-3.5"/>:<ChevronLeft className="h-3.5 w-3.5"/>}
            active={isOpen} expanded={isOpen} onClick={()=>setIsOpen(!isOpen)}/>
        </div>
      </div>
    </div>
  );
});
