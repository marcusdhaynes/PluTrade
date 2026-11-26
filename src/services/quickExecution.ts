import type {Asset,PaperPosition} from '../types';
import type {ChartEntryDrafts,ChartEntryTrail} from './chartExitEditing';
import {estimatePaperQty,exitPriceFromValue,withOrderReservations,withOrderValidation,type PaperOrderRequest,type PaperOrderSide} from './paperOrders';
import {accountLeverage,closePaperPosition,paperExecutionPrice,type PaperPortfolio} from './paperTrading';
import {DEFAULT_DYNAMIC_TRAIL} from './dynamicTrailing';

export type QuickSize={mode:'equity'|'cash';value:number};
export function makeQuickOrder(portfolio:PaperPortfolio,asset:Asset,side:PaperOrderSide,size:QuickSize,exits:ChartEntryDrafts,trail:ChartEntryTrail,now=Date.now()):PaperOrderRequest {
  const available=withOrderReservations(portfolio).account.availableFunds;
  if(!Number.isFinite(size.value)||size.value<=0)throw Error('Save a positive Amount first.');
  if(size.mode==='equity'&&size.value>100)throw Error('Amount cannot exceed 100% available equity.');
  if(size.mode==='cash'&&size.value>available)throw Error('Cash amount exceeds available equity.');
  if(available<=0)throw Error('No available equity in this account.');
  const entry=paperExecutionPrice(portfolio.settings,asset.price,side,'entry');
  const qty=estimatePaperQty(portfolio,asset,size.mode==='cash'?size.value/available*100:size.value,entry,'available');
  const tick=10**(-Math.min(Math.max(asset.digits,0),10));
  const exit=(kind:'sl'|'tp')=>{
    const draft=exits[kind];if(!draft)return undefined;
    const price=exitPriceFromValue(entry,qty,side,kind,draft.mode,Number(draft.value),tick,portfolio.account.balance);
    if(price===undefined||!Number.isFinite(price)||price<=0)throw Error('Invalid saved '+kind.toUpperCase()+' value.');
    if(side==='Long'?(kind==='sl'?price>=entry:price<=entry):(kind==='sl'?price<=entry:price>=entry))throw Error('Saved '+kind.toUpperCase()+' is on the wrong side of this entry.');
    return price;
  };
  const request:PaperOrderRequest={side,kind:'market',qty,sl:exit('sl'),tp:exit('tp'),
    trailingStopPercent:trail.mode==='trailing'?trail.percent:undefined,
    dynamicTrailing:trail.mode==='intelligent'?{...DEFAULT_DYNAMIC_TRAIL,intrabar:true}:undefined};
  withOrderValidation(portfolio,asset,request,now);
  return request;
}
export function quickExitQuantity(position:PaperPosition,size:QuickSize,portfolio:PaperPortfolio,asset:Asset):number{
  if(!Number.isFinite(size.value)||size.value<=0)throw Error('Save a positive Amount first.');
  if(size.mode==='equity'){
    if(size.value>100)throw Error('Close percentage cannot exceed 100%.');
    return position.qty*size.value/100;
  }
  const margin=position.qty*position.entryPrice/(position.leverage||accountLeverage(portfolio.settings,asset));
  if(!Number.isFinite(margin)||margin<=0||size.value>margin+1e-8)throw Error('Cash amount exceeds the position margin. Choose 100% to close all.');
  return Math.min(position.qty,position.qty*size.value/margin);
}
/** Explicit manual reductions scale remaining partial target quantities; automatic TP fills do not use this wrapper. */
export function closeWithProtection(portfolio:PaperPortfolio,id:string,price:number,qty?:number,now=Date.now()):PaperPortfolio{
  const before=portfolio.positions.find(p=>p.id===id);
  if(!before)throw Error('Position no longer open.');
  const result=closePaperPosition(portfolio,id,price,qty,now);
  return {...result,positions:result.positions.map(p=>p.id!==id||!before.tpLevels?.length?p:{
    ...p,tpLevels:before.tpLevels.map(t=>({...t,quantity:t.quantity*p.qty/before.qty}))
  })};
}
