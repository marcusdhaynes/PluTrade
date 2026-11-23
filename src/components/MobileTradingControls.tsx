import React,{useEffect,useRef,useState} from 'react';
import type {Asset,PaperPosition} from '../types';
import type {PaperExitMode} from '../services/paperOrders';
import {exitPriceFromValue,exitValueFromPrice} from '../services/paperOrders';

type ExitKind='sl'|'tp';
interface Props {
  asset:Asset;
  position:PaperPosition|null;
  accountEquity:number;
  accountBalance:number;
  equityPercent:number;
  onEquityPercent:(value:number)=>void;
  onEnter:(focus?:ExitKind)=>void;
  onExit:()=>void;
  onEditStops:(id:string,tp?:number,sl?:number,trailing?:number|null)=>void;
  onAdvancedConditional:()=>void;
  editRequest?:{id:string;kind:ExitKind;seq:number}|null;
}
const methods:{mode:PaperExitMode;label:string}[]=[
  {mode:'price',label:'Exact price'},{mode:'ticks',label:'Price ticks'},
  {mode:'percent',label:'Distance %'},{mode:'money',label:'Account currency amount'},
  {mode:'balance',label:'% of account balance'},
];
const numeric=(n:number,digits=6)=>Number.isFinite(n)?n.toLocaleString(undefined,{maximumFractionDigits:digits}):'—';

/** A single, always-visible mobile trade row. Long-press SL/TP to reveal all
 * supported exit types without making a tap on a small screen execute a trade. */
export const MobileTradingControls:React.FC<Props>=({
  asset,position,accountEquity,accountBalance,equityPercent,onEquityPercent,
  onEnter,onExit,onEditStops,onAdvancedConditional,editRequest,
})=>{
  const [panel,setPanel]=useState<'equity'|ExitKind|null>(null);
  const [advanced,setAdvanced]=useState(false);
  const [mode,setMode]=useState<PaperExitMode>('percent');
  const [value,setValue]=useState('1');
  const [trail,setTrail]=useState(false);
  const [trailPercent,setTrailPercent]=useState('0.50');
  const [equityDraft,setEquityDraft]=useState(String(equityPercent));
  const [error,setError]=useState('');
  const holdTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const held=useRef(false);
  const lastPosition=useRef<string|null>(null);
  const clearHold=()=>{if(holdTimer.current!==null){clearTimeout(holdTimer.current);holdTimer.current=null;}};

  const openExit=(kind:ExitKind,showAll=false)=>{
    setError('');
    setPanel(kind);
    setAdvanced(showAll);
    setTrail(false);
    setTrailPercent(String(position?.trailingPercent||0.5));
    const existing=kind==='sl'?position?.sl:position?.tp;
    if(existing!==undefined&&existing>0){
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
  const startHold=(kind:ExitKind)=>{
    clearHold();held.current=false;
    holdTimer.current=setTimeout(()=>{held.current=true;openExit(kind,true);},450);
  };
  const clickExit=(kind:ExitKind)=>{
    clearHold();
    if(held.current){held.current=false;return;}
    openExit(kind);
  };
  const tick=10**(-Math.min(Math.max(asset.digits||2,0),10));
  const selectedKind=panel==='sl'||panel==='tp'?panel:null;
  const raw=Number(value);
  const target=selectedKind&&position?
    exitPriceFromValue(position.entryPrice,position.qty,position.side,selectedKind,mode,raw,tick,accountBalance):undefined;
  const validTarget=!!target&&Number.isFinite(target)&&!!position&&
    (selectedKind==='sl'?(position.side==='Long'?target<position.entryPrice:target>position.entryPrice):
      (position.side==='Long'?target>position.entryPrice:target<position.entryPrice));
  const validTrail=Number.isFinite(Number(trailPercent))&&Number(trailPercent)>0&&Number(trailPercent)<100;
  const saveExit=()=>{
    if(!position||!selectedKind)return;
    if(selectedKind==='sl'&&trail){
      if(!validTrail){setError('Trail must be greater than 0% and less than 100%.');return;}
      onEditStops(position.id,position.tp,position.sl,Number(trailPercent));
    }else{
      if(!validTarget){setError('Choose a positive price on the correct side of the entry.');return;}
      if(selectedKind==='tp'&&position.tpLevels?.length){
        setError('This position has multiple TP targets. Manage their allocation in Positions rather than silently replacing the active targets.');
        return;
      }
      onEditStops(position.id,selectedKind==='tp'?target:position.tp,
        selectedKind==='sl'?target:position.sl);
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
  const baseButton='flex-1 min-w-0 h-9 rounded-md border border-[#3c4658] bg-[#232b39] text-[10px] font-semibold tracking-tight text-[#d6e2f4] active:bg-[#355172] touch-manipulation';
  const close=()=>{clearHold();setPanel(null);setError('');};
  return <div id="plutrade-mobile-trade-controls"
    className="relative md:hidden shrink-0 w-full border-t border-[#3f4d62] bg-[#151d2b] px-1.5 py-1.5 z-40"
    style={{paddingBottom:'max(6px, env(safe-area-inset-bottom))'}}>
    {panel&&<div role="dialog" aria-label={panel==='equity'?'Equity allocation':panel==='sl'?'Stop loss options':'Take profit options'}
      className="absolute bottom-full left-0 right-0 z-50 max-h-[min(67dvh,440px)] overflow-y-auto rounded-t-xl border border-[#48556a] bg-[#182233] p-3 shadow-[0_-10px_45px_#000a] text-xs">
      <div className="flex items-center justify-between mb-3">
        <strong>{panel==='equity'?'% Equity · new entries':panel==='sl'?'Stop loss':'Take profit'} <span className="font-normal text-[#8da0bd]">· Paper</span></strong>
        <button type="button" onClick={close} aria-label="Close quick options" className="p-1 rounded hover:bg-[#35435b]">✕</button>
      </div>
      {panel==='equity'?<>
        <label className="block text-[#a9bbd0]">Percentage of account equity
          <div className="flex items-center gap-2 mt-1">
            <input aria-label="Percent of equity" type="number" min="0.01" max="100" step="any"
              className="flex-1 min-w-0 h-10 rounded bg-[#0d1728] border border-[#526079] px-2 text-white"
              value={equityDraft} onChange={e=>setEquityDraft(e.target.value)}/>
            <span>%</span>
          </div>
        </label>
        <div className="flex gap-1.5 mt-2">{[10,25,50,75,99,100].map(n=><button key={n} type="button"
          onClick={()=>setEquityDraft(String(n))} className="flex-1 min-w-0 rounded border border-[#43516a] p-1.5">{n}</button>)}</div>
        <p className="mt-2 text-[#93a4bd]">Equity {numeric(accountEquity,2)} {asset.currency}. Orders are capped by free margin and fees, and still require review and a verified quote.</p>
        <button type="button" className="mt-3 w-full rounded bg-[#2962ff] text-white p-2 font-semibold"
          onClick={()=>{const n=Number(equityDraft);if(!Number.isFinite(n)||n<=0||n>100){setError('Enter a value greater than 0 and no more than 100%.');return;}onEquityPercent(n);close();}}>
          Apply to Entry
        </button>
      </>:position&&selectedKind?<>
        <p className="mb-2 text-[#96abc3]">{position.side} · {position.symbol} · Entry {numeric(position.entryPrice,asset.digits)} · {numeric(position.qty)} units</p>
        <div className="flex items-center justify-between gap-2">
          <label className="flex-1 text-[#b7c8dc]">Level type
            <select aria-label="Exit level type" value={mode} onChange={e=>changeMethod(e.target.value as PaperExitMode)}
              className="block w-full h-9 mt-1 rounded border border-[#53627a] bg-[#111b2a] px-2 text-white">
              {methods.map(method=><option key={method.mode} value={method.mode}>{method.label}</option>)}
            </select>
          </label>
          <button type="button" className="self-end h-9 rounded border border-[#53627a] px-2"
            aria-expanded={advanced} onClick={()=>setAdvanced(v=>!v)}>{advanced?'Less':'Options'}</button>
        </div>
        <label className="block mt-3 text-[#b7c8dc]">Value
          <input aria-label="Exit level value" type="number" min="0" step="any" value={value}
            onChange={e=>{setValue(e.target.value);setError('');}}
            className="block w-full h-10 mt-1 rounded border border-[#53627a] bg-[#111b2a] px-2 text-white"/>
        </label>
        <p className="text-[#93a8c4] mt-1">Price level: {validTarget?numeric(target!,asset.digits):'Invalid'} {asset.currency}</p>
        {selectedKind==='sl'&&advanced&&<div className="mt-3 border-t border-[#39495f] pt-3">
          <label className="flex items-center gap-2"><input type="checkbox" checked={trail} onChange={e=>setTrail(e.target.checked)}/> Trailing stop (follows favorable price only)</label>
          {trail&&<label className="block mt-2">Trailing distance %
            <input type="number" aria-label="Trailing stop percent" min="0" max="99.99" step="any"
              className="block mt-1 h-9 w-full rounded border border-[#53627a] bg-[#111b2a] px-2 text-white"
              value={trailPercent} onChange={e=>setTrailPercent(e.target.value)}/>
          </label>}
          <p className="mt-1 text-[10px] text-[#93a8c4]">A trailing stop never loosens a previously protected level. All executions are simulated.</p>
        </div>}
        {selectedKind==='tp'&&position.tpLevels?.length>0&&<p className="mt-3 text-[#e4b978]">
          {position.tpLevels.length} partial take-profit levels are active. Their allocation must be reviewed in Positions.</p>}
        {advanced&&<button type="button" onClick={()=>{close();onAdvancedConditional();}}
          className="mt-2 text-[#9cc2ff] underline">Advanced conditional price/drawing rule</button>}
        <button type="button" onClick={saveExit}
          className="mt-3 w-full rounded bg-[#2962ff] text-white p-2.5 font-semibold">
          {selectedKind==='sl'&&trail?'Enable Trailing SL':'Save '+(selectedKind==='sl'?'Stop Loss':'Take Profit')}
        </button>
      </>:<>
        <p className="text-[#b7c6da]">No open position for this exact market. Configure {panel==='sl'?'all stop-loss types, including trailing':'all take-profit target types and multiple levels'} in a reviewed entry ticket.</p>
        <button type="button" onClick={()=>{const focus=panel as ExitKind;close();onEnter(focus);}}
          className="mt-3 w-full rounded bg-[#2962ff] text-white p-2.5">Open Entry Ticket · {panel.toUpperCase()}</button>
      </>}
      {error&&<p role="alert" className="mt-2 text-[#ff9eac]">{error}</p>}
    </div>}
    <div className="flex w-full items-center gap-1" aria-label="Mobile trading controls">
      <button type="button" className={baseButton+' border-[#255da9] bg-[#1c426f] text-white'}
        onClick={()=>onEnter()}>Enter</button>
      <button type="button" className={baseButton+' '+(position?'border-[#ad4851] bg-[#49272f] text-white':'opacity-40')}
        disabled={!position} aria-label="Exit paper position" onClick={onExit}>Exit</button>
      <button type="button" className={baseButton} onClick={()=>{setEquityDraft(String(equityPercent));setError('');setPanel('equity');}}>
        {numeric(equityPercent,1)}% <span className="block text-[9px] font-normal leading-none">Equity</span>
      </button>
      {(['sl','tp'] as const).map(kind=><button key={kind} type="button"
        className={baseButton+' '+(panel===kind?'border-[#709fff]':'')}
        aria-label={kind==='sl'?'Stop loss; hold for all types':'Take profit; hold for all types'}
        title="Hold for all types"
        onContextMenu={e=>{e.preventDefault();clearHold();openExit(kind,true);}}
        onPointerDown={()=>startHold(kind)} onPointerUp={clearHold} onPointerCancel={clearHold} onPointerLeave={clearHold}
        onClick={()=>clickExit(kind)}>
        {kind.toUpperCase()}
        <span className="block text-[9px] font-normal leading-none">
          {position?(kind==='sl'?position.sl:position.tp)?numeric((kind==='sl'?position.sl:position.tp)!,2):kind==='tp'&&position.tpLevels?.length?position.tpLevels.length+' levels':'Set':'All Types'}
        </span>
      </button>)}
    </div>
  </div>;
};
