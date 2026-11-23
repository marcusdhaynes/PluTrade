import type {Asset,OHLCV,Timeframe} from '../types';
import {candleBucketEnd} from './candleTimeframes';

export type CustomIntervalUnit='ticks'|'seconds'|'minutes'|'hours'|'days'|'weeks'|'months'|'years';
export interface CustomInterval {count:number;unit:CustomIntervalUnit}
export const CUSTOM_INTERVAL_UNITS:readonly CustomIntervalUnit[]=[
  'ticks','seconds','minutes','hours','days','weeks','months','years',
];
export function isCustomInterval(value:unknown):value is CustomInterval {
  if(!value||typeof value!=='object')return false;
  const v=value as Record<string,unknown>;
  return Number.isInteger(v.count)&&Number(v.count)>=1&&Number(v.count)<=999&&
    typeof v.unit==='string'&&CUSTOM_INTERVAL_UNITS.includes(v.unit as CustomIntervalUnit);
}
/** Never pretend time-based OHLC candles can be reinterpreted as individual ticks.
 * Tick bars require actual historical trade prints, not the current OHLC feed. */
export function customIntervalBase(custom:CustomInterval,asset:Asset):
  {base:Timeframe;warning?:string}|{base:null;warning:string} {
  if(!isCustomInterval(custom))return {base:null,warning:'Choose a whole number from 1 to 999.'};
  if(custom.unit==='ticks')
    return {base:null,warning:'Tick bars require a verified historical individual-trade feed. They cannot be constructed from time candles.'};
  if(custom.unit==='seconds'){
    const source=(asset.source||asset.exchange).toLowerCase().trim();
    if(source!=='binance'&&source!=='binance.us')
      return {base:null,warning:'This market has no verified 1-second historical candles; custom second charts are unavailable.'};
    return {base:'1s'};
  }
  const base:Record<Exclude<CustomIntervalUnit,'ticks'|'seconds'>,Timeframe>={
    minutes:'1m',hours:'1h',days:'1D',weeks:'1W',months:'1M',years:'1M',
  };
  return {base:base[custom.unit]};
}
export function customIntervalLabel(value:CustomInterval):string {
  const short:Record<CustomIntervalUnit,string>={
    ticks:'T',seconds:'s',minutes:'m',hours:'h',days:'D',weeks:'W',months:'M',years:'Y',
  };
  return value.count+short[value.unit];
}
export function customBucketStart(time:number,interval:CustomInterval):number{
  if(!isCustomInterval(interval)||!Number.isFinite(time)||time<=0)return 0;
  const {count,unit}=interval;
  if(unit==='ticks')return 0;
  if(unit==='months'||unit==='years'){
    const date=new Date(time*1000);
    const months=date.getUTCFullYear()*12+date.getUTCMonth();
    const stride=count*(unit==='years'?12:1);
    const start=Math.floor(months/stride)*stride;
    return Date.UTC(Math.floor(start/12),start%12,1)/1000;
  }
  // ISO weeks begin Monday at UTC midnight, not a floating 7-day window.
  if(unit==='weeks'){
    const mondayEpoch=Date.UTC(1970,0,5)/1000;
    const length=count*7*86400;
    return mondayEpoch+Math.floor((time-mondayEpoch)/length)*length;
  }
  const seconds:Record<'seconds'|'minutes'|'hours'|'days',number>={
    seconds:1,minutes:60,hours:3600,days:86400,
  };
  const width=count*seconds[unit];
  return Math.floor(time/width)*width;
}
export function customBucketEnd(start:number,interval:CustomInterval):number{
  if(!isCustomInterval(interval)||start<=0)return 0;
  const date=new Date(start*1000);
  if(interval.unit==='months')
    return Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+interval.count,1)/1000;
  if(interval.unit==='years')
    return Date.UTC(date.getUTCFullYear()+interval.count,0,1)/1000;
  const widths:Record<Exclude<CustomIntervalUnit,'ticks'|'months'|'years'>,number>={
    seconds:1,minutes:60,hours:3600,days:86400,weeks:604800,
  };
  if(interval.unit==='ticks')return 0;
  return start+interval.count*widths[interval.unit];
}
/** Aggregate only actual, consecutive lower-timeframe OHLC bars.
 * A truncated first bucket, source gaps and incomplete closed buckets are not
 * displayed as if they were verified complete aggregates. Current forming
 * buckets may display as provisional, as normal streaming candles do. */
export function resampleCustomCandles(
  source:readonly OHLCV[],interval:CustomInterval,base:Timeframe,nowSeconds=Date.now()/1000
):OHLCV[] {
  if(!isCustomInterval(interval)||interval.unit==='ticks')return [];
  const input=[...source].filter(b=>b.time>0&&
    [b.time,b.open,b.high,b.low,b.close,b.volume].every(Number.isFinite)&&
    b.open>0&&b.close>0&&b.low>0&&b.high>=Math.max(b.open,b.close)&&
    b.low<=Math.min(b.open,b.close))
    .sort((a,b)=>a.time-b.time);
  const groups=new Map<number,OHLCV[]>();
  for(const bar of input){
    const start=customBucketStart(bar.time,interval);
    if(!start)continue;
    const list=groups.get(start)||[];
    if(list.at(-1)?.time===bar.time)list[list.length-1]=bar;
    else list.push(bar);
    groups.set(start,list);
  }
  const results:OHLCV[]=[];
  for(const [start,bars] of [...groups].sort((a,b)=>a[0]-b[0])){
    const end=customBucketEnd(start,interval);
    if(!bars.length||bars[0].time!==start||end<=start)continue;
    if(bars.some((bar,i)=>i>0&&candleBucketEnd(bars[i-1].time,base)!==bar.time))
      continue;
    const last=bars[bars.length-1];
    if(nowSeconds>=end&&candleBucketEnd(last.time,base)!==end)continue;
    results.push({
      time:start,open:bars[0].open,
      high:Math.max(...bars.map(b=>b.high)),low:Math.min(...bars.map(b=>b.low)),
      close:last.close,volume:bars.reduce((sum,b)=>sum+b.volume,0),
    });
  }
  return results;
}
