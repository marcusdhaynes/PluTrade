import {strict as assert} from 'node:assert';
import {emptyPaperPortfolio,updatePaperTargetLevels} from './paperTrading';
import type {PaperPosition} from '../types';
const pos:PaperPosition={
  id:'p',symbol:'BTC/USD',exchange:'Kraken',side:'Long',qty:8,
  entryPrice:100,currentPrice:106,unrealizedPnL:48,unrealizedPnLPct:6,tp:120,
};
const base={...emptyPaperPortfolio(),positions:[pos]};
const after=updatePaperTargetLevels(base,'p',[
  {price:110,sharePercent:25},{price:114,sharePercent:75},
],1234).positions[0];
assert.equal(after.tp,undefined);
assert.deepEqual(after.tpLevels?.map(x=>[x.id,x.price,x.quantity]),[
  ['p-tp-revision-1234-0',110,2],['p-tp-revision-1234-1',114,6],
]);
assert.equal(base.positions[0].tp,120);
assert.throws(()=>updatePaperTargetLevels(base,'p',[{price:112,sharePercent:80}]),/exactly 100/);
assert.throws(()=>updatePaperTargetLevels(base,'p',[{price:103,sharePercent:100}]),/beyond entry/);
assert.throws(()=>updatePaperTargetLevels(base,'p',[{price:111,sharePercent:-100}]),/positive allocation|exactly 100/);
const short={...base,positions:[{...pos,side:'Short' as const,currentPrice:92}]};
assert.equal(updatePaperTargetLevels(short,'p',[{price:87,sharePercent:100}],123).positions[0].tpLevels?.[0].quantity,8);
assert.throws(()=>updatePaperTargetLevels(short,'p',[{price:96,sharePercent:100}]),/beyond entry/);
console.log('Mobile multi-target TP amendments: pass');
