import type {Asset,OHLCV,PaperPosition,Timeframe} from '../types';
import type {PaperPortfolio} from './paperTrading';
import {matchesExactMarket} from './marketIdentity';

/**
 * LeBeau/Elder Chandelier Exit:
 *  long = highest(high, lookback) - multiplier × Wilder ATR(period)
 *  short = lowest(low, lookback) + multiplier × Wilder ATR(period)
 * Never loosen a previously committed stop. Calculations consume COMPLETED
 * OHLC bars from the exact venue only, not historical synthetic examples.
 */
export const DYNAMIC_TRAIL_TIMEFRAMES=['1m','5m','15m','1h','4h','1D'] as const;
export type DynamicTrailTimeframe=typeof DYNAMIC_TRAIL_TIMEFRAMES[number];
export interface DynamicTrailingSettings {
  mode:'chandelier';
  period:number;
  lookback:number;
  multiplier:number;
  timeframe:DynamicTrailTimeframe;
  /** Last committed exchange bar start in Unix seconds. */
  lastBarTime?:number;
  atr?:number;
  /** Intelligent mode also ratchets on each verified quote using the last closed ATR. */
  intrabar?:boolean;
}
export const DEFAULT_DYNAMIC_TRAIL:Omit<DynamicTrailingSettings,'lastBarTime'|'atr'>={
  mode:'chandelier',period:22,lookback:22,multiplier:3,timeframe:'1h'
};
export const validDynamicTrail=(value:unknown):value is DynamicTrailingSettings=>{
  if(!value||typeof value!=='object')return false;
  const v=value as DynamicTrailingSettings;
  return v.mode==='chandelier'&&Number.isInteger(v.period)&&v.period>=2&&v.period<=100&&
    Number.isInteger(v.lookback)&&v.lookback>=2&&v.lookback<=100&&
    Number.isFinite(v.multiplier)&&v.multiplier>=.25&&v.multiplier<=10&&
    (DYNAMIC_TRAIL_TIMEFRAMES as readonly string[]).includes(v.timeframe)&&
    (v.intrabar===undefined||typeof v.intrabar==='boolean')&&
    (v.lastBarTime===undefined||(Number.isFinite(v.lastBarTime)&&v.lastBarTime>=0))&&
    (v.atr===undefined||(Number.isFinite(v.atr)&&v.atr>0));
};
export const isValidBar=(bar:OHLCV):boolean=>
  Number.isFinite(bar.time)&&bar.time>0&&
  [bar.open,bar.high,bar.low,bar.close].every(n=>Number.isFinite(n)&&n>0)&&
  bar.low<=Math.min(bar.open,bar.close)&&bar.high>=Math.max(bar.open,bar.close)&&
  bar.low<=bar.high;

/** Use actual calendar aligned start only for the supported six timeframes. */
export const dynamicBarSeconds=(tf:DynamicTrailTimeframe):number=>
  ({'1m':60,'5m':300,'15m':900,'1h':3600,'4h':14400,'1D':86400})[tf];

export function completedDynamicBars(raw:readonly OHLCV[],timeframe:DynamicTrailTimeframe,nowMs:number):OHLCV[]{
  const duration=dynamicBarSeconds(timeframe);
  const cutoff=Math.floor(nowMs/1000);
  // Duplicate provider updates are deduped by bar start. The last verified
  // version of a *closed* bar wins, and a still-open candle is excluded.
  const dedup=new Map<number,OHLCV>();
  for(const b of raw){
    if(!isValidBar(b)||!Number.isInteger(b.time)||b.time+duration>cutoff)continue;
    dedup.set(b.time,b);
  }
  return [...dedup.values()].sort((a,b)=>a.time-b.time).slice(-250);
}
export interface ChandelierLevels{
  barTime:number;atr:number;highestHigh:number;lowestLow:number;longStop:number;shortStop:number;
}
export function calculateChandelier(
  bars:readonly OHLCV[],period=22,multiplier=3,lookback=22
):ChandelierLevels|undefined{
  if(!Number.isInteger(period)||period<2||period>100||
    !Number.isInteger(lookback)||lookback<2||lookback>100||
    !Number.isFinite(multiplier)||multiplier<.25||multiplier>10||
    bars.length<Math.max(period+1,lookback)||!bars.every(isValidBar))return;
  for(let i=1;i<bars.length;i++)if(bars[i].time<=bars[i-1].time)return;
  // Wilder smooth true range. The seed uses the first period true ranges
  // computed from bar[1] onward, with each previous close available.
  let atr=0;
  for(let i=1;i<=period;i++){
    const b=bars[i],prev=bars[i-1];
    atr+=Math.max(b.high-b.low,Math.abs(b.high-prev.close),Math.abs(b.low-prev.close));
  }
  atr/=period;
  for(let i=period+1;i<bars.length;i++){
    const b=bars[i],prev=bars[i-1];
    const tr=Math.max(b.high-b.low,Math.abs(b.high-prev.close),Math.abs(b.low-prev.close));
    atr=(atr*(period-1)+tr)/period;
  }
  if(!Number.isFinite(atr)||atr<=0)return;
  const high=Math.max(...bars.slice(-lookback).map(b=>b.high));
  const low=Math.min(...bars.slice(-lookback).map(b=>b.low));
  return {barTime:bars[bars.length-1].time,atr,highestHigh:high,lowestLow:low,
    longStop:high-multiplier*atr,shortStop:low+multiplier*atr};
}
export function attachDynamicTrailing(
  input:PaperPortfolio,id:string,settings:DynamicTrailingSettings=DEFAULT_DYNAMIC_TRAIL
):PaperPortfolio{
  if(!validDynamicTrail(settings))throw new Error('Dynamic ATR settings require 2–100 bars and a multiplier of 0.25–10.');
  if(!input.positions.some(p=>p.id===id))throw new Error('Position not available for dynamic trailing.');
  return {...input,positions:input.positions.map(p=>p.id!==id?p:{
    ...p,trailingPercent:undefined,trailingAnchor:undefined,
    sl:settings.intrabar?(p.side==='Long'?Math.max(p.sl??0,p.currentPrice*.99):Math.min(p.sl??Infinity,p.currentPrice*1.01)):p.sl,
    dynamicTrailing:{...settings,lastBarTime:undefined,atr:undefined},
  })};
}
export function disableDynamicTrailing(input:PaperPortfolio,id:string):PaperPortfolio{
  if(!input.positions.some(p=>p.id===id))throw new Error('Position not available.');
  // Keep the last ratcheted stop as a protective fixed stop.
  return {...input,positions:input.positions.map(p=>p.id!==id?p:{...p,dynamicTrailing:undefined})};
}
export function applyDynamicTrailingFromBars(
  input:PaperPortfolio,market:Asset,timeframe:DynamicTrailTimeframe,rawBars:readonly OHLCV[],nowMs:number
):PaperPortfolio{
  const bars=completedDynamicBars(rawBars,timeframe,nowMs);
  if(!bars.length)return input;
  let changed=false;
  const positions=input.positions.map((position:PaperPosition)=>{
    const config=position.dynamicTrailing;
    if(!config||config.timeframe!==timeframe||!validDynamicTrail(config)||!matchesExactMarket(position,market))return position;
    const level=calculateChandelier(bars,config.period,config.multiplier,config.lookback);
    if(!level||level.barTime<=(config.lastBarTime??0))return position;
    const candidate=position.side==='Long'?level.longStop:level.shortStop;
    if(!Number.isFinite(candidate)||candidate<=0)return position;
    // The stop can only be tightened, and future ticks determine execution.
    // Never assume the backfilled candle itself provided an executable fill.
    const stop=position.sl===undefined?candidate:
      position.side==='Long'?Math.max(candidate,position.sl):Math.min(candidate,position.sl);
    changed=true;
    return {...position,sl:stop,dynamicTrailing:{...config,lastBarTime:level.barTime,atr:level.atr}};
  });
  return changed?{...input,positions}:input;
}
