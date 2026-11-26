import React,{useEffect,useRef,useState} from 'react';
import {useExclusiveWindow} from '../services/exclusiveWindow';
import type {Asset,PaperPosition} from '../types';
import type {PaperExitMode} from '../services/paperOrders';
import {exitPriceFromValue,exitValueFromPrice} from '../services/paperOrders';
import {DEFAULT_DYNAMIC_TRAIL,validDynamicTrail,DYNAMIC_TRAIL_TIMEFRAMES,type DynamicTrailingSettings} from '../services/dynamicTrailing';

type ExitKind='sl'|'tp';
interface Props {
  asset:Asset;
  position:PaperPosition|null;
  accountEquity:number;
  availableEquity:number;
  accountBalance:number;
  activeAccountName?:string|null;
  activeAccountId?:string|null;
  availableAccounts?:Array<{id:string;name:string;currency:string}>;
  onSelectAccount?:(id:string)=>void;
  onManageAccounts?:()=>void;
  onEditAccount?:(id:string)=>void;
  accountCurrency?:string;
  accountUnrealizedPnl?:number;
  quickSize:{mode:'equity'|'cash';value:number};
  onQuickSize:(size:{mode:'equity'|'cash';value:number})=>void;
  preparedExits:Partial<Record<ExitKind,{mode:PaperExitMode;value:string}>>;
  onPrepareExit:(kind:ExitKind,draft:{mode:PaperExitMode;value:string})=>void;
  onClearPreparedExit:(kind:ExitKind)=>void;
  onEnter:(focus?:ExitKind)=>void;
  onOpenOrder:()=>void;
  orderSetupSaved?:boolean; orderWindowOpen?:boolean; onResetOrderSetup?:()=>void;
  onResetPositionExit?:(id:string,kind:ExitKind)=>void;
  onOpenPaperWorkspace?:()=>void;
  onExit:()=>void;
  onEditStops:(id:string,tp?:number,sl?:number,trailing?:number|null,dynamic?:DynamicTrailingSettings|null)=>void;
  onEditTargets:(id:string,levels:Array<{price:number;sharePercent:number}>)=>void;
  onAdvancedConditional:()=>void;
  editRequest?:{id:string;kind:ExitKind;seq:number}|null;
}
const methods:{mode:PaperExitMode;label:string}[]=[
  {mode:'price',label:'Exact Price'},{mode:'ticks',label:'Price Ticks'},
  {mode:'percent',label:'Distance %'},{mode:'money',label:'Account Currency Amount'},
  {mode:'balance',label:'% of Account Balance'},
];
const numeric=(n:number,digits=6)=>Number.isFinite(n)?n.toLocaleString(undefined,{maximumFractionDigits:digits}):'—';

/** A single, always-visible mobile trade row. Long-press SL/TP to reveal all
 * supported exit types without making a tap on a small screen execute a trade. */
export const MobileTradingControls:React.FC<Props>=({
  asset,position,accountEquity,availableEquity,accountBalance,activeAccountName,activeAccountId,
  availableAccounts=[],onSelectAccount,onManageAccounts,onEditAccount,accountCurrency='USD',
  accountUnrealizedPnl=0,quickSize,onQuickSize,preparedExits,onPrepareExit,onClearPreparedExit,
  onEnter,onOpenOrder,orderSetupSaved=false,orderWindowOpen=false,onResetOrderSetup,onResetPositionExit,onOpenPaperWorkspace,onExit,onEditStops,onEditTargets,onAdvancedConditional,editRequest,
})=>{
  const [panel,setPanel]=useExclusiveWindow<'equity'|ExitKind|null>(null);
  const [advanced,setAdvanced]=useState(false);
  const [mode,setMode]=useState<PaperExitMode>('percent');
  const [value,setValue]=useState('1');
  const [multiTargets,setMultiTargets]=useState(false);
  const [targetDrafts,setTargetDrafts]=useState<Array<{id:number;price:string;share:string}>>([]);
  const [trail,setTrail]=useState(false);
  const [dynamic,setDynamic]=useState(false);
  const [dynamicSettings,setDynamicSettings]=useState<DynamicTrailingSettings>({...DEFAULT_DYNAMIC_TRAIL});
  const [trailPercent,setTrailPercent]=useState('0.50');
  const [sizeModeDraft,setSizeModeDraft]=useState<'equity'|'cash'>(quickSize.mode);
  const [sizeDraft,setSizeDraft]=useState(String(quickSize.value));
  const [error,setError]=useState('');
  const [accountMenuOpen,setAccountMenuOpen]=useExclusiveWindow(false);
  const accountHoldTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const accountHeld=useRef(false);
  const accountHoldPoint=useRef({x:0,y:0});
  const cancelAccountHold=()=>{if(accountHoldTimer.current!==null){clearTimeout(accountHoldTimer.current);accountHoldTimer.current=null;}};
  useEffect(()=>()=>{if(accountHoldTimer.current!==null)clearTimeout(accountHoldTimer.current);},[]);
  const [pnlMenu,setPnlMenu]=useExclusiveWindow<'cash'|'percent'|null>(null);
  const [pnlScope,setPnlScope]=useState<'account'|'position'>(()=>{
    try{return localStorage.getItem('plutrade_mobile_unrealized_scope_v1')==='position'?'position':'account';}
    catch{return 'account';}
  });
  const [pnlCompact,setPnlCompact]=useState<boolean>(()=>{
    try{return localStorage.getItem('plutrade_mobile_unrealized_compact_v1')!=='false';}
    catch{return true;}
  });
  const [pnlDigits,setPnlDigits]=useState<0|1|2>(()=>{
    try{const saved=Number(localStorage.getItem('plutrade_mobile_unrealized_digits_v1'));return saved===0||saved===1||saved===2?saved:2;}
    catch{return 2;}
  });
  useEffect(()=>{
    try{
      localStorage.setItem('plutrade_mobile_unrealized_scope_v1',pnlScope);
      localStorage.setItem('plutrade_mobile_unrealized_compact_v1',String(pnlCompact));
      localStorage.setItem('plutrade_mobile_unrealized_digits_v1',String(pnlDigits));
    }catch(error){console.warn('Could not persist mobile unrealized P/L preferences',error);}
  },[pnlScope,pnlCompact,pnlDigits]);
  const holdTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const held=useRef(false);
  const orderHoldTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const orderHeld=useRef(false);
  const sizeHoldTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const sizeHeld=useRef(false);
  const clearSizeHold=()=>{if(sizeHoldTimer.current!==null){clearTimeout(sizeHoldTimer.current);sizeHoldTimer.current=null;}};
  useEffect(()=>()=>clearSizeHold(),[]);
  const clearOrderHold=()=>{
    if(orderHoldTimer.current){clearTimeout(orderHoldTimer.current);orderHoldTimer.current=null;}
  };
  const lastPosition=useRef<string|null>(null);
  const clearHold=()=>{if(holdTimer.current!==null){clearTimeout(holdTimer.current);holdTimer.current=null;}};

  const openExit=(kind:ExitKind,showAll=false)=>{
    setError('');
    setPanel(kind);
    setAdvanced(showAll||(kind==='tp'&&!!position?.tpLevels?.length));
    const prior=position?.tpLevels||[];
    setMultiTargets(kind==='tp'&&prior.length>0);
    setTargetDrafts(prior.map((level,i)=>({
      id:i+1,price:String(level.price),share:String(Number((level.quantity/(position?.qty||1)*100).toPrecision(7))),
    })));
    setTrail(kind==='sl'&&!!position?.trailingPercent);
    setDynamic(kind==='sl'&&!!position?.dynamicTrailing);
    setDynamicSettings(position?.dynamicTrailing||{...DEFAULT_DYNAMIC_TRAIL});
    setTrailPercent(String(position?.trailingPercent||0.5));
    const priorDraft=!position?preparedExits[kind]:undefined;
    const existing=kind==='sl'?position?.sl:position?.tp;
    if(priorDraft){setMode(priorDraft.mode);setValue(priorDraft.value);}
    else if(existing!==undefined&&existing>0){
      setMode('price');
      setValue(String(existing));
    }else{
      setMode('percent');
      setValue(kind==='sl'?'1':'2');
    }
  };
  useEffect(()=>{
    if(editRequest&&position?.id===editRequest.id)openExit(editRequest.kind,true);
    // Only a new request sequence may open the editor, not each price tick.
  },[editRequest?.seq]);
  useEffect(()=>{
    if(lastPosition.current!==position?.id){
      lastPosition.current=position?.id||null;
      setPanel(null);
    }
  },[position?.id]);
  useEffect(()=>()=>clearHold(),[]);
  const resetExit=(kind:ExitKind)=>{
    if(position){
      const has=kind==='sl'?(position.sl!==undefined||!!position.trailingPercent||!!position.dynamicTrailing):(position.tp!==undefined||!!position.tpLevels?.length);
      if(has&&window.confirm('Remove the '+(kind==='sl'?'Stop Loss':'Take Profit')+' from this open paper position?'))onResetPositionExit?.(position.id,kind);
    }else onClearPreparedExit(kind);
    setPanel(null);setError('');
  };
  const startHold=(kind:ExitKind)=>{
    clearHold();held.current=false;
    holdTimer.current=setTimeout(()=>{held.current=true;resetExit(kind);},450);
  };
  const clickExit=(kind:ExitKind)=>{
    clearHold();
    if(held.current){held.current=false;return;}
    if(panel===kind){setPanel(null);setError('');return;}
    openExit(kind);
  };
  const tick=10**(-Math.min(Math.max(asset.digits||2,0),10));
  const selectedKind=panel==='sl'||panel==='tp'?panel:null;
  const raw=Number(value);
  const target=selectedKind&&position?
    exitPriceFromValue(position.entryPrice,position.qty,position.side,selectedKind,mode,raw,tick,accountBalance):undefined;
  const validTarget=!!target&&Number.isFinite(target)&&!!position&&
    (selectedKind==='sl'?(position.side==='Long'?target<position.currentPrice:target>position.currentPrice):
      (position.side==='Long'?target>position.entryPrice:target<position.entryPrice));
  const validTrail=Number.isFinite(Number(trailPercent))&&Number(trailPercent)>0&&Number(trailPercent)<100;
  const saveExit=()=>{
    if(!position||!selectedKind)return;
    if(selectedKind==='tp'&&multiTargets){
      const targets=targetDrafts.map(level=>({price:Number(level.price),sharePercent:Number(level.share)}));
      const sum=targets.reduce((total,level)=>total+level.sharePercent,0);
      if(targets.length<1||targets.length>6||targets.some(level=>
        !Number.isFinite(level.price)||level.price<=0||!Number.isFinite(level.sharePercent)||level.sharePercent<=0||
        (position.side==='Long'?level.price<=Math.max(position.entryPrice,position.currentPrice):
          level.price>=Math.min(position.entryPrice,position.currentPrice)))||
        !Number.isFinite(sum)||Math.abs(sum-100)>0.001){
        setError('Enter 1–6 profitable future-price targets with positive sizes totaling exactly 100% of remaining quantity.');
        return;
      }
      onEditTargets(position.id,targets);
    }else if(selectedKind==='sl'&&dynamic){
      if(!validDynamicTrail(dynamicSettings)){setError('Dynamic ATR period/lookback must be 2–100 and the multiplier 0.25–10.');return;}
      onEditStops(position.id,position.tp,position.sl,null,dynamicSettings);
    }else if(selectedKind==='sl'&&trail){
      if(!validTrail){setError('Trail must be greater than 0% and less than 100%.');return;}
      onEditStops(position.id,position.tp,position.sl,Number(trailPercent),null);
    }else{
      if(!validTarget){setError('Choose a positive price on the correct side of the entry.');return;}
      if(selectedKind==='tp'&&position.tpLevels?.length){
        // Explicitly converting a previous split to a single 100% target.
        onEditTargets(position.id,[{price:target!,sharePercent:100}]);
      }else{
        onEditStops(position.id,selectedKind==='tp'?target:position.tp,
          selectedKind==='sl'?target:position.sl);
      }
    }
    setPanel(null);
  };
  const changeMethod=(next:PaperExitMode)=>{
    if(position&&selectedKind&&validTarget){
      setValue(String(Number(exitValueFromPrice(position.entryPrice,position.qty,
        position.side,selectedKind,next,target!,tick,accountBalance).toPrecision(9))));
    }
    setMode(next);
  };
  const hasPosition=!!position;
  const showPosition=pnlScope==='position'&&hasPosition;
  const displayedPnl=showPosition?position!.unrealizedPnL:accountUnrealizedPnl;
  const pnlDenominator=showPosition?0:Math.abs(accountBalance);
  const displayedPct=showPosition?position!.unrealizedPnLPct:
    (pnlDenominator>1e-9?accountUnrealizedPnl/pnlDenominator*100:null);
  const compactMoney=(value:number)=>{
    const amount=Math.abs(value);
    if(!Number.isFinite(value))return '—';
    if(!pnlCompact)return value.toLocaleString(undefined,{maximumFractionDigits:2,minimumFractionDigits:2});
    const abbr=amount>=1e9?(amount/1e9).toFixed(1)+'B':
      amount>=1e6?(amount/1e6).toFixed(1)+'M':
      amount>=1e3?(amount/1e3).toFixed(1)+'K':
      amount>=100?amount.toFixed(0):amount.toFixed(2);
    return (value<0?'-':value>0?'+':'')+abbr;
  };
  const moneyLabel=(value:number)=>value.toLocaleString(undefined,{style:'currency',
    currency:accountCurrency||'USD',maximumFractionDigits:2});
  const baseButton='flex-[1_1_0%] min-w-0 h-[21px] rounded border border-[#3c4658] bg-[#232b39] px-px text-[10px] leading-[19px] font-semibold tracking-tight text-[#d6e2f4] active:bg-[#355172] touch-manipulation';
  const close=()=>{clearHold();setPanel(null);setError('');};
  const orderControlsRef=useRef<HTMLDivElement>(null);
  const quickPanelRef=useRef<HTMLDivElement>(null);
  const scopeMenuRef=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    if(!panel&&!accountMenuOpen&&!pnlMenu)return;
    const outside=(event:PointerEvent)=>{
      if(!orderControlsRef.current?.contains(event.target as Node)&&
         !quickPanelRef.current?.contains(event.target as Node)&&
         !scopeMenuRef.current?.contains(event.target as Node)){
        clearHold();setPanel(null);setAccountMenuOpen(false);setPnlMenu(null);setError('');
      }
    };
    const escape=(event:KeyboardEvent)=>{
      if(event.key==='Escape'){clearHold();setPanel(null);setAccountMenuOpen(false);setPnlMenu(null);setError('');}
    };
    window.addEventListener('pointerdown',outside,true);
    window.addEventListener('keydown',escape);
    return ()=>{
      window.removeEventListener('pointerdown',outside,true);
      window.removeEventListener('keydown',escape);
    };
  },[panel,accountMenuOpen,pnlMenu]);
  return <div ref={orderControlsRef} id="plutrade-mobile-trade-controls"
    className="relative md:hidden shrink-0 w-full h-[24px] border-t border-[#3f4d62] bg-[#151d2b] px-1 py-px z-40">
    {panel&&<div ref={quickPanelRef} role="dialog" id="compact-quick-window" aria-label={panel==='equity'?'Equity allocation':panel==='sl'?'Stop loss options':'Take profit options'}
      className="absolute bottom-full left-0 right-0 z-50 max-h-[min(67dvh,440px)] overflow-y-auto rounded-t-xl border border-[#48556a] bg-[#182233] p-3 shadow-[0_-10px_45px_#000a] text-xs">
      <div className="flex items-center justify-between mb-3">
        <strong>{panel==='equity'?'Entry Size · Available Equity':panel==='sl'?'Stop Loss':'Take Profit'} <span className="font-normal text-[#8da0bd]">· Paper</span></strong>
        <button type="button" onClick={close} aria-label="Close quick options" className="p-1 rounded hover:bg-[#35435b]">✕</button>
      </div>
      {panel==='equity'?<>
        <div className="grid grid-cols-2 gap-2" role="group" aria-label="Order size basis">
          <button type="button" aria-pressed={sizeModeDraft==='equity'}
            onClick={()=>{setSizeModeDraft('equity');setSizeDraft(String(quickSize.mode==='equity'?quickSize.value:99));setError('');}}
            className={'rounded border px-2 py-2 font-semibold '+(sizeModeDraft==='equity'?'border-[#709fff] bg-[#234577]':'border-[#526079]')}>
            % Available Equity
          </button>
          <button type="button" aria-pressed={sizeModeDraft==='cash'}
            onClick={()=>{setSizeModeDraft('cash');setSizeDraft(String(quickSize.mode==='cash'?quickSize.value:Math.min(availableEquity,100)));setError('');}}
            className={'rounded border px-2 py-2 font-semibold '+(sizeModeDraft==='cash'?'border-[#709fff] bg-[#234577]':'border-[#526079]')}>
            Cash Amount
          </button>
        </div>
        <label className="block mt-3 text-[#a9bbd0]">{sizeModeDraft==='equity'?'Percent of Available Equity':'Cash Margin Amount ('+accountCurrency+')'}
          <div className="flex items-center gap-2 mt-1">
            <input aria-label={sizeModeDraft==='equity'?'Percent of equity':'Cash Margin Amount'} type="number"
              min="0.000001" max={sizeModeDraft==='equity'?100:undefined} step="any"
              className="flex-1 min-w-0 h-10 rounded bg-[#0d1728] border border-[#526079] px-2 text-white"
              value={sizeDraft} onChange={e=>{setSizeDraft(e.target.value);setError('');}}/>
            <span>{sizeModeDraft==='equity'?'%':accountCurrency}</span>
          </div>
        </label>
        {sizeModeDraft==='equity'&&<div className="flex gap-1.5 mt-2">{[10,25,50,75,99,100].map(n=><button key={n} type="button"
          onClick={()=>setSizeDraft(String(n))} className="flex-1 min-w-0 rounded border border-[#43516a] p-1.5">{n}</button>)}</div>}
        <p className="mt-2 text-[#93a4bd]">
          Available equity: {numeric(availableEquity,2)} {accountCurrency}.
          {sizeModeDraft==='equity'?' Percent is calculated from current free funds, not original or total equity.':' This amount is allocated as entry margin, not leveraged notional.'}
          Orders still require a verified quote and sufficient margin after commissions.
        </p>
        <button type="button" className="mt-3 w-full rounded bg-[#2962ff] text-white p-2 font-semibold"
          onClick={()=>{
            const n=Number(sizeDraft);
            if(!sizeDraft.trim()||!Number.isFinite(n)||n<=0||
              (sizeModeDraft==='equity'&&n>100)||(sizeModeDraft==='cash'&&n>availableEquity)){
              setError(sizeModeDraft==='equity'?'Use a percentage above zero, up to 100%.':'Enter a positive cash amount no larger than available equity.');
              return;
            }
            onQuickSize({mode:sizeModeDraft,value:n});close();
          }}>
          Save
        </button>
      </>:position&&selectedKind?<>
        <p className="mb-2 text-[#96abc3]">{position.side} · {position.symbol} · Entry {numeric(position.entryPrice,asset.digits)} · {numeric(position.qty)} units</p>
        <div className="flex items-center justify-between gap-2">
          <label className="flex-1 text-[#b7c8dc]">Level Type
            <select aria-label="Exit level type" value={mode} onChange={e=>changeMethod(e.target.value as PaperExitMode)}
              className="block w-full h-9 mt-1 rounded border border-[#53627a] bg-[#111b2a] px-2 text-white">
              {methods.map(method=><option key={method.mode} value={method.mode}>{method.label}</option>)}
            </select>
          </label>
          <button type="button" className="self-end h-9 rounded border border-[#53627a] px-2"
            aria-expanded={advanced} onClick={()=>setAdvanced(v=>!v)}>{advanced?'Less':'Options'}</button>
        </div>
        {!(selectedKind==='tp'&&multiTargets)&&<>
          <label className="block mt-3 text-[#b7c8dc]">Value
            <input aria-label="Exit level value" type="number" min="0" step="any" value={value}
              onChange={e=>{setValue(e.target.value);setError('');}}
              className="block w-full h-10 mt-1 rounded border border-[#53627a] bg-[#111b2a] px-2 text-white"/>
          </label>
          <p className="text-[#93a8c4] mt-1">Price Level: {validTarget?numeric(target!,asset.digits):'Invalid'} {asset.currency}</p>
        </>}
        {selectedKind==='sl'&&advanced&&<div className="mt-3 border-t border-[#39495f] pt-3">
          <label className="flex items-center gap-2"><input type="checkbox" checked={trail}
            onChange={e=>{setTrail(e.target.checked);if(e.target.checked)setDynamic(false);}}/>
            Percent trailing stop (follows favorable price only)
          </label>
          {trail&&<label className="block mt-2">Trailing distance %
            <input type="number" aria-label="Trailing stop percent" min="0" max="99.99" step="any"
              className="block mt-1 h-9 w-full rounded border border-[#53627a] bg-[#111b2a] px-2 text-white"
              value={trailPercent} onChange={e=>setTrailPercent(e.target.value)}/>
          </label>}
          <label className="flex items-center gap-2 mt-3"><input type="checkbox" checked={dynamic}
            onChange={e=>{setDynamic(e.target.checked);if(e.target.checked)setTrail(false);}}/>
            Dynamic ATR Chandelier trailing stop
          </label>
          {dynamic&&<div className="grid grid-cols-2 gap-2 mt-2">
            <label>ATR period
              <input type="number" aria-label="Mobile ATR period" min="2" max="100" step="1"
                className="block w-full h-9 mt-1 rounded border border-[#53627a] bg-[#111b2a] px-2"
                value={dynamicSettings.period} onChange={e=>setDynamicSettings(p=>({...p,period:Number(e.target.value)}))}/>
            </label>
            <label>High/low lookback
              <input type="number" aria-label="Mobile ATR lookback" min="2" max="100" step="1"
                className="block w-full h-9 mt-1 rounded border border-[#53627a] bg-[#111b2a] px-2"
                value={dynamicSettings.lookback} onChange={e=>setDynamicSettings(p=>({...p,lookback:Number(e.target.value)}))}/>
            </label>
            <label>ATR multiplier
              <input type="number" aria-label="Mobile ATR multiplier" min=".25" max="10" step=".25"
                className="block w-full h-9 mt-1 rounded border border-[#53627a] bg-[#111b2a] px-2"
                value={dynamicSettings.multiplier} onChange={e=>setDynamicSettings(p=>({...p,multiplier:Number(e.target.value)}))}/>
            </label>
            <label>Timeframe
              <select aria-label="Mobile ATR timeframe"
                className="block w-full h-9 mt-1 rounded border border-[#53627a] bg-[#111b2a] px-2"
                value={dynamicSettings.timeframe}
                onChange={e=>setDynamicSettings(p=>({...p,timeframe:e.target.value as DynamicTrailingSettings['timeframe']}))}>
                {DYNAMIC_TRAIL_TIMEFRAMES.map(tf=><option key={tf} value={tf}>{tf}</option>)}
              </select>
            </label>
          </div>}
          <p className="mt-1 text-[10px] text-[#93a8c4]">Trailing protection never loosens an achieved stop. Dynamic ATR requires completed verified candle history; no stop level is invented while awaiting bars.</p>
        </div>}
        {selectedKind==='tp'&&advanced&&<div className="mt-3 border-t border-[#39495f] pt-3">
          <label className="flex items-center gap-2"><input type="checkbox" checked={multiTargets}
            onChange={e=>{
              const enabled=e.target.checked;
              setMultiTargets(enabled);
              if(enabled&&!targetDrafts.length)setTargetDrafts([
                {id:1,price:position.tp?String(position.tp):'',share:'50'},
                {id:2,price:'',share:'50'},
              ]);
              setError('');
            }}/>
            Multiple take-profit levels
          </label>
          {multiTargets&&<>
            <p className="mt-1 text-[#91a4bb] text-[10px]">Allocate 100% of remaining units across prices. Editing replaces the unfilled targets, not past fills.</p>
            {targetDrafts.map((entry,i)=><div key={entry.id} className="flex items-end gap-1.5 mt-2">
              <label className="flex-1 min-w-0">TP {i+1} price
                <input type="number" min="0" step="any" aria-label={'Mobile TP '+(i+1)+' price'}
                  value={entry.price} onChange={e=>setTargetDrafts(prev=>prev.map(x=>x.id===entry.id?
                    {...x,price:e.target.value}:x))}
                  className="block w-full mt-1 h-9 rounded border border-[#53627a] bg-[#111b2a] px-2"/>
              </label>
              <label className="w-20 shrink-0">Close %
                <input type="number" min="0" max="100" step="any" aria-label={'Mobile TP '+(i+1)+' percent'}
                  value={entry.share} onChange={e=>setTargetDrafts(prev=>prev.map(x=>x.id===entry.id?
                    {...x,share:e.target.value}:x))}
                  className="block w-full mt-1 h-9 rounded border border-[#53627a] bg-[#111b2a] px-2"/>
              </label>
              <button type="button" title={'Remove TP '+(i+1)} className="h-9 px-2 rounded border border-[#624354] text-[#f4a9b8]"
                onClick={()=>setTargetDrafts(prev=>prev.filter(x=>x.id!==entry.id))}>×</button>
            </div>)}
            <p className="mt-2 text-[#a3b4c8]">Allocated {numeric(targetDrafts.reduce((n,x)=>n+(Number(x.share)||0),0),2)}%</p>
            {targetDrafts.length<6&&<button type="button"
              className="mt-2 rounded border border-[#53627a] px-2 py-1.5 text-[#a7c5ff]"
              onClick={()=>setTargetDrafts(prev=>[...prev,{
                id:Math.max(0,...prev.map(x=>x.id))+1,price:'',share:'',
              }])}>+ Add TP Level</button>}
          </>}
        </div>}
        {advanced&&<button type="button" onClick={()=>{close();onAdvancedConditional();}}
          className="mt-2 text-[#9cc2ff] underline">Advanced Conditional Price/Drawing Rule</button>}
        <button type="button" onClick={saveExit}
          className="mt-3 w-full rounded bg-[#2962ff] text-white p-2.5 font-semibold">
          Save
        </button>
      </>:<>
        <p className="text-[#b7c6da]">Prepare the {selectedKind==='sl'?'stop loss':'take profit'} for the next entry.
          This saves order settings only. It does not open or close a trade.</p>
        <label className="block mt-3 text-[#b7c8dc]">Level Type
          <select aria-label="Exit level type" value={mode}
            onChange={e=>{setMode(e.target.value as PaperExitMode);setError('');}}
            className="block w-full h-9 mt-1 rounded border border-[#53627a] bg-[#111b2a] px-2 text-white">
            {methods.map(method=><option key={method.mode} value={method.mode}>{method.label}</option>)}
          </select>
        </label>
        <label className="block mt-3 text-[#b7c8dc]">Value
          <input aria-label="Exit level value" type="number" min="0" step="any" value={value}
            onChange={e=>{setValue(e.target.value);setError('');}}
            className="block w-full h-10 mt-1 rounded border border-[#53627a] bg-[#111b2a] px-2 text-white"/>
        </label>
        <button type="button" className="mt-3 w-full rounded bg-[#2962ff] text-white p-2.5 font-semibold"
          onClick={()=>{
            const number=Number(value);
            if(!value.trim()||!Number.isFinite(number)||number<=0||
              (mode==='percent'&&number>=100&&panel==='sl')){
              setError('Enter a positive, valid distance or price.');return;
            }
            onPrepareExit(panel as ExitKind,{mode,value});close();
          }}>Save</button>
        {selectedKind&&preparedExits[selectedKind]&&
          <button type="button" aria-label={'Clear '+selectedKind.toUpperCase()+' setup'}
            className="mt-2 w-full rounded border border-[#6b4557] p-2 text-[#ffb4be]"
            onClick={()=>{onClearPreparedExit(selectedKind);close();}}>
            Clear {selectedKind.toUpperCase()} Setup
          </button>}

      </>}
      {error&&<p role="alert" className="mt-2 text-[#ff9eac]">{error}</p>}
    </div>}
    <div ref={scopeMenuRef} className="absolute bottom-full left-0 right-0 z-[80] text-[11px]">
      {accountMenuOpen&&<section id="mobile-account-picker" role="dialog" aria-label="Choose trading account"
        className="mb-1 max-h-[min(50dvh,320px)] overflow-y-auto rounded border border-[#425574] bg-[#172538] p-2 text-[#e2ebfb] shadow-2xl">
        <div className="mb-1 text-[11px] font-bold">Active Trading Account</div>
        {availableAccounts.length===0&&<p className="text-[#94a6c0]">No account loaded</p>}
        {availableAccounts.map(account=><button type="button" key={account.id}
          aria-label={'Use account '+account.name} aria-pressed={account.id===activeAccountId}
          className={'flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left hover:bg-[#344763] '+(account.id===activeAccountId?'bg-[#263e60]':'')}
          onPointerDown={e=>{if(e.button!==0||!onEditAccount)return;accountHeld.current=false;accountHoldPoint.current={x:e.clientX,y:e.clientY};cancelAccountHold();accountHoldTimer.current=setTimeout(()=>{accountHeld.current=true;setAccountMenuOpen(false);onEditAccount(account.id);},450);}}
          onPointerMove={e=>{if(Math.hypot(e.clientX-accountHoldPoint.current.x,e.clientY-accountHoldPoint.current.y)>10)cancelAccountHold();}}
          onPointerUp={cancelAccountHold} onPointerCancel={cancelAccountHold} onPointerLeave={cancelAccountHold}
          onContextMenu={e=>{if(!onEditAccount)return;e.preventDefault();cancelAccountHold();accountHeld.current=true;setAccountMenuOpen(false);onEditAccount(account.id);}}
          onClick={()=>{if(accountHeld.current){accountHeld.current=false;return;}onSelectAccount?.(account.id);setAccountMenuOpen(false);}}>
          <span className="min-w-0 flex-1 truncate">{account.name}</span>
          <span className="shrink-0 text-[9px] text-[#9cacc2]">{account.currency}</span>
        </button>)}
        {onManageAccounts&&<button type="button" onClick={()=>{setAccountMenuOpen(false);onManageAccounts();}}
          className="mt-1 w-full rounded border border-[#506383] px-2 py-1.5 text-center text-[#b3ccf2]">
          Manage Accounts
        </button>}
      </section>}
      {pnlMenu&&<section id="mobile-unrealized-options" role="dialog" aria-label="Unrealized P/L display options"
        className="mb-1 rounded border border-[#425574] bg-[#172538] p-2 text-[#e2ebfb] shadow-2xl">
        <strong className="block pb-1 text-[11px]">Unrealized P/L · {accountCurrency}</strong>
        <p className="pb-2 text-[9px] text-[#9caecc]">From your simulated account ledger, not an editable profit amount.</p>
        <div className="flex gap-1.5">
          <button type="button" aria-pressed={pnlScope==='account'} onClick={()=>setPnlScope('account')}
            className={'flex-1 rounded border px-2 py-1.5 '+(pnlScope==='account'?'border-[#72a5fa] bg-[#264a77]':'border-[#41516a]')}>Whole Account</button>
          <button type="button" disabled={!hasPosition} aria-pressed={pnlScope==='position'}
            onClick={()=>setPnlScope('position')}
            className={'flex-1 rounded border px-2 py-1.5 disabled:opacity-40 '+(pnlScope==='position'?'border-[#72a5fa] bg-[#264a77]':'border-[#41516a]')}>Active Position</button>
        </div>
        {pnlMenu==='cash'?<label className="mt-2 flex items-center gap-2">
          <input type="checkbox" checked={pnlCompact} onChange={e=>setPnlCompact(e.target.checked)}/>
          Compact money (K/M/B)
        </label>:<label className="mt-2 flex items-center justify-between gap-2">
          Decimal places
          <select aria-label="UP/L percent precision" className="rounded border border-[#52627d] bg-[#132033] px-2 py-1"
            value={pnlDigits} onChange={e=>setPnlDigits(Number(e.target.value) as 0|1|2)}>
            <option value={0}>0</option><option value={1}>1</option><option value={2}>2</option>
          </select>
        </label>}
        <button type="button" className="mt-2 w-full rounded bg-[#2962ff] py-1" onClick={()=>setPnlMenu(null)}>Done</button>
      </section>}
    </div>
    <div className="flex w-full min-w-0 items-center gap-[2px]" aria-label="Mobile trading controls">
      <button type="button" id="mobile-active-account-btn"
        aria-label={'Trading account '+(activeAccountName||'Account')}
        aria-expanded={accountMenuOpen}
        title={'Active account: '+(activeAccountName||'Account')}
        className="flex-[1.45_1_0%] min-w-0 h-[21px] rounded border border-[#56637b] bg-[#243147] px-[1px] text-[clamp(7px,2.2vw,10px)] font-semibold text-[#e3ecfc] truncate"
        onClick={()=>{setPanel(null);setPnlMenu(null);setAccountMenuOpen(v=>!v);}}>
        <span className="block truncate">{activeAccountName||'Account'}</span>
      </button>

      <button type="button" id="mobile-order-ticket-btn"
        aria-label="Order" aria-pressed={orderSetupSaved||orderWindowOpen} title="Order Setup · Hold to Reset Saved Setup"
        className={baseButton+' '+(orderSetupSaved||orderWindowOpen?'border-[#709fff] bg-[#2962ff] text-white':'border-[#4d6994] bg-[#253651] text-white')}
        onPointerDown={()=>{
          orderHeld.current=false;
          clearOrderHold();
          if(onOpenPaperWorkspace)orderHoldTimer.current=setTimeout(()=>{
            orderHeld.current=true;if(orderSetupSaved||orderWindowOpen)onResetOrderSetup?.();else onOpenPaperWorkspace();
          },550);
        }}
        onPointerUp={clearOrderHold} onPointerCancel={clearOrderHold} onPointerLeave={clearOrderHold}
        onContextMenu={e=>{e.preventDefault();clearOrderHold();orderHeld.current=true;if(orderSetupSaved||orderWindowOpen)onResetOrderSetup?.();else onOpenPaperWorkspace?.();}}
        onClick={()=>{if(!orderHeld.current)onOpenOrder();orderHeld.current=false;}}>
        Order
      </button>
      <button type="button" id="mobile-upl-cash" aria-label="Unrealized profit loss amount"
        title={'Unrealized P/L: '+moneyLabel(displayedPnl)+' · '+(showPosition?'active position':'whole account')}
        aria-expanded={pnlMenu==='cash'}
        className={baseButton+' flex-[1.35_1_0%] !flex !flex-col !justify-center !items-center !bg-[#1c2a3d] !border-[#4b586e] !leading-[10px]'}
        onClick={()=>{setAccountMenuOpen(false);setPanel(null);setPnlMenu(v=>v==='cash'?null:'cash');}}>
        <span className="block w-full truncate text-center text-[10px] font-semibold tracking-tight text-[#a9bbd2]">{accountCurrency==='USD'?'UP/L$':'UP/L '+accountCurrency}</span>
        <span className={'block w-full truncate text-center text-[10px] font-semibold tracking-tight tabular-nums '+(displayedPnl>=0?'text-[#64e6b9]':'text-[#ff95a4]')}>
          {compactMoney(displayedPnl)}
        </span>
      </button>
      <button type="button" id="mobile-upl-percent" aria-label="Unrealized profit loss percent"
        title={'Unrealized P/L percent · '+(showPosition?'active position':'whole account')}
        aria-expanded={pnlMenu==='percent'}
        className={baseButton+' flex-[1.3_1_0%] !flex !flex-col !justify-center !items-center !bg-[#1c2a3d] !border-[#4b586e] !leading-[10px]'}
        onClick={()=>{setAccountMenuOpen(false);setPanel(null);setPnlMenu(v=>v==='percent'?null:'percent');}}>
        <span className="block w-full truncate text-center text-[10px] font-semibold tracking-tight text-[#a9bbd2]">UP/L%</span>
        <span className={'block w-full truncate text-center text-[10px] font-semibold tracking-tight tabular-nums '+(displayedPct===null?'text-[#d1d9e7]':displayedPct>=0?'text-[#64e6b9]':'text-[#ff95a4]')}>
          {displayedPct===null?'—':(displayedPct>0?'+':'')+displayedPct.toFixed(pnlDigits)+'%'}
        </span>
      </button>
      <button type="button" className={baseButton+' border-[#255da9] bg-[#1c426f] text-white'}
        onClick={()=>onEnter()}>Enter</button>
      <button type="button" className={baseButton+' '+(position?'border-[#ad4851] bg-[#49272f] text-white':'opacity-40')}
        disabled={!position} aria-label="Exit paper position" onClick={onExit}>Exit</button>
      <button id="mobile-order-amount-btn" type="button"
        style={{flex:'2 1 0%'}}
        className={baseButton+' truncate '+(panel==='equity'?'bg-[#2962ff] border-[#709fff]':'')}
        title={quickSize.mode==='equity'? `${quickSize.value}% of available equity`:`Cash margin ${moneyLabel(quickSize.value)}`}
        aria-pressed={panel==='equity'}
        onPointerDown={()=>{clearSizeHold();sizeHeld.current=false;sizeHoldTimer.current=setTimeout(()=>{sizeHeld.current=true;onQuickSize({...quickSize,value:0});setPanel(null);},450);}}
        onPointerUp={clearSizeHold} onPointerCancel={clearSizeHold} onPointerLeave={clearSizeHold}
        onContextMenu={e=>{e.preventDefault();clearSizeHold();sizeHeld.current=true;onQuickSize({...quickSize,value:0});setPanel(null);}}
        onClick={()=>{if(sizeHeld.current){sizeHeld.current=false;return;}if(panel==='equity'){setPanel(null);setError('');return;}setSizeModeDraft(quickSize.mode);setSizeDraft(quickSize.value===0?'':String(quickSize.value));setError('');setPanel('equity');}}>
        {quickSize.value===0?'Amount':quickSize.mode==='equity'?`${Math.round(quickSize.value)}% Equity`:moneyLabel(quickSize.value)}
      </button>
      {(['sl','tp'] as const).map(kind=><button key={kind} type="button"
        id={kind==='sl'?'mobile-stop-setup-btn':'mobile-target-setup-btn'}
        style={{flex:'0.5 1 0%'}}
        className={baseButton+' relative '+((panel===kind||(position?(kind==='sl'?!!(position.sl||position.trailingPercent||position.dynamicTrailing):!!(position.tp||position.tpLevels?.length)):!!preparedExits[kind]))?'!bg-[#2962ff] !border-[#709fff] text-white':'')}
        aria-pressed={position?(kind==='sl'?!!(position.sl||position.trailingPercent||position.dynamicTrailing):!!(position.tp||position.tpLevels?.length)):!!preparedExits[kind]}
        aria-label={kind==='sl'?'Stop loss; hold to reset':'Take profit; hold to reset'}
        title="Hold to Reset"
        onContextMenu={e=>{e.preventDefault();clearHold();held.current=true;resetExit(kind);}}
        onPointerDown={()=>startHold(kind)} onPointerUp={clearHold} onPointerCancel={clearHold} onPointerLeave={clearHold}
        onClick={()=>clickExit(kind)}>
        {kind.toUpperCase()}{(position?(
          (kind==='sl'&&(!!position.sl||!!position.trailingPercent||!!position.dynamicTrailing))||
          (kind==='tp'&&(!!position.tp||!!position.tpLevels?.length))
        ):!!preparedExits[kind])?<span aria-hidden="true"
          className="absolute right-0 top-0 text-[6px] leading-[6px] text-[#7ddfc5]">●</span>:null}
      </button>)}
    </div>
  </div>;
};