import assert from 'node:assert/strict';
import type {Asset,PriceAlert} from '../types';
import {evaluatePriceAlerts,alertIsExpired,alertMatchesExactMarket} from './priceAlertEngine';

const at=1_700_000_000_000;
const market:Asset={
 symbol:'BTCUSD',name:'BTC/USD',exchange:'Coinbase',source:'Coinbase',category:'crypto',marketType:'spot',
 price:100,change24h:0,changePercent24h:0,high24h:101,low24h:99,volume24h:'0',
 currency:'USD',digits:2,
};
const make=(input:Partial<PriceAlert>={}):PriceAlert=>({
 id:'regression-'+Math.random().toString(36).slice(2),symbol:'BTCUSD',exchange:'Coinbase',
 marketType:'spot',condition:'cross_above',targetPrice:100,
 createdAt:at-10000,triggered:false,frequency:'once',timeframe:'1m',...input,
});
const run=(alert:PriceAlert,prev:number|undefined,price:number,when=at,
  kind:'tick'|'closed-bar'='tick',barTime?:number,timeframe:'1m'|'5m'='1m')=>
  evaluatePriceAlerts([alert],market,prev,price,when,{kind,barTime,timeframe});
const checks:[string,()=>void][]=[
 ['exact venue and market type required',()=>{
   assert.equal(alertMatchesExactMarket(make(),market),true);
   assert.equal(alertMatchesExactMarket(make(),{...market,source:'Kraken'}),false);
   assert.equal(alertMatchesExactMarket(make(),{...market,marketType:'swap'}),false);
   assert.equal(run(make({exchange:'Kraken'}),99,101).hits.length,0);
 }],
 ['crossing above fires only when crossing',()=>{
   assert.equal(run(make(),99,101).hits.length,1);
   assert.equal(run(make(),101,102).hits.length,0);
   assert.equal(run(make(),undefined,101).hits.length,0);
 }],
 ['greater than immediately fires and once is terminal',()=>{
   const first=run(make({condition:'greater_than'}),undefined,101);
   assert.equal(first.hits.length,1);
   assert.equal(first.updated[0].triggered,true);
   assert.equal(run(first.updated[0],101,102,at+1000).hits.length,0);
 }],
 ['less than evaluates actual observed price',()=>{
   assert.equal(run(make({condition:'less_than'}),undefined,99).hits.length,1);
   assert.equal(run(make({condition:'less_than'}),undefined,100).hits.length,0);
 }],
 ['crossing either direction works with repeats',()=>{
   const a=make({condition:'crossing',frequency:'every'});
   assert.equal(run(a,99,101).hits.length,1);
   assert.equal(run(a,101,99).hits.length,1);
   assert.equal(run(a,100,100).hits.length,0);
 }],
 ['once per minute prevents re-notification inside 60 sec',()=>{
   const a=make({condition:'greater_than',frequency:'once_per_minute'});
   const fired=run(a,100,101).updated[0];
   assert.equal(run(fired,101,102,at+59000).hits.length,0);
   assert.equal(run(fired,101,102,at+60000).hits.length,1);
 }],
 ['once per bar buckets by configured timeframe',()=>{
   const a=make({condition:'greater_than',frequency:'once_per_bar',timeframe:'5m'});
   const fired=run(a,100,101).updated[0];
   const frame=Math.floor(at/300000)*300000;
   assert.equal(run(fired,100,102,frame+299000).hits.length,0);
   assert.equal(run(fired,100,102,frame+300000).hits.length,1);
 }],
 ['bar-close ignores ticks, mismatched intervals and duplicate bars',()=>{
   const a=make({condition:'greater_than',frequency:'once_per_bar_close'});
   const time=Math.floor(at/1000);
   assert.equal(run(a,100,101,at,'tick',time).hits.length,0);
   assert.equal(run(a,100,101,at,'closed-bar',time,'5m').hits.length,0);
   const closed=run(a,100,101,at,'closed-bar',time);
   assert.equal(closed.hits.length,1);
   assert.equal(run(closed.updated[0],101,102,at+1000,'closed-bar',time).hits.length,0);
   assert.equal(run(closed.updated[0],101,102,at+60000,'closed-bar',time+60).hits.length,1);
 }],
 ['paused and expired alerts do not run',()=>{
   assert.equal(run(make({paused:true}),99,101).hits.length,0);
   assert.equal(run(make({expiresAt:at-1}),99,101).hits.length,0);
   assert.equal(alertIsExpired(make({expiresAt:at-1}),at),true);
 }],
 ['bad price, threshold or time cannot create an alert hit',()=>{
   assert.equal(run(make(),99,NaN).hits.length,0);
   assert.equal(run(make(),99,-5).hits.length,0);
   assert.equal(run(make({targetPrice:Infinity}),99,101).hits.length,0);
   assert.equal(run(make(),99,101,NaN).hits.length,0);
 }],
 ['DEX pool identity is exact, not just the symbol',()=>{
   const a=make({symbol:'AAA@base',exchange:'DEX',marketType:'spot',chainId:'base',pairAddress:'0xdef'});
   const dex={...market,symbol:'AAA@base',source:'DEX',marketType:'spot' as const,
     chainId:'base',pairAddress:'0xabc'};
   assert.equal(alertMatchesExactMarket(a,dex),false);
   assert.equal(alertMatchesExactMarket({...a,pairAddress:'0xabc'},dex),true);
 }],
];
// Re-run all scenario assertions ten times using fresh fixtures: deterministic, independently
// checked transition cases. CI browser tests provide the separate integration layer.
for(let round=1;round<=10;round++){
 for(const [name,check] of checks){
   try{check();}catch(error){throw new Error('Alert check '+round+'/10 · '+name,{cause:error});}
 }
}
console.log('Alert engine: 11 scenarios × 10 rounds = 110 assertions suites passed.');
