import assert from 'node:assert/strict';
import type {Asset} from '../types';
import {emptyPaperPortfolio} from './paperTrading';
import {amendPendingPaperOrder,submitPaperOrder,evaluatePaperOrders} from './paperOrders';

const at=1_700_000_000_000;
const asset:Asset={symbol:'BTCUSD',name:'BTC/USD',exchange:'Coinbase',source:'Coinbase',
  category:'crypto',marketType:'spot',price:100,change24h:0,changePercent24h:0,
  high24h:102,low24h:98,volume24h:'',digits:2,currency:'USD',
  quoteStatus:'live',quoteUpdatedAt:at,streamConnected:true};
const fresh=(price:number,time=at):Asset=>({...asset,price,quoteUpdatedAt:time});
const checks:[string,()=>void][]=[
 ['size and price can amend resting limit while keeping order id',()=>{
   const p=submitPaperOrder(emptyPaperPortfolio(),asset,{side:'Long',kind:'limit',qty:2,price:95},at);
   const id=p.pendingOrders![0].id;
   const a=amendPendingPaperOrder(p,asset,id,{qty:3,price:94},at);
   assert.equal(a.pendingOrders?.[0].id,id);
   assert.equal(a.pendingOrders?.[0].qty,3);
   assert.equal(a.pendingOrders?.[0].price,94);
   assert.equal(a.account.ordersMargin,282);
   assert.equal(p.pendingOrders![0].qty,2);
   assert.equal(a.orderEvents?.[0].action,'amended');
 }],
 ['new price must not convert edit into an unreviewed market fill',()=>{
   const p=submitPaperOrder(emptyPaperPortfolio(),asset,{side:'Long',kind:'limit',qty:2,price:95},at);
   assert.throws(()=>amendPendingPaperOrder(p,asset,p.pendingOrders![0].id,
     {qty:2,price:101},at),/Marketable replacement/);
 }],
 ['sell limits also reject marketable edits',()=>{
   const p=submitPaperOrder(emptyPaperPortfolio(),asset,{side:'Short',kind:'limit',qty:2,price:105},at);
   assert.throws(()=>amendPendingPaperOrder(p,asset,p.pendingOrders![0].id,
     {qty:2,price:99},at),/Marketable replacement/);
 }],
 ['reserve accounting respects other pending commitments',()=>{
   const a=submitPaperOrder(emptyPaperPortfolio(),asset,{side:'Long',kind:'limit',qty:60,price:95},at);
   const b=submitPaperOrder(a,asset,{side:'Long',kind:'limit',qty:20,price:94},at);
   assert.throws(()=>amendPendingPaperOrder(b,asset,b.pendingOrders![1].id,
     {qty:60,price:94},at),/Insufficient free margin/);
 }],
 ['amendment adjusts stop limit but preserves activation threshold semantics',()=>{
   const p=submitPaperOrder(emptyPaperPortfolio(),asset,{side:'Long',kind:'stop-limit',qty:1,
     price:105,limitPrice:104},at);
   const id=p.pendingOrders![0].id;
   const a=amendPendingPaperOrder(p,asset,id,{qty:2,price:107,limitPrice:106},at);
   assert.equal(a.pendingOrders![0].limitPrice,106);
   const triggered=evaluatePaperOrders(a,fresh(108,at+1000),at+1000);
   assert.equal(triggered.pendingOrders![0].status,'triggered');
   assert.equal(triggered.positions.length,0);
 }],
 ['activated stop-limit cannot be rewritten without explicit cancellation',()=>{
   const p=submitPaperOrder(emptyPaperPortfolio(),asset,{side:'Long',kind:'stop-limit',qty:1,
     price:105,limitPrice:104},at);
   const triggered=evaluatePaperOrders(p,fresh(108,at+1000),at+1000);
   assert.throws(()=>amendPendingPaperOrder(triggered,fresh(108,at+1000),
     triggered.pendingOrders![0].id,{qty:1,price:106,limitPrice:105},at+1000),/cancel/);
 }],
 ['expired instruction cannot be amended',()=>{
   const p=submitPaperOrder(emptyPaperPortfolio(),asset,{side:'Long',kind:'limit',qty:1,
     price:95,timeInForce:'Day'},at);
   assert.throws(()=>amendPendingPaperOrder(p,fresh(100,at+86400001),
     p.pendingOrders![0].id,{qty:1,price:94},at+86400001),/expired/);
 }],
 ['wrong venue, missing quote and invalid quantity are rejected',()=>{
   const p=submitPaperOrder(emptyPaperPortfolio(),asset,{side:'Long',kind:'limit',qty:1,price:95},at);
   const id=p.pendingOrders![0].id;
   assert.throws(()=>amendPendingPaperOrder(p,{...asset,source:'Kraken'},id,
     {qty:1,price:94},at),/original exchange/);
   assert.throws(()=>amendPendingPaperOrder(p,{...asset,quoteStatus:'delayed'},id,
     {qty:1,price:94},at),/verified live/);
   assert.throws(()=>amendPendingPaperOrder(p,asset,id,{qty:0,price:94},at),/greater than zero/);
 }],
 ['valid amendment can still fill only on an actual observed future price',()=>{
   const p=submitPaperOrder(emptyPaperPortfolio(),asset,{side:'Long',kind:'limit',qty:1,price:95},at);
   const a=amendPendingPaperOrder(p,asset,p.pendingOrders![0].id,{qty:2,price:94},at);
   const untouched=evaluatePaperOrders(a,fresh(97,at+1000),at+1000);
   assert.equal(untouched.positions.length,0);
   const done=evaluatePaperOrders(untouched,fresh(93,at+2000),at+2000);
   assert.equal(done.positions.length,1);
   assert.equal(done.positions[0].qty,2);
 }],
 ['missing order does not fabricate one',()=>{
   assert.throws(()=>amendPendingPaperOrder(emptyPaperPortfolio(),asset,'missing',
     {qty:1,price:90},at),/unavailable/);
 }],
];
for(let round=1;round<=10;round++){
  for(const [label,check] of checks){
    try{check();}catch(e){throw new Error('Paper round '+round+' / '+label,{cause:e});}
  }
}
console.log('Paper order amendment: 10 independent scenarios × 10 rounds = 100 passing scenario runs.');
