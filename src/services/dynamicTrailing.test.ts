import assert from 'node:assert/strict';
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
