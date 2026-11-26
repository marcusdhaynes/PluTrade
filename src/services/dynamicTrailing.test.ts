import assert from 'node:assert/strict';
import {editChartExit} from './chartExitEditing';
import {makeQuickOrder,quickExitQuantity,closeWithProtection} from './quickExecution';
import type {Asset,OHLCV} from '../types';
import {emptyPaperPortfolio,placePaperPosition,markPaperPositions} from './paperTrading';
import {submitPaperOrder,evaluatePaperOrders} from './paperOrders';
import {initialPaperAccounts,isStoredPaperLedgerValid} from './paperAccounts';
import {attachDynamicTrailing,disableDynamicTrailing,applyDynamicTrailingFromBars,
  calculateChandelier,completedDynamicBars,validDynamicTrail,DEFAULT_DYNAMIC_TRAIL} from './dynamicTrailing';

const now=1_700_000_000_000;
const base=Math.floor(now/1000)-20*3600;
const bars:Array<OHLCV>=Array.from({length:9},(_,i)=>({
  time:base+i*3600,open:100,high:101,low:99,close:100,volume:10,
}));
const market:Asset={symbol:'BTCUSD',name:'BTC/USD',exchange:'Coinbase',source:'Coinbase',
  category:'crypto',marketType:'spot',price:100,change24h:0,changePercent24h:0,
  high24h:101,low24h:99,volume24h:'1',currency:'USD',digits:2,quoteStatus:'live',
  quoteUpdatedAt:now,streamConnected:true};
const settings={...DEFAULT_DYNAMIC_TRAIL,period:3,lookback:3,multiplier:3};
const placed=()=>placePaperPosition(emptyPaperPortfolio(),market,'Long',1,1,undefined,undefined,now);
const checks:[string,()=>void][]=[
 ['Wilder ATR of constant true-range bars follows Chandelier formula',()=>{
   const v=calculateChandelier(bars,3,3,3)!;
   assert.equal(v.atr,2);
   assert.equal(v.longStop,95);
   assert.equal(v.shortStop,105);
 }],
 ['long stop attaches and ratchets when closed data is available',()=>{
   const p=placed(),attached=attachDynamicTrailing(p,p.positions[0].id,settings);
   const updated=applyDynamicTrailingFromBars(attached,market,'1h',bars,now);
   assert.equal(updated.positions[0].sl,95);
   assert.equal(updated.positions[0].dynamicTrailing?.lastBarTime,bars.at(-1)?.time);
   assert.equal(updated.positions[0].dynamicTrailing?.atr,2);
   assert.equal(updated.fills.length,p.fills.length);
 }],
 ['short stop uses the opposite side and remains above the market',()=>{
   const p=placePaperPosition(emptyPaperPortfolio(),market,'Short',1,1,undefined,undefined,now);
   const attached=attachDynamicTrailing(p,p.positions[0].id,settings);
   const updated=applyDynamicTrailingFromBars(attached,market,'1h',bars,now);
   assert.equal(updated.positions[0].sl,105);
 }],
 ['ATR change may never loosen an established long stop',()=>{
   const p=placed();
   const initial=applyDynamicTrailingFromBars(attachDynamicTrailing(p,p.positions[0].id,settings),
     market,'1h',bars,now);
   const wider=bars.map((b,i)=>({...b,time:b.time+36000,high:125,low:75,close:100,open:100}));
   const updated=applyDynamicTrailingFromBars(initial,market,'1h',wider,now+36000000);
   assert.equal(updated.positions[0].sl,95);
 }],
 ['ATR change may never loosen an established short stop',()=>{
   const p=placePaperPosition(emptyPaperPortfolio(),market,'Short',1,1,undefined,undefined,now);
   const initial=applyDynamicTrailingFromBars(attachDynamicTrailing(p,p.positions[0].id,settings),
     market,'1h',bars,now);
   const wider=bars.map(b=>({...b,time:b.time+36000,high:125,low:75}));
   const updated=applyDynamicTrailingFromBars(initial,market,'1h',wider,now+36000000);
   assert.equal(updated.positions[0].sl,105);
 }],
 ['wrong venue and wrong market type cannot edit unrelated stops',()=>{
   const real=placed(),attached=attachDynamicTrailing(real,real.positions[0].id,settings);
   assert.equal(applyDynamicTrailingFromBars(attached,{...market,source:'Kraken'},'1h',bars,now),attached);
   assert.equal(applyDynamicTrailingFromBars(attached,{...market,marketType:'swap'},'1h',bars,now),attached);
 }],
 ['open candle, invalid candle and insufficient history never create stops',()=>{
   const p=placed(),attached=attachDynamicTrailing(p,p.positions[0].id,settings);
   const future=bars.map(b=>({...b,time:b.time+9999999}));
   assert.equal(applyDynamicTrailingFromBars(attached,market,'1h',future,now),attached);
   assert.equal(applyDynamicTrailingFromBars(attached,market,'1h',bars.slice(0,2),now),attached);
   assert.equal(calculateChandelier([...bars.slice(0,8),{...bars[8],high:NaN}],3,3,3),undefined);
 }],
 ['same completed bar does not revise a stop twice',()=>{
   const p=placed(),attached=attachDynamicTrailing(p,p.positions[0].id,settings);
   const updated=applyDynamicTrailingFromBars(attached,market,'1h',bars,now);
   assert.equal(applyDynamicTrailingFromBars(updated,market,'1h',bars,now),updated);
 }],
 ['disabling ATR retains the achieved stop and later verified tick performs exit',()=>{
   const p=placed(),attached=attachDynamicTrailing(p,p.positions[0].id,settings);
   const updated=applyDynamicTrailingFromBars(attached,market,'1h',bars,now);
   const off=disableDynamicTrailing(updated,p.positions[0].id);
   assert.equal(off.positions[0].sl,95);
   assert.equal(off.positions[0].dynamicTrailing,undefined);
   const closed=markPaperPositions(off,{...market,price:94,quoteUpdatedAt:now+1000},now+1000);
   assert.equal(closed.positions.length,0);
   assert.equal(closed.fills[0].price,94); // observed tick, never assumed 95
 }],
 ['pending entry attaches dynamic stop only after a real observed limit fill',()=>{
   const p=submitPaperOrder(emptyPaperPortfolio(),market,{side:'Long',kind:'limit',qty:1,
     price:95,dynamicTrailing:settings},now);
   assert.equal(p.positions.length,0);
   assert.deepEqual(p.pendingOrders?.[0].dynamicTrailing,settings);
   const filled=evaluatePaperOrders(p,{...market,price:94,quoteUpdatedAt:now+1000},now+1000);
   assert.equal(filled.positions[0].dynamicTrailing?.mode,'chandelier');
   assert.equal(filled.positions[0].sl,undefined);
   assert.equal(filled.positions[0].dynamicTrailing?.lastBarTime,undefined);
 }],
 ['invalid parameters fail closed and valid parameters survive paper ledger serialization',()=>{
   assert.equal(validDynamicTrail({...settings,multiplier:0}),false);
   assert.equal(validDynamicTrail({...settings,lookback:200}),false);
   assert.throws(()=>attachDynamicTrailing(placed(), 'missing',settings),/Position/);
   const state=initialPaperAccounts();
   const opened=placed(),attached=attachDynamicTrailing(opened,opened.positions[0].id,settings);
   state.accounts[0].portfolio=attached;
   assert.equal(isStoredPaperLedgerValid(JSON.parse(JSON.stringify(state))),true);
 }],
];
for(let round=1;round<=10;round++)for(const [name,check] of checks){
  try{check();}catch(error){throw new Error('Dynamic ATR round '+round+': '+name,{cause:error});}
}
console.log('Dynamic Chandelier: 11 invariants × 10 rounds = 110 scenario runs passed.');


// Chart-driven edits use the same ledger as the execution and fill engine.
for(const side of ['Long','Short'] as const){
  const opened=placePaperPosition(emptyPaperPortfolio(),market,side,1,1,undefined,undefined,now);
  const id=opened.positions[0].id;
  const protective=side==='Long'?95:105, target=side==='Long'?110:90;
  const sl=editChartExit(opened,id,{action:'place',kind:'sl',price:protective});
  const both=editChartExit(sl,id,{action:'place',kind:'tp',price:target});
  assert.equal(both.positions[0].sl,protective);
  assert.equal(both.positions[0].tp,target);
  assert.throws(()=>editChartExit(both,id,{action:'place',kind:'sl',price:side==='Long'?105:95}));
  assert.throws(()=>editChartExit(both,id,{action:'place',kind:'tp',price:side==='Long'?95:105}));
  const removed=editChartExit(both,id,{action:'remove',kind:'sl'});
  assert.equal(removed.positions[0].sl,undefined);
  assert.equal(removed.positions[0].tp,target);
  const normal=editChartExit(both,id,{action:'trailing',enabled:true,percent:2});
  assert.equal(normal.positions[0].trailingPercent,2);
  const intelligent=editChartExit(normal,id,{action:'intelligent',enabled:true});
  assert.equal(intelligent.positions[0].dynamicTrailing?.intrabar,true);
  assert.equal(intelligent.positions[0].trailingPercent,undefined);
  assert.equal(intelligent.positions[0].sl,side==='Long'?99:101);
  const favorable=side==='Long'?105:95;
  const moved=markPaperPositions(intelligent,{...market,price:favorable,quoteUpdatedAt:now+1000},now+1000);
  const newStop=moved.positions[0].sl!;
  assert.ok(side==='Long'?newStop>99:newStop<101);
  const adverse=side==='Long'?newStop+0.1:newStop-0.1;
  const held=markPaperPositions(moved,{...market,price:adverse,quoteUpdatedAt:now+2000},now+2000);
  assert.equal(held.positions[0].sl,newStop);
  const fixed=editChartExit(held,id,{action:'intelligent',enabled:false});
  assert.equal(fixed.positions[0].dynamicTrailing,undefined);
  assert.equal(fixed.positions[0].sl,newStop);
  const hit=side==='Long'?newStop-.1:newStop+.1;
  const filled=markPaperPositions(fixed,{...market,price:hit,quoteUpdatedAt:now+3000},now+3000);
  assert.equal(filled.positions.length,0);
  assert.equal(filled.fills[0].price,hit);
  const multiple={...opened,positions:opened.positions.map(p=>({...p,tpLevels:[
    {id:'a',price:target,quantity:.4},{id:'b',price:side==='Long'?120:80,quantity:.6},
  ]}))};
  const revised=editChartExit(multiple,id,{action:'place',kind:'tp',levelId:'a',price:side==='Long'?115:85});
  assert.equal(revised.positions[0].tpLevels?.[0].quantity,.4);
  assert.equal(revised.positions[0].tpLevels?.[1].price,side==='Long'?120:80);
  const oneRemoved=editChartExit(revised,id,{action:'remove',kind:'tp',levelId:'a'});
  assert.deepEqual(oneRemoved.positions[0].tpLevels?.map(t=>t.id),['b']);
}
console.log('Chart exit editing and intelligent tick trailing: long and short scenario checks passed.');


// Quick entry and full ticket share the actual simulated order engine.
for(const side of ['Long','Short'] as const){
  const account=emptyPaperPortfolio();
  const request=makeQuickOrder(account,market,side,{mode:'equity',value:50},{
    sl:{mode:'percent',value:'2'},tp:{mode:'percent',value:'4'},
  },{mode:'intelligent'},now);
  assert.ok(request.qty>0);
  assert.equal(request.dynamicTrailing?.intrabar,true);
  const filled=submitPaperOrder(account,market,request,now);
  const pos=filled.positions[0];
  assert.equal(pos.side,side);
  assert.equal(pos.tp,request.tp);
  assert.equal(pos.dynamicTrailing?.intrabar,true);
  const qty=quickExitQuantity(pos,{mode:'equity',value:25},filled,market);
  assert.equal(qty,pos.qty*.25);
  const protectedPosition={...filled,positions:[{...pos,tp:undefined,tpLevels:[{id:'a',price:request.tp!,quantity:pos.qty/2},{id:'b',price:side==='Long'?110:90,quantity:pos.qty/2}]}]};
  const reduced=closeWithProtection(protectedPosition,pos.id,market.price,qty,now+1000);
  assert.ok(Math.abs(reduced.positions[0].qty-pos.qty*.75)<1e-8);
  assert.ok(Math.abs(reduced.positions[0].tpLevels!.reduce((sum,t)=>sum+t.quantity,0)-reduced.positions[0].qty)<1e-8);
  assert.equal(reduced.positions[0].sl,pos.sl);
  assert.equal(reduced.positions[0].dynamicTrailing?.intrabar,true);
  assert.throws(()=>makeQuickOrder(account,market,side,{mode:'equity',value:0},{},{mode:'off'},now));
  assert.throws(()=>makeQuickOrder(account,market,side,{mode:'equity',value:50},{sl:{mode:'price',value:side==='Long'?'120':'80'}},{mode:'off'},now));
  assert.throws(()=>makeQuickOrder(account,{...market,quoteUpdatedAt:now-60000},side,{mode:'equity',value:50},{},{mode:'off'},now));
  assert.throws(()=>quickExitQuantity(pos,{mode:'equity',value:101},filled,market));
}
console.log('Quick entry/exit: long/short validation, sizing and retained protection passed.');
