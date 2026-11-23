import type {OHLCV} from '../types';
export type VwapPoint={time:number;value:number};
/** UTC calendar-day session VWAP using native bar typical-price x volume.
 * This is not trade-level VWAP, exchange-session-aware VWAP, or a volume footprint. */
export function calculateUtcSessionVwap(bars:readonly OHLCV[]):VwapPoint[]{
  const result:VwapPoint[]=[];
  let day=-1,pv=0,volume=0,lastTime=0;
  for(const bar of bars){
    if(!Number.isInteger(bar.time)||bar.time<=lastTime||
      ![bar.high,bar.low,bar.close,bar.volume].every(Number.isFinite)||
      bar.low<=0||bar.high<bar.low||bar.volume<0)continue;
    lastTime=bar.time;
    const d=Math.floor(bar.time/86400);
    if(d!==day){day=d;pv=0;volume=0;}
    const typical=(bar.high+bar.low+bar.close)/3;
    pv+=typical*bar.volume;
    volume+=bar.volume;
    if(volume>0)result.push({time:bar.time,value:pv/volume});
  }
  return result;
}
/** Anchored VWAP never uses earlier bars; anchor is UTC Unix seconds. */
export function calculateAnchoredVwap(bars:readonly OHLCV[],anchor:number):VwapPoint[]{
  if(!Number.isFinite(anchor)||anchor<0)return [];
  const selected=bars.filter(b=>b.time>=anchor);
  let pv=0,volume=0,lastTime=0;
  const out:VwapPoint[]=[];
  for(const b of selected){
    if(!Number.isInteger(b.time)||b.time<=lastTime||b.volume<0||
      ![b.low,b.high,b.close,b.volume].every(Number.isFinite)||b.low<=0||b.high<b.low)continue;
    lastTime=b.time;pv+=(b.high+b.low+b.close)/3*b.volume;volume+=b.volume;
    if(volume>0)out.push({time:b.time,value:pv/volume});
  }
  return out;
}
