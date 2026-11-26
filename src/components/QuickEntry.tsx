import React,{useEffect,useState} from 'react';
import type {Asset} from '../types';
import type {PaperPortfolio} from '../services/paperTrading';
import type {PaperOrderRequest,PaperOrderSide} from '../services/paperOrders';
import type {ChartEntryDrafts,ChartEntryTrail} from '../services/chartExitEditing';
import {makeQuickOrder,type QuickSize} from '../services/quickExecution';
type Props={asset:Asset;portfolio:PaperPortfolio;size:QuickSize;exits:ChartEntryDrafts;trail:ChartEntryTrail;blocked:boolean;onClose:()=>void;onSubmit:(r:PaperOrderRequest)=>string|null;error:string};
export function QuickEntry({asset,portfolio,size,exits,trail,blocked,onClose,onSubmit,error}:Props){
  const [side,setSide]=useState<PaperOrderSide>('Long');
  const [localError,setError]=useState('');
  useEffect(()=>{const fn=(e:KeyboardEvent)=>{if(e.key==='Escape')onClose();};window.addEventListener('keydown',fn);return()=>window.removeEventListener('keydown',fn);},[onClose]);
  let request:PaperOrderRequest|undefined;let reason='';
  try{if(blocked)throw Error('This paper account is read-only. Check account recovery or another open tab.');request=makeQuickOrder(portfolio,asset,side,size,exits,trail);}catch(e){reason=e instanceof Error?e.message:'Invalid quick order';}
  const summary=(kind:'sl'|'tp')=>exits[kind]?exits[kind]!.value+' '+({price:'price',percent:'%',ticks:'ticks',money:portfolio.settings.currency,balance:'% balance'}[exits[kind]!.mode]):'Off';
  return <section role="dialog" aria-label="Quick entry" className="quick-entry-dialog">
    <header><strong>Enter · Paper Trading</strong><button type="button" aria-label="Close quick entry" onClick={onClose}>×</button></header>
    <div className="quick-entry-details"><span>Account</span><strong>{portfolio.account.name}</strong><span>Market</span><strong>{asset.symbol} · {asset.source||asset.exchange}</strong>
    <span>Amount</span><strong>{size.value}{size.mode==='equity'?'% Available Equity':' '+portfolio.settings.currency}</strong>
    <span>SL</span><strong>{summary('sl')}</strong><span>TP</span><strong>{summary('tp')}</strong>
    <span>Trailing</span><strong>{trail.mode==='intelligent'?'Intelligent Trailing':trail.mode==='trailing'?trail.percent+'%':'Off'}</strong>
    <span>Quantity</span><strong>{request?request.qty.toLocaleString(undefined,{maximumFractionDigits:8}):'—'}</strong>
    {request?.sl!==undefined&&<><span>SL Price</span><strong>{request.sl.toFixed(asset.digits)}</strong></>}
    {request?.tp!==undefined&&<><span>TP Price</span><strong>{request.tp.toFixed(asset.digits)}</strong></>}
    </div>
    <div className="quick-entry-sides"><button type="button" aria-pressed={side==='Long'} onClick={()=>{setSide('Long');setError('');}}>Buy / Long</button><button type="button" aria-pressed={side==='Short'} onClick={()=>{setSide('Short');setError('');}}>Sell / Short</button></div>
    {(localError||reason||error)&&<p role="alert">{localError||reason||error}</p>}
    <button type="button" className="quick-entry-submit" disabled={!request} onClick={()=>{if(!request)return;try{const latest=makeQuickOrder(portfolio,asset,side,size,exits,trail);const message=onSubmit(latest);if(message)setError(message);else onClose();}catch(e){setError(e instanceof Error?e.message:'Entry rejected');}}}>Confirm {side==='Long'?'Buy':'Sell'} · Market</button>
  </section>;
}
