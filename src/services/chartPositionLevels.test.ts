import {strict as assert} from 'node:assert';
import {chartPositionExitLevels} from './chartPositionLevels';
import type {PaperPosition} from '../types';
const position:PaperPosition={
  id:'p1',symbol:'BTC/USD',exchange:'Kraken',side:'Long',qty:2,
  entryPrice:100,currentPrice:105,unrealizedPnL:10,unrealizedPnLPct:5,
};
assert.deepEqual(chartPositionExitLevels(null),[]);
assert.deepEqual(chartPositionExitLevels(position),[]);
assert.deepEqual(chartPositionExitLevels({...position,sl:95,tp:110}).map(x=>[x.kind,x.price]),
  [['sl',95],['tp',110]]);
const multi=chartPositionExitLevels({...position,sl:97,trailingPercent:2,trailingAnchor:107,
  tp:110,tpLevels:[{id:'t1',price:112,quantity:1},{id:'t2',price:115,quantity:1}]});
assert.equal(multi.length,3);
assert.match(multi[0].label,/Trail 2%/);
assert.deepEqual(multi.map(x=>x.price),[97,112,115]);
assert.equal(multi[1].quantity,1);
assert.deepEqual(chartPositionExitLevels({...position,trailingPercent:2,trailingAnchor:110}).map(x=>x.price),[107.8]);
assert.deepEqual(chartPositionExitLevels({...position,sl:NaN,tp:-4}),[]);
console.log('Chart position exit overlays: pass');
