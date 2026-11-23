import assert from 'node:assert/strict';
import {DEFAULT_BACKTEST} from './historicalBacktest';
import {smaCrossStrategy,rsiRecoveryStrategy,validateLabStrategy,runStrategyLabBacktest,
  optimizeSmaCandidates,walkForwardSma,latestLabSignal,type LabStrategy} from './strategyLab';
const first=1800000000;
const bars=Array.from({length:260},(_,i)=>{
  const close=100+Math.sin(i/5)*6+Math.sin(i/17)*2;
  const open=i?100+Math.sin((i-1)/5)*6+Math.sin((i-1)/17)*2:close;
  return {time:first+i*60,open,close,high:Math.max(open,close)+0.4,
    low:Math.min(open,close)-0.4,volume:100+i};
});
const now=first+262*60;
const normal=smaCrossStrategy();
assert.ok(validateLabStrategy(normal));
assert.ok(!validateLabStrategy({...normal,entry:{logic:'all',conditions:[]}}));
assert.ok(!validateLabStrategy({...normal,entry:{logic:'all',conditions:[{
  left:{metric:'sma',period:0},operator:'crosses_above',right:{constant:0}
}]}}));
assert.ok(!validateLabStrategy({...normal,entry:{logic:'all',conditions:[{
  left:{metric:'close'},operator:'crosses_above',right:{constant:Infinity}
}]}}));
const run=runStrategyLabBacktest(bars,'1m',normal,DEFAULT_BACKTEST,now);
assert.ok(run.result&&!run.error);
assert.ok(run.result!.trades.length>=2);
assert.equal(run.result!.barsUsed,260);
assert.deepEqual(runStrategyLabBacktest(bars,'1m',normal,DEFAULT_BACKTEST,now),run);
assert.ok(run.result!.equity.every(p=>Number.isFinite(p.equity)));
assert.ok(run.result!.trades.every(t=>t.entryAt>first&&t.exitAt>=t.entryAt));
const short=runStrategyLabBacktest(bars,'1m',{...normal,side:'short'},DEFAULT_BACKTEST,now);
assert.ok(short.result&&short.result.trades.every(t=>t.side==='short'));
assert.ok(Number.isFinite(short.result!.finalBalance));
const expensive=runStrategyLabBacktest(bars,'1m',normal,{...DEFAULT_BACKTEST,
  feeBps:20,spreadBps:25,slippageBps:20},now);
assert.ok(expensive.result!.finalBalance<run.result!.finalBalance);
assert.equal(runStrategyLabBacktest([...bars.slice(0,100),...bars.slice(101)],'1m',normal,DEFAULT_BACKTEST,now).result,undefined);
assert.ok(runStrategyLabBacktest(bars,'1m',rsiRecoveryStrategy(),DEFAULT_BACKTEST,now).result);
const candidates=optimizeSmaCandidates(bars,'1m',DEFAULT_BACKTEST,now);
assert.ok(candidates.length>0&&candidates.every(c=>c.result.trades.length>=2));
assert.ok(candidates.every((c,i)=>i===0||c.score<=candidates[i-1].score));
const walk=walkForwardSma(bars,'1m',DEFAULT_BACKTEST,now);
assert.ok(walk.train&&walk.test&&!walk.error);
assert.equal(walk.splitAt,bars[Math.floor(bars.length*0.7)].time);
assert.equal(walk.test!.firstBar,walk.splitAt);
assert.ok(walk.train!.lastBar<walk.test!.firstBar);
assert.equal(walkForwardSma(bars.slice(0,100),'1m',DEFAULT_BACKTEST,now).test,undefined);
// A signal from the bar that crosses cannot be filled until the following bar's open.
const flat=Array.from({length:60},(_,i)=>({time:first+i*60,
  open:i===41?110:100,high:i===40?111:i===41?110:100,
  low:100,close:i>=40?110:100,volume:10}));
for(let i=42;i<flat.length;i++){flat[i].open=110;flat[i].high=110;flat[i].low=110;}
const simple:LabStrategy={version:1,name:'Next-open verification',side:'long',
  entry:{logic:'all',conditions:[{left:{metric:'close'},operator:'crosses_above',right:{constant:105}}]},
  exit:{logic:'all',conditions:[{left:{metric:'close'},operator:'crosses_below',right:{constant:50}}]}};
const checked=runStrategyLabBacktest(flat,'1m',simple,{...DEFAULT_BACKTEST,stopLossPct:20,takeProfitPct:80},now);
assert.ok(checked.result);
assert.equal(checked.result!.trades[0]?.entryAt,first+41*60);
console.log('Round 12: strategy validation, no future-bar fills, long/short, deterministic costs, optimization and held-out walk-forward pass.');

const lastSignal=latestLabSignal;
const last=lastSignal(flat,'1m',simple,now);
assert.equal(last.at,flat[flat.length-1].time);
assert.equal(last.entry,false);
assert.equal(last.exit,false);
assert.ok(lastSignal(flat.slice(0,39),'1m',simple,now).error);
assert.ok(lastSignal([...flat.slice(0,25),...flat.slice(26)],'1m',simple,now).error);
