import {strict as assert} from 'node:assert';
import {customIntervalBase,customIntervalLabel,customBucketStart,customBucketEnd,
  isCustomInterval,resampleCustomCandles} from './customChartIntervals';
import type {Asset,OHLCV} from '../types';
const asset={symbol:'BTCUSDT',source:'Binance',exchange:'Binance'} as Asset;
assert.deepEqual(customIntervalBase({count:7,unit:'seconds'},asset),{base:'1s'});
assert.equal(customIntervalBase({count:2,unit:'seconds'},{...asset,source:'Coinbase'}).base,null);
assert.match(customIntervalBase({count:10,unit:'ticks'},asset).warning||'',/trade feed/);
assert.equal(customIntervalBase({count:4,unit:'hours'},asset).base,'1h');
assert.equal(customIntervalBase({count:2,unit:'years'},asset).base,'1M');
assert.equal(customIntervalLabel({count:7,unit:'seconds'}),'7s');
assert.equal(customIntervalLabel({count:2,unit:'years'}),'2Y');
assert.equal(isCustomInterval({count:0,unit:'hours'}),false);
assert.equal(isCustomInterval({count:1000,unit:'hours'}),false);
assert.equal(isCustomInterval({count:2.5,unit:'hours'}),false);
assert.equal(customBucketStart(Date.UTC(2026,6,18,14,44,31)/1000,{count:3,unit:'hours'}),Date.UTC(2026,6,18,12)/1000);
assert.equal(customBucketStart(Date.UTC(2026,6,18)/1000,{count:2,unit:'weeks'}),Date.UTC(2026,6,6)/1000);
assert.equal(customBucketStart(Date.UTC(2026,7,18)/1000,{count:3,unit:'months'}),Date.UTC(2026,6,1)/1000);
const firstMonth=Date.UTC(2026,0,1)/1000;
assert.equal(customBucketEnd(firstMonth,{count:2,unit:'months'}),Date.UTC(2026,2,1)/1000);
const input:OHLCV[]=[0,60,120,180,240,300].map((step,index)=>({
  time:60*1000000+step,open:10+index,high:11+index,low:9+index,
  close:10.5+index,volume:index+1,
}));
const twoMinutes=resampleCustomCandles(input,{count:2,unit:'minutes'},'1m',input.at(-1)!.time+180);
assert.equal(twoMinutes.length,3);
assert.equal(twoMinutes[0].volume,3);
assert.equal(twoMinutes[0].open,10);
assert.equal(twoMinutes[0].close,11.5);
assert.equal(twoMinutes[2].time,input[4].time);
const gap=input.filter((x)=>x.time!==input[1].time);
const skipped=resampleCustomCandles(gap,{count:2,unit:'minutes'},'1m',input.at(-1)!.time+180);
assert.equal(skipped.length,2);
assert.deepEqual(resampleCustomCandles(input.slice(1),{count:2,unit:'minutes'},'1m',input.at(-1)!.time+180).map(x=>x.time),[input[2].time,input[4].time]);
const jan={time:Date.UTC(2026,0,1)/1000,open:4,high:5,low:3,close:4.2,volume:10};
const feb={time:Date.UTC(2026,1,1)/1000,open:4.2,high:6,low:4,close:5,volume:11};
const mar={time:Date.UTC(2026,2,1)/1000,open:5,high:7,low:4,close:6,volume:12};
const a=resampleCustomCandles([jan,feb,mar],{count:2,unit:'months'},'1M',Date.UTC(2026,3,1)/1000);
// The complete January–February bucket is valid; March–April is the current
// explicitly forming bucket and may display provisionally.
assert.equal(a.length,2);
assert.equal(a[0].volume,21);
assert.equal(a[1].time,mar.time);
assert.deepEqual(resampleCustomCandles([], {count:3,unit:'years'},'1M'),[]);
console.log('Custom time intervals: validation, UTC calendar boundaries and verified no-gap aggregation pass');
