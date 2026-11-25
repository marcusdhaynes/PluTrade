import {DEFAULT_DYNAMIC_TRAIL,validDynamicTrail,type DynamicTrailingSettings} from '../services/dynamicTrailing';
import React, {useState,useEffect,useRef} from 'react';
import {createPortal} from 'react-dom';
import {ChevronDown, Maximize2, Minimize2, Minus, X, Download, Edit2, Zap, Plus, Settings2, Check} from 'lucide-react';
import type {Asset, PaperAccount, PaperPosition} from '../types';
import type {ConditionalOrder,DependencyContext} from '../types/conditionalOrders';
import type {PaperFill} from '../services/paperTrading';
import {accountLeverage,isFreshPaperQuote,marketPaperCategory,type PaperSettings} from '../services/paperTrading';
import type {PaperEntryOrder,PaperOrderEvent,PaperAmendRequest} from '../services/paperOrders';
import type {PaperAccountRecord} from '../services/paperAccounts';
import {isPaperStorageBlocked} from '../services/paperAccounts';
import {PaperAccountModal} from './PaperAccountModal';
import {ConditionalOrdersTable} from './orders/ConditionalOrdersTable';
import {RiskCenterPanel} from './RiskCenterPanel';
import {summarizePaperAccounts} from '../services/portfolioAnalytics';
const MarketScreenerPanel=React.lazy(()=>import('./MarketScreenerPanel')
  .then(m=>({default:m.MarketScreenerPanel})));
const MarketDataHealthPanel=React.lazy(()=>import('./MarketDataHealthPanel')
  .then(m=>({default:m.MarketDataHealthPanel})));
const CloudSyncPanel=React.lazy(()=>import('./CloudSyncPanel')
  .then(m=>({default:m.CloudSyncPanel})));
const ReplayBacktestPanel=React.lazy(()=>import('./ReplayBacktestPanel')
  .then(m=>({default:m.ReplayBacktestPanel})));
const StrategyLabPanel=React.lazy(()=>import('./StrategyLabPanel')
  .then(m=>({default:m.StrategyLabPanel})));
import type {Timeframe} from '../types';
import type {FeedHealth} from '../services/marketEvents';
import type {RiskPolicy} from '../services/riskCenter';
import type {PaperPortfolio} from '../services/paperTrading';

export interface BottomTradingPanelProps {
  account:PaperAccount; positions:PaperPosition[]; activeAsset:Asset;activeTimeframe:Timeframe;
  paperAccounts:PaperAccountRecord[];
  activePaperAccountId:string;
  paperSettings:PaperSettings;portfolio:PaperPortfolio;
  allMarkets:Asset[];onSelectScreenedMarket:(asset:Asset)=>void;onAddScreenedMarket:(asset:Asset)=>void;
  feedHealth:Record<string,FeedHealth>;marketStatus:{connected:boolean;provider:string;latencyMs:number};
  riskPolicy:RiskPolicy;onRiskPolicyChange:(policy:RiskPolicy)=>void;
  onSelectPaperAccount:(id:string)=>void;
  onSavePaperAccount:(id:string|null,name:string,settings:PaperSettings)=>void;
  onDeletePaperAccount:(id:string)=>void;
  onClosePosition:(id:string)=>void;
  onOpenTicket:()=>void;
  pendingOrders:PaperEntryOrder[];
  orderEvents:PaperOrderEvent[];
  onCancelPendingOrder:(id:string)=>void;
  onAmendPendingOrder:(id:string,request:PaperAmendRequest)=>string|null;
  onEditPosition:(id:string,tp?:number,sl?:number,trailing?:number|null,
    dynamic?:DynamicTrailingSettings|null)=>void;
  onResetPaper:()=>void; onResolvePaperRecovery:()=>void; paperError:string;paperTradingBlocked:boolean; fills:PaperFill[];
  conditionalOrders:ConditionalOrder[];
  onOpenCreateConditionalOrder:(dep?:DependencyContext|null)=>void;
  onEditConditionalOrder:(order:ConditionalOrder)=>void;
  onToggleConditionalOrderStatus:(id:string)=>void;
  onDeleteConditionalOrder:(id:string)=>void;
  onTestTriggerConditionalOrder:(order:ConditionalOrder)=>void;
  requestedTab?:{tab:string;seq:number};
  onActiveTabChange?:(tab:string)=>void;
  isOpen:boolean;setIsOpen:(open:boolean|((prev:boolean)=>boolean))=>void;
  isExpanded:boolean;setIsExpanded:(open:boolean|((prev:boolean)=>boolean))=>void;
}
type Tab='positions'|'orders'|'orderHistory'|'balanceHistory'|'activityLog'|'tradeHistory'|'analytics'|'risk'|'screener'|'dataHealth'|'replay'|'strategyLab'|'cloud';
const tabs:[Tab,string][]=[
  ['positions','Positions'],['orders','Orders'],['orderHistory','Order History'],
  ['balanceHistory','Balance History'],['activityLog','Activity Log'],
  ['tradeHistory','Trade History'],['analytics','Analytics'],['risk','Risk Center'],['screener','Screener'],['dataHealth','Data Health'],['replay','Replay & Backtest'],['strategyLab','Strategy Lab'],['cloud','Cloud Sync'],
];
const cash=(n:number)=>Number.isFinite(n)?n.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}):'—';
const amount=(n:number)=>Number.isFinite(n)?n.toLocaleString('en-US',{maximumFractionDigits:9}):'—';

export const BottomTradingPanel:React.FC<BottomTradingPanelProps>=({
  account,positions,activeAsset,activeTimeframe,onClosePosition,onEditPosition,onResetPaper,onResolvePaperRecovery,paperError,paperTradingBlocked,fills,
  portfolio,riskPolicy,onRiskPolicyChange,allMarkets,onSelectScreenedMarket,onAddScreenedMarket,feedHealth,marketStatus,
  onOpenTicket,pendingOrders,orderEvents,onCancelPendingOrder,onAmendPendingOrder,
  paperAccounts,activePaperAccountId,paperSettings,onSelectPaperAccount,onSavePaperAccount,onDeletePaperAccount,
  conditionalOrders,onOpenCreateConditionalOrder,onEditConditionalOrder,onToggleConditionalOrderStatus,
  onDeleteConditionalOrder,onTestTriggerConditionalOrder,requestedTab,onActiveTabChange,isOpen,setIsOpen,isExpanded,setIsExpanded,
})=>{
  const [tab,setTab]=useState<Tab>('positions');
  useEffect(()=>{if(requestedTab&&tabs.some(([id])=>id===requestedTab.tab))setTab(requestedTab.tab as Tab);},[requestedTab?.seq]);
  useEffect(()=>{onActiveTabChange?.(tab);},[tab,onActiveTabChange]);
  const [quantity,setQuantity]=useState('1');
  const [accountListOpen,setAccountListOpen]=useState(false);
  const accountHold=useRef<ReturnType<typeof setTimeout>|null>(null);
  const heldAccount=useRef(false);
  const holdStart=useRef({x:0,y:0});
  const cancelAccountHold=()=>{if(accountHold.current!==null){clearTimeout(accountHold.current);accountHold.current=null;}};
  useEffect(()=>()=>{if(accountHold.current!==null)clearTimeout(accountHold.current);},[]);
  // undefined = dialog closed; null = new account; string = edit existing account
  const [accountDialog,setAccountDialog]=useState<string|null|undefined>(undefined);
  const portfolioSummary=summarizePaperAccounts(paperAccounts);
  const activeLeverage=accountLeverage(paperSettings,activeAsset);
  const activeCategory=marketPaperCategory(activeAsset);
  const feeDescription=(()=>{
    const derivative=activeAsset.category==='futures'||activeAsset.category==='options'||activeAsset.marketType==='futures'||activeAsset.marketType==='swap';
    if(derivative&&paperSettings.futuresOptions.enabled)
      return paperSettings.futuresOptions.perContract.toString()+' '+paperSettings.currency+' per contract / fill';
    const c=paperSettings.commission;
    return c.enabled?(c.mode==='percent'?c.amount+'% of notional':c.amount+' '+paperSettings.currency+' fixed')+' per fill':'No Commissions';
  })();
  const [tp,setTp]=useState('');
  const [sl,setSl]=useState('');
  const [editId,setEditId]=useState<string|null>(null);
  const [editPendingId,setEditPendingId]=useState<string|null>(null);
  const [editPendingQty,setEditPendingQty]=useState('');
  const [editPendingPrice,setEditPendingPrice]=useState('');
  const [editPendingLimit,setEditPendingLimit]=useState('');
  const [editPendingError,setEditPendingError]=useState('');
  const [editTp,setEditTp]=useState('');
  const [editSl,setEditSl]=useState('');
  const [editTrailingEnabled,setEditTrailingEnabled]=useState(false);
  const [editTrailingPercent,setEditTrailingPercent]=useState('0.50');
  const [editDynamicEnabled,setEditDynamicEnabled]=useState(false);
  const [editDynamicSettings,setEditDynamicSettings]=useState<DynamicTrailingSettings>({...DEFAULT_DYNAMIC_TRAIL});
  const [quoteClock,setQuoteClock]=useState(Date.now);
  useEffect(()=>{if(!isOpen)return;const id=setInterval(()=>setQuoteClock(Date.now()),1000);return()=>clearInterval(id);},[isOpen]);
  const quoteAge=Math.max(0,Math.max(quoteClock,Date.now())-(activeAsset.quoteUpdatedAt||0));
  const live=isFreshPaperQuote(activeAsset);
  const observed=activeAsset.quoteStatus!=='unavailable'&&!!activeAsset.quoteUpdatedAt&&Number.isFinite(activeAsset.price)&&activeAsset.price>0;
  const liveDisplay=live||(observed&&activeAsset.quoteOrigin==='ticker'&&quoteAge<30000);
  const priceText=observed?`${liveDisplay?'Live Price':quoteAge<30000?'Last Observed Price':'Last Known Price'}: ${amount(activeAsset.price)} ${activeAsset.currency}`:'Live Price Unavailable';
  // Settled cash balance history is reconstructed from execution ledger entries,
  // never from fabricated equity snapshots.
  let runningBalance=paperSettings.startingBalance;
  const balanceRows=[...fills].reverse().map(fill=>{
    runningBalance+=fill.realizedPnL;
    return {fill,balance:runningBalance};
  }).reverse();
  // Order History is an event ledger, not one row per order: every submit,
  // activation, amendment, fill, cancellation and expiry must stay visible.
  const orderHistory=[...orderEvents].sort((a,b)=>b.at-a.at||b.id.localeCompare(a.id));
  const closedTrades=fills.filter(f=>f.note.toLowerCase().includes('close'));
  const openingFill=(id:string)=>fills.find(f=>f.positionId===id&&f.note.toLowerCase().startsWith('open'));
  const timeline=[...orderEvents.map(event=>({id:event.id,at:event.at,
    message:`${event.action.toUpperCase()} ${event.kind.toUpperCase()} ${event.side} ${event.qty} ${event.symbol} @ ${amount(event.price)}`})),
    ...fills.filter(f=>f.note.toLowerCase().includes('close')).map(f=>({
      id:f.id,at:f.timestamp,message:`${f.note.toUpperCase()} ${f.quantity} ${f.symbol} @ ${amount(f.price)} · P&L ${cash(f.realizedPnL)}`,
    }))].sort((a,b)=>b.at-a.at);
  const exportCsv=()=>{
    const rows=[['Time','Market','Source','Action','Quantity','Price','Fee','Realized PnL'],...fills.map(f=>
      [new Date(f.timestamp).toISOString(),f.symbol,f.exchange,f.note,String(f.quantity),String(f.price),String(f.fee),String(f.realizedPnL)])];
    const csv=rows.map(row=>row.map(v=>'"'+v.replace(/"/g,'""')+'"').join(',')).join('\n');
    const url=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));
    const a=document.createElement('a');a.href=url;a.download='plutrade-paper-fills.csv';a.click();
    window.setTimeout(()=>URL.revokeObjectURL(url),1000);
  };
  if(!isOpen)return <button id="paper-trading-collapsed-strip" type="button" onClick={()=>setIsOpen(true)}
    className="hidden md:flex h-6 bg-[#1e222d] border-t border-[#2a2e39] px-3 items-center gap-3 text-[11px] text-[#d1d4dc]">
    <strong>Paper Trading</strong><span>Equity {cash(account.equity)} {paperSettings.currency}</span><span>Open {positions.length}</span>
  </button>;
  const corruptBackup=(()=>{try{return localStorage.getItem('plutrade_paper_accounts_corrupt_backup_v1');}catch{return null;}})();
  const exportRecoveredLedger=()=>{
    if(!corruptBackup)return;
    const blob=new Blob([corruptBackup],{type:'application/json'});
    const url=URL.createObjectURL(blob);
    const anchor=document.createElement('a');anchor.href=url;anchor.download='plutrade-paper-ledger-recovery.json';
    anchor.click();URL.revokeObjectURL(url);
  };
  return <section id="paper-trading-open-panel" className={`border-t border-[#2a2e39] bg-[#131722] flex flex-col text-[#d1d4dc] z-20 ${isExpanded?'h-[min(45vh,450px)]':'h-[min(32vh,295px)]'} shrink-0`}>
    <header id="paper-account-header" className="flex items-center gap-3 px-3 py-1.5 border-b border-[#2a2e39] text-[11px] bg-[#171b25] flex-wrap">
      <strong>Paper Trading</strong>
      <div className="relative min-w-0" id="paper-account-selector">
        <button type="button" aria-expanded={accountListOpen} aria-label="Select Paper Trading account"
          onClick={()=>setAccountListOpen(v=>!v)}
          className="inline-flex items-center gap-1 rounded px-2 py-1 border border-[#3c414c] hover:bg-[#323844] text-[#e4e6ec]">
          {account.name} <span className="text-[9px] text-[#babdc7]">{paperSettings.currency}</span><ChevronDown size={13}/>
        </button>
        {accountListOpen&&<div id="paper-account-dropdown" className="absolute left-0 bottom-[calc(100%+4px)] w-[280px] max-h-[310px] overflow-y-auto rounded-lg border border-[#383c44] bg-[#1e2024] shadow-[0_12px_35px_#000a] z-[100] py-1">
          <p className="text-[10px] tracking-wide px-3 py-2 text-[#999da9]">Paper Trading Accounts</p>
          {paperAccounts.map(record=><div key={record.id} className={`group flex items-center gap-1 px-1.5 hover:bg-[#30343d] ${record.id===activePaperAccountId?'bg-[#e5e6e9] text-[#16191f]':'text-[#e7e8ea]'}`}>
            <button type="button" className="flex-1 min-w-0 flex gap-2 items-center px-2 py-2 text-left"
              onPointerDown={e=>{if(e.button!==0)return;heldAccount.current=false;holdStart.current={x:e.clientX,y:e.clientY};cancelAccountHold();accountHold.current=setTimeout(()=>{heldAccount.current=true;setAccountDialog(record.id);setAccountListOpen(false);},450);}}
              onPointerMove={e=>{if(Math.hypot(e.clientX-holdStart.current.x,e.clientY-holdStart.current.y)>10)cancelAccountHold();}}
              onPointerUp={cancelAccountHold} onPointerCancel={cancelAccountHold} onPointerLeave={cancelAccountHold}
              onContextMenu={e=>{e.preventDefault();cancelAccountHold();heldAccount.current=true;setAccountDialog(record.id);setAccountListOpen(false);}}
              onClick={()=>{if(heldAccount.current){heldAccount.current=false;return;}onSelectPaperAccount(record.id);setAccountListOpen(false);}}>
              <span className="truncate">{record.portfolio.account.name}</span>
              <span className="text-[9px] opacity-70">{record.portfolio.settings.currency}</span>
              {record.id===activePaperAccountId&&<Check size={13} className="ml-auto"/>}
            </button>
            <button type="button" title={'Settings for '+record.portfolio.account.name}
              className="p-1.5 rounded opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:bg-[#91949a]/25"
              onClick={e=>{e.stopPropagation();setAccountDialog(record.id);setAccountListOpen(false);}}>
              <Settings2 size={15}/>
            </button>
          </div>)}
          <div className="mt-1 border-t border-[#45484e]">
            <button type="button" className="flex items-center gap-2 w-full px-3 py-3 hover:bg-[#30343d] text-left text-[#e6e8eb]"
              onClick={()=>{setAccountDialog(null);setAccountListOpen(false);}}><Plus size={16}/> Create account…</button>
          </div>
        </div>}
      </div>
      <span id="paper-account-balance">Balance <b>{cash(account.balance)}</b></span>
      <div id="paper-account-summary-row" className="contents">
      <span>Equity <b>{cash(account.equity)}</b></span>
      <span>Realized <b className={account.realizedPnL>=0?'text-[#089981]':'text-[#f23645]'}>{cash(account.realizedPnL)}</b></span>
      <span>Unrealized <b className={account.unrealizedPnL>=0?'text-[#089981]':'text-[#f23645]'}>{cash(account.unrealizedPnL)}</b></span>
      <span>Margin <b>{cash(account.accountMargin)}</b></span>
      <span>Available <b>{cash(account.availableFunds)}</b></span>
      </div>
      <div id="paper-account-window-actions" className="ml-auto flex items-center gap-2">
        <button type="button" onClick={()=>setIsExpanded(v=>!v)} title="Resize paper panel">{isExpanded?<Minimize2 size={13}/>:<Maximize2 size={13}/>}</button>
        <button type="button" onClick={()=>setIsOpen(false)} title="Close paper panel" aria-label="Close Account Window"><X size={16}/></button>
      </div>
    </header>
    <div id="paper-account-market-row" className="flex items-center gap-2 flex-wrap bg-[#1b202d] border-b border-[#303645] px-3 py-2 text-[11px]">
      <strong>{activeAsset.symbol}</strong>
      <span id="paper-account-live-price" className={liveDisplay?'text-[#089981]':'text-[#f4b77c]'}>{priceText}</span>
      <span className="text-[#aeb7ca] capitalize">{activeCategory} · {activeLeverage}×</span>
      <span className="text-[#9299aa]">{feeDescription}</span>
      <span className="text-[#9299aa]" title="Assumptions, not observed market liquidity">
        Execution: {paperSettings.execution.spreadBps} bps spread / {paperSettings.execution.slippageBps} bps slippage (modeled)
      </span>
      <button type="button" disabled={paperTradingBlocked} title={paperTradingBlocked?'Trading locked until storage recovery':'Create simulated order'} onClick={onOpenTicket} className="disabled:opacity-40 disabled:cursor-not-allowed rounded bg-[#2862fb] px-3 py-1.5 font-semibold text-white hover:bg-[#477bf9]">Create Order</button>
      <button type="button" className="ml-auto px-2 py-1 border border-[#5e5460] rounded hover:bg-[#393342]"
        onClick={()=>{if(window.confirm('Reset '+account.name+' and erase all its positions, pending orders, fills and conditional rules?'))onResetPaper();}}>Reset Account</button>
    </div>
    {corruptBackup&&isPaperStorageBlocked()&&<div role="alert" className="px-3 py-1.5 text-[11px] text-[#ffd1a5] bg-[#3a2a22]">
      An old unreadable paper ledger was preserved. It cannot be loaded safely. <button type="button" className="underline font-semibold" onClick={exportRecoveredLedger}>Export recovery backup</button>
      <button type="button" className="underline font-semibold ml-3" onClick={onResolvePaperRecovery}>Start fresh (keep backup)</button>
    </div>}
    {paperTradingBlocked&&<div role="alert" className="px-3 py-1.5 text-[11px] font-semibold text-[#ffd1a5] bg-[#3a2a22]">Paper execution, updates, and conditional orders are locked until the saved ledger is recoverable.</div>}
    {paperError&&<div role="alert" className="px-3 py-1 text-[11px] text-[#ffc5c5] bg-[#51202b]">{paperError}</div>}
    <nav id="paper-account-tabs" aria-label="Paper trading workspace tabs" className="flex flex-nowrap overflow-x-auto items-center gap-1 border-b border-[#2a2e39] px-2 py-1 text-[11px]">
      {tabs.map(([id,name])=><button type="button" key={id} onClick={()=>setTab(id)}
        className={`rounded px-2 py-1 shrink-0 whitespace-nowrap ${tab===id?'bg-[#2a3142] text-white':'text-[#9197a5] hover:bg-[#212633]'}`}>
        {name}{id==='positions'?` (${positions.length})`:id==='orders'?` (${conditionalOrders.length+pendingOrders.length})`:''}
      </button>)}
      <button type="button" className="ml-auto px-2 text-[#a5aabc]" title="Export settled paper executions as CSV" onClick={exportCsv}><Download size={15}/></button>
    </nav>
    <div id="paper-account-workspace-body" className="flex-1 min-h-0 overflow-y-auto text-[11px]">
      {tab==='positions'&&<table className="w-full text-left">
        <thead className="sticky top-0 bg-[#131722] text-[#9aa1b2]"><tr>
          {['Market','Side','Qty','Entry','Last','Leverage','Margin','Unrealized','TP / SL','Actions'].map(x=><th key={x} className="px-2 py-1.5 font-medium">{x}</th>)}
        </tr></thead><tbody>
        {positions.map(p=><React.Fragment key={p.id}><tr className="border-t border-[#303440] hover:bg-[#222735]">
          <td className="px-2 py-1">{p.symbol}<small className="block text-[#8f96a4]">{p.exchange}</small></td>
          <td className={p.side==='Long'?'text-[#18b38a]':'text-[#ed6475]'}>{p.side}</td>
          <td>{amount(p.qty)}</td><td>{amount(p.entryPrice)}</td><td>{amount(p.currentPrice)}<small className="block text-[#818999]">{p.lastMarkedAt&&Date.now()-p.lastMarkedAt>30000?'Stale':'Observed'}</small></td>
          <td>{p.leverage||1}×</td><td>{cash(p.qty*p.entryPrice/(p.leverage||1))}</td>
          <td className={p.unrealizedPnL>=0?'text-[#089981]':'text-[#f23645]'}>{cash(p.unrealizedPnL)} ({p.unrealizedPnLPct.toFixed(2)}%)</td>
          <td>
            {p.tp??'—'} / {p.sl??'—'}
            {p.trailingPercent&&<small className="block text-[#88b2fa]">
              Trailing {p.trailingPercent}% · {p.side==='Long'?'peak':'trough'} {amount(p.trailingAnchor??p.entryPrice)}
            </small>}
            {p.dynamicTrailing&&<small className="block text-[#ffcb87]">
              Dynamic ATR {p.dynamicTrailing.period}/{p.dynamicTrailing.lookback} × {p.dynamicTrailing.multiplier} · {p.dynamicTrailing.timeframe}
              {p.dynamicTrailing.lastBarTime
                ?' · ATR '+amount(p.dynamicTrailing.atr||0)
                :' · Waiting for verified closed bars'}
            </small>}
          </td><td className="flex items-center gap-2 py-2">
            <button title="Add conditional order" onClick={()=>onOpenCreateConditionalOrder({type:'position',label:p.symbol+' position'})}><Zap size={13}/></button>
            <button title="Edit TP and SL" onClick={()=>{setEditId(editId===p.id?null:p.id);
              setEditTp(p.tp?.toString()||'');setEditSl(p.sl?.toString()||'');
              setEditTrailingEnabled(!!p.trailingPercent);
              setEditTrailingPercent(p.trailingPercent?.toString()||'0.50');
              setEditDynamicEnabled(!!p.dynamicTrailing);
              setEditDynamicSettings(p.dynamicTrailing||{...DEFAULT_DYNAMIC_TRAIL});}}><Edit2 size={13}/></button>
            <button title="Close at latest verified price" className="text-[#f77f90]" onClick={()=>onClosePosition(p.id)}><X size={13}/></button>
          </td>
        </tr>
        {editId===p.id&&<tr className="bg-[#202a36]"><td colSpan={10} className="p-2">
          <label>Take profit <input type="number" step="any" min="0" value={editTp} onChange={e=>setEditTp(e.target.value)} className="ml-1 w-24 bg-[#0c1320] rounded px-2"/></label>
          <label className="ml-4">Stop loss <input type="number" step="any" min="0" value={editSl} onChange={e=>setEditSl(e.target.value)} className="ml-1 w-24 bg-[#0c1320] rounded px-2"/></label>
          <label className="ml-4 inline-flex items-center gap-1.5 cursor-pointer">
            <input type="checkbox" aria-label="Trail stop loss for open position"
              checked={editTrailingEnabled} onChange={e=>{
                setEditTrailingEnabled(e.target.checked);
                if(e.target.checked)setEditDynamicEnabled(false);
              }}
              className="accent-[#789ffe]"/>
            Trailing SL
          </label>
          <label className="ml-2 inline-flex items-center gap-1">
            <input type="number" step="any" min="0" max="99.9999"
              aria-label="Existing position trailing stop distance percent"
              disabled={!editTrailingEnabled} value={editTrailingPercent}
              onChange={e=>setEditTrailingPercent(e.target.value)}
              className="w-20 bg-[#0c1320] rounded px-2 disabled:opacity-40"/>%
          </label>
          <div className="mt-2 flex gap-3 items-center flex-wrap border-t border-[#3d4658] pt-2">
            <label className="inline-flex items-center gap-2 text-[#ffcb87]">
              <input type="checkbox" aria-label="Dynamic ATR Chandelier trailing stop"
                checked={editDynamicEnabled} onChange={e=>{
                  setEditDynamicEnabled(e.target.checked);
                  if(e.target.checked)setEditTrailingEnabled(false);
                }} className="accent-[#d6a254]"/>
              Dynamic ATR Chandelier
            </label>
            {editDynamicEnabled&&<>
              <label>ATR bars <input aria-label="Position ATR period" type="number" min="2" max="100"
                value={editDynamicSettings.period}
                onChange={e=>setEditDynamicSettings(v=>({...v,period:Number(e.target.value)}))}
                className="ml-1 w-14 rounded bg-[#111a29] px-1"/></label>
              <label>Lookback <input aria-label="Position dynamic lookback" type="number" min="2" max="100"
                value={editDynamicSettings.lookback}
                onChange={e=>setEditDynamicSettings(v=>({...v,lookback:Number(e.target.value)}))}
                className="ml-1 w-14 rounded bg-[#111a29] px-1"/></label>
              <label>ATR × <input aria-label="Position dynamic ATR multiplier" type="number" min=".25" max="10" step=".25"
                value={editDynamicSettings.multiplier}
                onChange={e=>setEditDynamicSettings(v=>({...v,multiplier:Number(e.target.value)}))}
                className="ml-1 w-16 rounded bg-[#111a29] px-1"/></label>
              <label>Bars
                <select aria-label="Position dynamic timeframe" value={editDynamicSettings.timeframe}
                  onChange={e=>setEditDynamicSettings(v=>({...v,timeframe:e.target.value as DynamicTrailingSettings['timeframe']}))}
                  className="ml-1 rounded bg-[#111a29] px-1">
                  {['1m','5m','15m','1h','4h','1D'].map(tf=><option key={tf} value={tf}>{tf}</option>)}
                </select>
              </label>
            </>}
            <span className="text-[10px] text-[#9fb2d2]">Closed real bars only. A retained fixed stop remains active while ATR warms up; simulated stop fills require a fresh venue trade tick.</span>
          </div>
          <button className="ml-3 text-[#7ea7ff] disabled:opacity-40" disabled={paperTradingBlocked||
            (editDynamicEnabled&&!validDynamicTrail(editDynamicSettings))} onClick={()=>{
            onEditPosition(p.id,editTp?Number(editTp):undefined,editSl?Number(editSl):undefined,
              editDynamicEnabled?null:editTrailingEnabled?Number(editTrailingPercent):null,
              editDynamicEnabled?editDynamicSettings:null);
            setEditId(null);
          }}>Save stops</button>
          <button className="ml-3 text-[#98a1b6]" onClick={()=>setEditId(null)}>Cancel</button>
        </td></tr>}
        </React.Fragment>)}
        {positions.length===0&&<tr><td colSpan={10} className="text-center p-5 text-[#8792a6]">No open paper positions. Enter a quantity, wait for a verified live quote, then buy or short.</td></tr>}
      </tbody></table>}
      {tab==='orders'&&<div className="space-y-2">
        <div className="flex justify-between items-center px-3 pt-2">
          <strong className="text-[#e6e9f0]">Pending entries ({pendingOrders.length})</strong>
          <button className="text-[#79aaff]" onClick={onOpenTicket}>+ Create order</button>
        </div>
        {pendingOrders.map(o=><div key={o.id} className="border-b border-[#313641] p-2 flex items-center gap-3 flex-wrap">
          <strong>{o.symbol}</strong><span className={o.side==='Long'?'text-[#2cbd99]':'text-[#f06a7b]'}>{o.side}</span>
          <span>{o.kind.toUpperCase()} @ {amount(o.price)}{o.kind==='stop-limit'?' → limit '+amount(o.limitPrice||0):''}</span><span>{amount(o.qty)} units · {o.exchange}</span><span className="text-[#a8bcf8]">{o.status==='triggered'?'Activated · waiting for limit':'Pending'}</span>
          <span className="text-[#adb4c3]">Expires: {o.expiresAt?new Date(o.expiresAt).toLocaleString():'GTC'}</span>
          <button type="button" disabled={paperTradingBlocked||o.status!=='pending'}
            className="ml-auto text-[#88b6fc] hover:underline disabled:opacity-40"
            title={o.status==='triggered'?'Triggered stop-limit: cancel and replace via ticket':'Amend resting order'}
            onClick={()=>{
              setEditPendingId(editPendingId===o.id?null:o.id);
              setEditPendingQty(String(o.qty));setEditPendingPrice(String(o.price));
              setEditPendingLimit(o.limitPrice===undefined?'':String(o.limitPrice));
              setEditPendingError('');
            }}>Edit</button>
          <button type="button" disabled={paperTradingBlocked}
            className="text-[#f58b95] hover:underline disabled:opacity-40" onClick={()=>onCancelPendingOrder(o.id)}>Cancel</button>
          {editPendingId===o.id&&<form className="basis-full flex gap-2 items-end flex-wrap border-t border-[#3d4658] pt-2 mt-1"
            onSubmit={event=>{
              event.preventDefault();
              const request:PaperAmendRequest={qty:Number(editPendingQty),price:Number(editPendingPrice),
                limitPrice:o.kind==='stop-limit'?Number(editPendingLimit):undefined};
              if(!editPendingQty.trim()||!editPendingPrice.trim()||
                (o.kind==='stop-limit'&&!editPendingLimit.trim())){
                setEditPendingError('Enter size and required price levels.');return;
              }
              const error=onAmendPendingOrder(o.id,request);
              if(error){setEditPendingError(error);return;}
              setEditPendingError('');setEditPendingId(null);
            }}>
              <label>Units<input aria-label="Amend order units" type="number" min="0" step="any" required
                value={editPendingQty} onChange={e=>setEditPendingQty(e.target.value)}
                className="block w-24 bg-[#111827] border border-[#566074] rounded px-2 py-1"/></label>
              <label>{o.kind==='limit'?'Limit price':'Stop trigger'}
                <input aria-label="Amend order price" type="number" min="0" step="any" required
                  value={editPendingPrice} onChange={e=>setEditPendingPrice(e.target.value)}
                  className="block w-28 bg-[#111827] border border-[#566074] rounded px-2 py-1"/></label>
              {o.kind==='stop-limit'&&<label>Execution limit
                <input aria-label="Amend stop limit price" type="number" min="0" step="any" required
                  value={editPendingLimit} onChange={e=>setEditPendingLimit(e.target.value)}
                  className="block w-28 bg-[#111827] border border-[#566074] rounded px-2 py-1"/></label>}
              <button type="submit" disabled={paperTradingBlocked} className="rounded bg-[#2d61c8] px-3 py-1.5 disabled:opacity-40">Save changes</button>
              <button type="button" onClick={()=>{setEditPendingId(null);setEditPendingError('');}}
                className="rounded border border-[#566074] px-3 py-1.5">Cancel edit</button>
              {editPendingError&&<p role="alert" className="basis-full text-[#ffb4c3]">{editPendingError}</p>}
              <p className="basis-full text-[10px] text-[#9dabca]">Resting orders only. A marketable edit is rejected; submit a reviewed new order instead. Margin and exact venue are rechecked.</p>
            </form>}
        </div>)}
        {!pendingOrders.length&&<p className="text-[#838b9d] px-3 py-2">No pending entries.</p>}
        <div className="border-t border-[#313641]"><ConditionalOrdersTable orders={conditionalOrders} onOpenCreateModal={()=>onOpenCreateConditionalOrder(null)}
          onEditOrder={onEditConditionalOrder} onToggleStatus={onToggleConditionalOrderStatus}
          onDeleteOrder={onDeleteConditionalOrder} onTestTrigger={onTestTriggerConditionalOrder}/></div>
      </div>}
      {tab==='orderHistory'&&<div>
        {orderHistory.length?orderHistory.map(o=><div key={o.id} className="grid grid-cols-6 gap-2 p-2 border-b border-[#313641]">
          <span>{new Date(o.at).toLocaleString()}</span>
          <span>{o.exchange} · {o.symbol}</span>
          <span className="uppercase">{o.side} · {o.kind}</span>
          <span>{amount(o.qty)} units</span>
          <span>{amount(o.price)} {paperSettings.currency}</span>
          <strong className="capitalize">{o.action}</strong>
        </div>):<p className="p-5 text-[#8792a6]">No recorded orders yet.</p>}
      </div>}
      {tab==='balanceHistory'&&<div>
        <div className="flex justify-between px-3 py-2 text-[#a9b1c0]"><span>Starting cash balance</span><strong>{cash(paperSettings.startingBalance)} {paperSettings.currency}</strong></div>
        {balanceRows.map(({fill,balance})=><div key={fill.id} className="grid grid-cols-4 gap-2 p-2 border-b border-[#313641]">
          <span>{new Date(fill.timestamp).toLocaleString()}</span><span>{fill.note} · {fill.symbol}</span>
          <span className={fill.realizedPnL>=0?'text-[#089981]':'text-[#f23645]'}>{fill.realizedPnL>=0?'+':''}{cash(fill.realizedPnL)}</span>
          <strong className="text-right">{cash(balance)} {paperSettings.currency}</strong>
        </div>)}
        <p className="p-2 text-[#818b9d]">Settled balance only. Unrealized equity changes are not historical cash transactions.</p>
      </div>}
      {tab==='activityLog'&&<div>
        {timeline.length?timeline.map(e=><div key={e.id} className="flex gap-4 p-2 border-b border-[#313641]">
          <span className="text-[#919cad] shrink-0">{new Date(e.at).toLocaleString()}</span><span>{e.message}</span>
        </div>):<p className="p-5 text-[#8792a6]">No paper account activity yet.</p>}
      </div>}
      {tab==='tradeHistory'&&<div>
        {closedTrades.length?closedTrades.map(f=><div key={f.id} className="grid grid-cols-6 gap-2 p-2 border-b border-[#313641]">
          <span>{new Date(f.timestamp).toLocaleString()}</span>
          <span>{f.exchange} · {f.symbol}</span>
          <span>{f.note} · {f.side}</span>
          <span>{amount(f.quantity)} units</span>
          <span>{openingFill(f.positionId)?'Entry '+amount(openingFill(f.positionId)!.price):'Entry unavailable'} → {amount(f.price)}</span>
          <strong className={f.realizedPnL>=0?'text-[#089981]':'text-[#f23645]'}>{cash(f.realizedPnL)} {paperSettings.currency}</strong>
        </div>):<p className="p-5 text-[#8792a6]">No closed paper trades yet.</p>}
      </div>}
      <React.Suspense fallback={<div role="status" className="p-4 text-[#adc6ec]">
        Opening selected research workspace…
      </div>}>
        {tab==='cloud'&&<CloudSyncPanel/>}
        {tab==='replay'&&<ReplayBacktestPanel asset={activeAsset} timeframe={activeTimeframe}/>}
        {tab==='strategyLab'&&<StrategyLabPanel asset={activeAsset} timeframe={activeTimeframe} markets={allMarkets}/>}
        {tab==='screener'&&<MarketScreenerPanel assets={allMarkets} onSelect={onSelectScreenedMarket} onAdd={onAddScreenedMarket}/>}
        {tab==='dataHealth'&&<MarketDataHealthPanel health={feedHealth} status={marketStatus}/>}
      </React.Suspense>
      {tab==='risk'&&<RiskCenterPanel portfolio={portfolio} asset={activeAsset} policy={riskPolicy} onChange={onRiskPolicyChange}/>}
      {tab==='analytics'&&<div className="p-4 flex flex-wrap gap-6">
        <span>Starting capital: {paperSettings.startingBalance.toLocaleString()} {paperSettings.currency}</span><span>Completed closes: {fills.filter(f=>f.note.toLowerCase().includes('close')).length}</span>
        <span>Net realized: {cash(account.realizedPnL)} {paperSettings.currency}</span><span>Open P&L: {cash(account.unrealizedPnL)} {paperSettings.currency}</span>
        <span>Equity: {cash(account.equity)} {paperSettings.currency}</span><span>Available: {cash(account.availableFunds)} {paperSettings.currency}</span>
        <section className="w-full space-y-2 border-t border-[#333c4d] pt-3">
          <strong className="text-[#ecf0f7]">All Paper Accounts · Independent Currencies</strong>
          <p className="text-[#99a9be]">Only accounts with the same currency are combined. No exchange rates or synthetic currency conversions are assumed.</p>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead><tr className="text-[#aab6ca]">
                {['Account / Currency','Cash','Equity','Available','Realized','Unrealized','Exposure','At Stops*','Open','Pending','Fees'].map(label=><th key={label} className="px-2 py-1 whitespace-nowrap">{label}</th>)}
              </tr></thead>
              <tbody>{portfolioSummary.accounts.map(row=><tr key={row.id} className="border-t border-[#3a4556]">
                <td className="px-2 py-1 whitespace-nowrap">{row.name} · {row.currency}</td>
                <td>{cash(row.cash)}</td><td>{cash(row.equity)}</td><td>{cash(row.available)}</td>
                <td>{cash(row.realized)}</td><td>{cash(row.unrealized)}</td>
                <td>{cash(row.grossNotional)}</td><td>{cash(row.stopScenarioRisk)}</td>
                <td>{row.positions}</td><td>{row.pending}</td><td>{cash(row.settledFees)}</td>
              </tr>)}
              {portfolioSummary.byCurrency.map(row=><tr key={row.currency} className="border-t border-[#4b5c76] bg-[#222c3b] font-semibold">
                <td className="px-2 py-1 whitespace-nowrap">Total · {row.currency} ({row.accounts})</td>
                <td>{cash(row.cash)}</td><td>{cash(row.equity)}</td><td>{cash(row.available)}</td>
                <td>{cash(row.realized)}</td><td>{cash(row.unrealized)}</td>
                <td>{cash(row.grossNotional)}</td><td>{cash(row.stopScenarioRisk)}</td>
                <td>{row.positions}</td><td>{row.pending}</td><td>{cash(row.fees)}</td>
              </tr>)}
              </tbody>
            </table>
          </div>
          <p className="text-[#9aa9bc]">*Stop-based losses are hypothetical, not guaranteed maximum losses. Accounts with unprotected positions may lose more than shown.</p>
        </section>
      </div>}
    </div>
    {accountDialog!==undefined&&createPortal(
      <PaperAccountModal existing={paperAccounts.find(a=>a.id===accountDialog)}
        proposedName={`Primary ${String(paperAccounts.length+1).padStart(3,'0')}`}
        onClose={()=>setAccountDialog(undefined)}
        onSave={(name,settings)=>onSavePaperAccount(accountDialog,name,settings)}
        onDelete={accountDialog!==null&&paperAccounts.length>1?
          ()=>onDeletePaperAccount(accountDialog):undefined}/>,document.body)}
  </section>;
};
