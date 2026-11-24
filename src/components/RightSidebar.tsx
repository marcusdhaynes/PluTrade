import React, {useEffect,useRef} from 'react';
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
  onOpenConditionalOrder?: (dep: DependencyContext) => void;
}

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
  onOpenConditionalOrder,
}) => {
  const dockRef=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    if(!isOpen)return;
    const dismiss=(event:PointerEvent)=>{
      const target=event.target;
      // Watchlist menus/dialogs are intentionally rendered in document.body.
      // Treat them as belonging to the dock so clicking a menu item does not
      // tear down the very panel that owns its callback.
      if(dockRef.current?.contains(target as Node))return;
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
  return (
    <div ref={dockRef} id="tradingview-right-dock" className="flex h-full shrink-0 select-none z-20">
      {/* Expandable Panel Content */}
      {isOpen && (
        <div
          id="right-sidebar-content-pane"
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
      )}

      {/* Rightmost Vertical Icon Tab Bar */}
      <div
        id="tradingview-right-icon-bar"
        className="flex w-[32px] bg-[#131722] border-l border-[#2a2e39] py-1 flex-col items-center justify-between shrink-0"
      >
        <div className="flex flex-col items-center gap-1 w-full">
          {/* Watchlist with red badge 1 */}
          <button
            id="right-tab-watchlist"
            onClick={() => {
              if (isOpen && activeTab === 'watchlist') setIsOpen(false);
              else {
                setActiveTab('watchlist');
                setIsOpen(true);
              }
            }}
            className={`w-[24px] h-[24px] rounded-md flex items-center justify-center transition relative ${
              isOpen && activeTab === 'watchlist'
                ? 'bg-[#2962ff] text-white'
                : 'text-[#787b86] hover:text-[#d1d4dc] hover:bg-[#1e222d]'
            }`}
            title="Watchlist and Details"
          >
            <List className="w-3.5 h-3.5" />
            <span className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-[#f23645] text-white text-[8px] font-bold rounded-full flex items-center justify-center">
              1
            </span>
          </button>

          {/* Alerts (active in screenshot) */}
          <button
            id="right-tab-alerts"
            onClick={() => {
              if (isOpen && activeTab === 'alerts') setIsOpen(false);
              else {
                setActiveTab('alerts');
                setIsOpen(true);
              }
            }}
            className={`w-[24px] h-[24px] rounded-md flex items-center justify-center transition relative ${
              isOpen && activeTab === 'alerts'
                ? 'bg-[#2a2e39] text-white'
                : 'text-[#787b86] hover:text-[#d1d4dc] hover:bg-[#1e222d]'
            }`}
            title="Alerts"
          >
            <BellRing className="w-3.5 h-3.5" />
          </button>

          {/* The only Indicators entry is on this permanently attached rail. */}
          <button type="button" id="right-tab-indicators" aria-label="Indicators"
            title="Indicators and studies" onClick={onOpenIndicators}
            className="w-[24px] h-[24px] rounded-md flex items-center justify-center text-[#93abd0] hover:text-white hover:bg-[#2d4264] transition">
            <SlidersHorizontal className="w-3.5 h-3.5"/>
          </button>

          {/* News */}
          <button
            id="right-tab-news"
            onClick={() => {
              if (isOpen && activeTab === 'news') setIsOpen(false);
              else {
                setActiveTab('news');
                setIsOpen(true);
              }
            }}
            className={`w-[24px] h-[24px] rounded-md flex items-center justify-center transition ${
              isOpen && activeTab === 'news'
                ? 'bg-[#2962ff] text-white'
                : 'text-[#787b86] hover:text-[#d1d4dc] hover:bg-[#1e222d]'
            }`}
            title="News"
          >
            <Newspaper className="w-3.5 h-3.5" />
          </button>

          {/* Order Book / DOM */}
          <button
            id="right-tab-orderbook"
            onClick={() => {
              if (isOpen && activeTab === 'orderbook') setIsOpen(false);
              else {
                setActiveTab('orderbook');
                setIsOpen(true);
              }
            }}
            className={`w-[24px] h-[24px] rounded-md flex items-center justify-center transition ${
              isOpen && activeTab === 'orderbook'
                ? 'bg-[#2962ff] text-white'
                : 'text-[#787b86] hover:text-[#d1d4dc] hover:bg-[#1e222d]'
            }`}
            title="Order Book & Depth"
          >
            <Layers className="w-3.5 h-3.5" />
          </button>

          {/* Technical Summary Gauge */}
          <button
            id="right-tab-technicals"
            onClick={() => {
              if (isOpen && activeTab === 'technicals') setIsOpen(false);
              else {
                setActiveTab('technicals');
                setIsOpen(true);
              }
            }}
            className={`w-[24px] h-[24px] rounded-md flex items-center justify-center transition ${
              isOpen && activeTab === 'technicals'
                ? 'bg-[#2962ff] text-white'
                : 'text-[#787b86] hover:text-[#d1d4dc] hover:bg-[#1e222d]'
            }`}
            title="Technicals"
          >
            <Gauge className="w-3.5 h-3.5" />
          </button>

          {/* Calendar */}
          <button
            type="button" id="right-tab-calendar"
            onClick={()=>{if(isOpen&&activeTab==='calendar')setIsOpen(false);else{setActiveTab('calendar');setIsOpen(true);}}}
            className={`w-[24px] h-[24px] rounded-md flex items-center justify-center transition ${isOpen&&activeTab==='calendar'?'bg-[#2962ff] text-white':'text-[#787b86] hover:text-[#d1d4dc] hover:bg-[#1e222d]'}`}
            title="Economic Calendar (feed not connected)"
          >
            <Calendar className="w-3.5 h-3.5" />
          </button>

          {/* Community Ideas */}
          <button type="button" disabled aria-label="Community Ideas unavailable"
            className="w-[24px] h-[24px] rounded-md flex items-center justify-center text-[#586071] cursor-not-allowed opacity-60"
            title="Community Ideas requires a moderated backend and is not connected"
          >
            <Lightbulb className="w-3.5 h-3.5" />
          </button>

          {/* Chats */}
          <button type="button" disabled aria-label="Public and Private Chats unavailable"
            className="w-[24px] h-[24px] rounded-md flex items-center justify-center text-[#586071] cursor-not-allowed opacity-60"
            title="Chats require authenticated messaging and moderation and are not connected"
          >
            <MessageSquare className="w-3.5 h-3.5" />
          </button>

          {/* Notifications with red badge 99+ */}
          <button
            id="right-tab-notifications"
            onClick={() => {
              if (isOpen && activeTab === 'notifications') setIsOpen(false);
              else {
                setActiveTab('notifications');
                setIsOpen(true);
              }
            }}
            className="w-[24px] h-[24px] rounded-md flex items-center justify-center text-[#787b86] hover:text-[#d1d4dc] hover:bg-[#1e222d] transition relative"
            title="Notifications"
          >
            <Bell className="w-3.5 h-3.5" />
            {notification && <span className="absolute -top-0.5 -right-1 px-0.5 py-0 bg-[#f23645] text-white text-[7.5px] font-bold rounded-full flex items-center justify-center">1</span>}
          </button>
        </div>

        {/* Bottom icons: Journal, Help & Toggle Collapse */}
        <div className="flex flex-col items-center gap-1">
          {/* Trade Journal (TradeZella & TraderSync) */}
          <button
            id="right-tab-trade-journal"
            onClick={onOpenTradeJournal}
            className="w-[24px] h-[24px] rounded-md flex items-center justify-center text-[#2962ff] hover:text-white hover:bg-[#2962ff] transition relative group"
            title="Trade Journal (TradeZella & TraderSync)"
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 bg-[#00ffa3] rounded-full ring-1 ring-[#131722]" />
          </button>

          <button type="button" onClick={onOpenHelp} disabled={!onOpenHelp}
            className="w-[24px] h-[24px] rounded-md flex items-center justify-center text-[#787b86] hover:text-[#d1d4dc] hover:bg-[#1e222d] transition"
            title="Keyboard Shortcuts & Help"
          >
            <HelpCircle className="w-3.5 h-3.5" />
          </button>

          <button
            id="toggle-right-sidebar-btn"
            onClick={() => setIsOpen(!isOpen)}
            className="w-[24px] h-[24px] rounded-md flex items-center justify-center text-[#787b86] hover:text-[#d1d4dc] hover:bg-[#1e222d] transition"
            title={isOpen ? 'Collapse Panel' : 'Expand Panel'}
          >
            {isOpen ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronLeft className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>
    </div>
  );
});
