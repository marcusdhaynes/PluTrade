import type {DrawingPoint,OHLCV} from '../types';
export interface RulerMetrics{
  priceDelta:number;percentDelta:number;tickDelta:number;
  seconds:number;bars:number;
  priceLabel:string;percentLabel:string;tickLabel:string;timeLabel:string;
}
function compactDuration(seconds:number){
  if(!Number.isFinite(seconds))return '—';
  const total=Math.round(Math.abs(seconds));
  const d=Math.floor(total/86400),h=Math.floor(total%86400/3600),m=Math.floor(total%3600/60),s=total%60;
  const parts=[d?d+'d':'',h?h+'h':'',m?m+'m':'',s?s+'s':''].filter(Boolean);
  return (seconds<0?'−':'')+(parts.length?parts.slice(0,2).join(' '):'0s');
}
export function rulerMetrics(start:DrawingPoint,end:DrawingPoint,bars:OHLCV[],digits=2):RulerMetrics{
  const dp=end.price-start.price;
  const pct=start.price!==0?dp/start.price*100:0;
  const precision=Math.min(Math.max(0,Math.floor(digits)),10);
  const tick=10**(-precision);
  const begin=Math.min(start.time,end.time),finish=Math.max(start.time,end.time);
  // Number of *observed* bars between anchor points; missing sessions and
  // irregular feeds are not assumed to contain candles.
  const actualBars=bars.filter(x=>x.time>begin&&x.time<=finish).length;
  const sign=dp>0?'+':dp<0?'−':'';
  const count=Math.abs(dp)/tick;
  return {
    priceDelta:dp,percentDelta:pct,tickDelta:count,
    seconds:end.time-start.time,bars:actualBars,
    priceLabel:sign+Math.abs(dp).toFixed(precision),
    percentLabel:(pct>0?'+':pct<0?'−':'')+Math.abs(pct).toFixed(2)+'%',
    tickLabel:Number.isFinite(count)?Math.round(count).toLocaleString()+' ticks':'—',
    timeLabel:compactDuration(end.time-start.time)+' · '+actualBars+' bars',
  };
}
