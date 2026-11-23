import type {OHLCV,Timeframe} from '../types';
import {calculateSMA,calculateEMA,calculateRSI} from './indicators';
import {backtestHistoryKey,validateHistoricalBacktestBars,DEFAULT_BACKTEST,type BacktestConfig} from './historicalBacktest';

/** Safe, declarative strategy rules: no eval(), remote scripts, or broker authority. */
export type LabMetric='close'|'sma'|'ema'|'rsi';
export type LabOperand={metric:LabMetric;period?:number};
export type LabComparator='crosses_above'|'crosses_below'|'greater_than'|'less_than';
export type LabCondition={left:LabOperand;operator:LabComparator;right:LabOperand|{constant:number}};
export type LabRule={logic:'all'|'any';conditions:LabCondition[]};
export type LabStrategy={version:1;name:string;side:'long'|'short';entry:LabRule;exit:LabRule};
export type LabTrade={side:'long'|'short';entryAt:number;exitAt:number;entryPrice:number;exitPrice:number;
  quantity:number;entryFee:number;exitFee:number;netPnL:number;exitReason:'rule'|'stop'|'target'|'last close'};
export type LabResult={strategy:LabStrategy;config:BacktestConfig;historyKey:string;barsUsed:number;
  firstBar:number;lastBar:number;trades:LabTrade[];equity:{time:number;equity:number}[];
  finalBalance:number;totalReturnPct:number;benchmarkReturnPct:number;maxDrawdownPct:number;
  maxDrawdownBars:number;winRatePct:number;profitFactor:number|null;expectancy:number;
  sharpePerBar:number|null;sortinoPerBar:number|null;exposurePct:number};
export type LabRun={result?:LabResult;error?:string};

const metrics:LabMetric[]=['close','sma','ema','rsi'];
const operators:LabComparator[]=['crosses_above','crosses_below','greater_than','less_than'];
const isObject=(v:unknown):v is Record<string,unknown>=>typeof v==='object'&&v!==null&&!Array.isArray(v);
const operandValid=(v:unknown):v is LabOperand=>{
  if(!isObject(v)||!metrics.includes(v.metric as LabMetric))return false;
  if(v.metric==='close')return v.period===undefined;
  return typeof v.period==='number'&&Number.isInteger(v.period)&&v.period>=2&&v.period<=200;
};
const conditionValid=(v:unknown):v is LabCondition=>isObject(v)&&
  operandValid(v.left)&&operators.includes(v.operator as LabComparator)&&
  (operandValid(v.right)||(isObject(v.right)&&Object.keys(v.right).length===1&&
    typeof v.right.constant==='number'&&Number.isFinite(v.right.constant)&&
    Math.abs(v.right.constant)<=1e12));
const ruleValid=(v:unknown):v is LabRule=>isObject(v)&&
  (v.logic==='all'||v.logic==='any')&&Array.isArray(v.conditions)&&
  v.conditions.length>=1&&v.conditions.length<=6&&v.conditions.every(conditionValid);
export function validateLabStrategy(v:unknown):v is LabStrategy{
  return isObject(v)&&v.version===1&&typeof v.name==='string'&&
    v.name.trim().length>0&&v.name.length<=80&&(v.side==='long'||v.side==='short')&&
    ruleValid(v.entry)&&ruleValid(v.exit);
}
const sma=(period:number):LabOperand=>({metric:'sma',period});
const rsi=(period:number):LabOperand=>({metric:'rsi',period});
export function smaCrossStrategy(fast=10,slow=30):LabStrategy{return {
  version:1,name:'SMA '+fast+'/'+slow+' crossover',side:'long',
  entry:{logic:'all',conditions:[{left:sma(fast),operator:'crosses_above',right:sma(slow)}]},
  exit:{logic:'all',conditions:[{left:sma(fast),operator:'crosses_below',right:sma(slow)}]}
};}
export function rsiRecoveryStrategy():LabStrategy{return {
  version:1,name:'RSI recovery / overbought exit',side:'long',
  entry:{logic:'all',conditions:[{left:rsi(14),operator:'crosses_above',right:{constant:30}}]},
  exit:{logic:'all',conditions:[{left:rsi(14),operator:'crosses_above',right:{constant:70}}]}
};}
const finite=(n:number)=>Number.isFinite(n);
function validAssumptions(c:BacktestConfig):boolean{
  return [c.startingBalance,c.allocationPct,c.feeBps,c.spreadBps,c.slippageBps,c.stopLossPct,c.takeProfitPct].every(finite)&&
    c.startingBalance>0&&c.allocationPct>0&&c.allocationPct<=100&&
    [c.feeBps,c.spreadBps,c.slippageBps].every(n=>n>=0&&n<=1000)&&
    c.stopLossPct>0&&c.stopLossPct<=100&&c.takeProfitPct>0&&c.takeProfitPct<=1000;
}
function ruleEvaluator(bars:OHLCV[],strategy:LabStrategy){
  const cache=new Map<string,Map<number,number>>();
  function value(op:LabOperand|{constant:number},index:number):number|undefined{
    if('constant' in op)return op.constant;
    if(index<0||index>=bars.length)return;
    if(op.metric==='close')return bars[index].close;
    const key=op.metric+':'+op.period;
    if(!cache.has(key)){
      const values=op.metric==='sma'?calculateSMA(bars,op.period!):
        op.metric==='ema'?calculateEMA(bars,op.period!):calculateRSI(bars,op.period!);
      cache.set(key,new Map(values.map(point=>[point.time,point.value])));
    }
    return cache.get(key)!.get(bars[index].time);
  }
  function condition(c:LabCondition,index:number):boolean{
    const a=value(c.left,index),b=value(c.right,index);
    if(a===undefined||b===undefined||!finite(a)||!finite(b))return false;
    if(c.operator==='greater_than')return a>b;
    if(c.operator==='less_than')return a<b;
    const pa=value(c.left,index-1),pb=value(c.right,index-1);
    if(pa===undefined||pb===undefined||!finite(pa)||!finite(pb))return false;
    return c.operator==='crosses_above'?(pa<=pb&&a>b):(pa>=pb&&a<b);
  }
  return (rule:LabRule,index:number)=>index>=0&&
    (rule.logic==='all'?rule.conditions.every(c=>condition(c,index)):
      rule.conditions.some(c=>condition(c,index)));
}
function ratios(equity:LabResult['equity']):{sharpePerBar:number|null;sortinoPerBar:number|null}{
  const r:number[]=[];
  for(let i=1;i<equity.length;i++){
    if(equity[i-1].equity<=0)continue;
    r.push(equity[i].equity/equity[i-1].equity-1);
  }
  if(r.length<2)return {sharpePerBar:null,sortinoPerBar:null};
  const mean=r.reduce((s,n)=>s+n,0)/r.length;
  const variance=r.reduce((s,n)=>s+(n-mean)**2,0)/r.length;
  const downside=r.reduce((s,n)=>s+Math.min(0,n)**2,0)/r.length;
  return {sharpePerBar:variance>0?mean/Math.sqrt(variance):null,
    sortinoPerBar:downside>0?mean/Math.sqrt(downside):null};
}
/** Completed candle at i-1 generates a signal filled at candle i open. No intrabar lookahead. */
export function runStrategyLabBacktest(input:readonly OHLCV[],timeframe:Timeframe,
  strategy:LabStrategy,config:BacktestConfig=DEFAULT_BACKTEST,nowSeconds=Date.now()/1000):LabRun{
  if(!validateLabStrategy(strategy))return {error:'Invalid strategy definition. Use bounded, supported rules.'};
  if(!validAssumptions(config))return {error:'Invalid capital or execution-cost assumptions.'};
  const verified=validateHistoricalBacktestBars(input,timeframe,nowSeconds);
  if(verified.error)return {error:verified.error};
  const bars=verified.bars;
  const evaluate=ruleEvaluator(bars,strategy),sign=strategy.side==='long'?1:-1;
  const feeRate=config.feeBps/10000;
  const adverse=(config.spreadBps/2+config.slippageBps)/10000;
  let balance=config.startingBalance;
  let position:{entryAt:number;entryPrice:number;quantity:number;entryFee:number;stop:number;target:number}|null=null;
  const trades:LabTrade[]=[],equity:LabResult['equity']=[];
  let peak=config.startingBalance,peakIndex=0,maxDrawdownPct=0,maxDrawdownBars=0,exposedBars=0;
  const exit=(time:number,reference:number,reason:LabTrade['exitReason'])=>{
    if(!position)return;
    const p=position;
    const exitPrice=reference*(1-sign*adverse);
    const gross=sign*(exitPrice-p.entryPrice)*p.quantity;
    const exitFee=exitPrice*p.quantity*feeRate;
    balance+=gross-exitFee;
    trades.push({side:strategy.side,entryAt:p.entryAt,exitAt:time,entryPrice:p.entryPrice,
      exitPrice,quantity:p.quantity,entryFee:p.entryFee,exitFee,
      netPnL:gross-p.entryFee-exitFee,exitReason:reason});
    position=null;
  };
  for(let i=0;i<bars.length;i++){
    const bar=bars[i],hadPosition=position!==null;
    if(hadPosition&&evaluate(strategy.exit,i-1))exit(bar.time,bar.open,'rule');
    // Do not reverse and reopen during the same bar; do not open on final closeout bar.
    if(!hadPosition&&!position&&i<bars.length-1&&evaluate(strategy.entry,i-1)){
      const entryPrice=bar.open*(1+sign*adverse);
      const budget=balance*config.allocationPct/100;
      const quantity=budget/(entryPrice*(1+feeRate));
      const entryFee=entryPrice*quantity*feeRate;
      if(finite(quantity)&&quantity>0&&entryFee<balance){
        balance-=entryFee;
        position={entryAt:bar.time,entryPrice,quantity,entryFee,
          stop:entryPrice*(1-sign*config.stopLossPct/100),
          target:entryPrice*(1+sign*config.takeProfitPct/100)};
      }
    }
    if(position){
      if((sign===1&&bar.open<=position.stop)||(sign===-1&&bar.open>=position.stop))
        exit(bar.time,bar.open,'stop');
      else if((sign===1&&bar.low<=position.stop)||(sign===-1&&bar.high>=position.stop))
        exit(bar.time,position.stop,'stop');
      else if((sign===1&&bar.open>=position.target)||(sign===-1&&bar.open<=position.target))
        exit(bar.time,bar.open,'target');
      else if((sign===1&&bar.high>=position.target)||(sign===-1&&bar.low<=position.target))
        exit(bar.time,position.target,'target');
    }
    if(position)exposedBars++;
    if(position&&i===bars.length-1)exit(bar.time,bar.close,'last close');
    const currentEquity=balance+(position?sign*(bar.close-position.entryPrice)*position.quantity:0);
    equity.push({time:bar.time,equity:currentEquity});
    if(currentEquity>peak){peak=currentEquity;peakIndex=i;}
    const drawdown=peak>0?(peak-currentEquity)/peak*100:100;
    if(drawdown>maxDrawdownPct)maxDrawdownPct=drawdown;
    maxDrawdownBars=Math.max(maxDrawdownBars,i-peakIndex);
  }
  const gains=trades.filter(t=>t.netPnL>0).reduce((s,t)=>s+t.netPnL,0);
  const losses=-trades.filter(t=>t.netPnL<0).reduce((s,t)=>s+t.netPnL,0);
  const wins=trades.filter(t=>t.netPnL>0).length;
  return {result:{strategy:JSON.parse(JSON.stringify(strategy)) as LabStrategy,
    config:{...config},historyKey:backtestHistoryKey(bars,timeframe),
    barsUsed:bars.length,firstBar:bars[0].time,lastBar:bars[bars.length-1].time,
    trades,equity,finalBalance:balance,totalReturnPct:(balance/config.startingBalance-1)*100,
    benchmarkReturnPct:(bars.at(-1)!.close/bars[0].open-1)*100,
    maxDrawdownPct,maxDrawdownBars,winRatePct:trades.length?wins/trades.length*100:0,
    profitFactor:losses>0?gains/losses:null,expectancy:trades.length?
      trades.reduce((s,t)=>s+t.netPnL,0)/trades.length:0,
    ...ratios(equity),exposurePct:exposedBars/bars.length*100}};
}
export type LabCandidate={fast:number;slow:number;score:number;result:LabResult};
export function optimizeSmaCandidates(bars:readonly OHLCV[],timeframe:Timeframe,
  config:BacktestConfig=DEFAULT_BACKTEST,nowSeconds=Date.now()/1000):LabCandidate[]{
  const candidates:LabCandidate[]=[];
  for(const fast of [5,8,10,15,20])for(const slow of [25,30,40,50]){
    if(fast>=slow)continue;
    const run=runStrategyLabBacktest(bars,timeframe,smaCrossStrategy(fast,slow),config,nowSeconds);
    if(run.result&&run.result.trades.length>=2){
      const score=run.result.totalReturnPct-run.result.maxDrawdownPct;
      candidates.push({fast,slow,score,result:run.result});
    }
  }
  return candidates.sort((a,b)=>b.score-a.score||a.fast-b.fast||a.slow-b.slow);
}
/** Optimize training history ONLY, then evaluate the untouched holdout with fresh warmup. */
export function walkForwardSma(bars:readonly OHLCV[],timeframe:Timeframe,
  config:BacktestConfig=DEFAULT_BACKTEST,nowSeconds=Date.now()/1000):
  {train?:LabResult;test?:LabResult;fast?:number;slow?:number;splitAt?:number;error?:string}{
  const verified=validateHistoricalBacktestBars(bars,timeframe,nowSeconds);
  if(verified.error)return {error:verified.error};
  if(verified.bars.length<120)return {error:'At least 120 completed contiguous bars are required for the holdout test.'};
  const split=Math.floor(verified.bars.length*0.7);
  const training=verified.bars.slice(0,split),holdout=verified.bars.slice(split);
  const [best]=optimizeSmaCandidates(training,timeframe,config,nowSeconds);
  if(!best)return {error:'Training produced fewer than two trades for every candidate. No winner selected.'};
  const out=runStrategyLabBacktest(holdout,timeframe,smaCrossStrategy(best.fast,best.slow),config,nowSeconds);
  if(!out.result)return {error:out.error};
  return {train:best.result,test:out.result,fast:best.fast,slow:best.slow,splitAt:holdout[0].time};
}
