import type {Asset,PriceAlert,Timeframe} from '../types';
import {alertMarketIdentity} from './marketIdentity';

export type AlertCondition=PriceAlert['condition'];
export type AlertFrequency=NonNullable<PriceAlert['frequency']>;
export interface AlertObservation{
  kind:'tick'|'closed-bar';
  /** Original venue candle timestamp, Unix seconds. Mandatory for bar-close frequency. */
  barTime?:number;
  timeframe?:Timeframe;
}
export const ALERT_CONDITIONS:readonly AlertCondition[]=[
  'cross_above','cross_below','crossing','greater_than','less_than',
];
export const ALERT_FREQUENCIES:readonly AlertFrequency[]=[
  'once','every','once_per_minute','once_per_bar','once_per_bar_close',
];
export function alertTimeframeSeconds(value:string|undefined):number{
  const secs:Record<string,number>={
    '1s':1,'5s':5,'15s':15,'30s':30,
    '1m':60,'3m':180,'5m':300,'15m':900,'30m':1800,'45m':2700,
    '1h':3600,'2h':7200,'3h':10800,'4h':14400,
    '1D':86400,'1W':604800,
  };
  return secs[value||'1m']||60;
}
export function alertIsExpired(alert:PriceAlert,at:number):boolean{
  return Number.isFinite(alert.expiresAt)&&alert.expiresAt!<=at;
}
export function alertMatchesExactMarket(alert:PriceAlert,asset:Asset):boolean{
  if(!alert.exchange||!alert.marketType||alert.symbol!==asset.symbol||
    alert.exchange!==(asset.source||asset.exchange)||alert.marketType!==asset.marketType)return false;
  if(asset.pairAddress||alert.pairAddress)
    return Boolean(asset.pairAddress&&alert.pairAddress&&asset.chainId&&alert.chainId&&
      asset.pairAddress.toLowerCase()===alert.pairAddress.toLowerCase()&&
      asset.chainId.toLowerCase()===alert.chainId.toLowerCase());
  return alertMarketIdentity(alert)===alertMarketIdentity(asset);
}
export function evaluatePriceAlerts(
  alerts:readonly PriceAlert[],asset:Asset,previous:number|undefined,price:number,at:number,
  observation:AlertObservation
):{updated:PriceAlert[];hits:PriceAlert[]}{
  if(!Number.isFinite(price)||price<=0||!Number.isFinite(at)||at<=0)return {updated:[...alerts],hits:[]};
  const hits:PriceAlert[]=[];
  const updated=alerts.map(alert=>{
    if(alert.paused||alert.triggered||alertIsExpired(alert,at)||
      !alertMatchesExactMarket(alert,asset)||!Number.isFinite(alert.targetPrice)||alert.targetPrice<=0)return alert;
    const freq=alert.frequency||'once';
    if(!ALERT_FREQUENCIES.includes(freq)||!ALERT_CONDITIONS.includes(alert.condition))return alert;
    const closeOnly=freq==='once_per_bar_close';
    if(closeOnly && (observation.kind!=='closed-bar'||!Number.isInteger(observation.barTime)||
      !observation.timeframe||alert.timeframe!==observation.timeframe))return alert;
    if(!closeOnly && observation.kind!=='tick')return alert;
    const target=alert.targetPrice;
    const hasPrevious=Number.isFinite(previous)&&previous!>0;
    const crossedUp=hasPrevious&&previous!<target&&price>=target;
    const crossedDown=hasPrevious&&previous!>target&&price<=target;
    const eligible=alert.condition==='cross_above'?crossedUp:
      alert.condition==='cross_below'?crossedDown:
      alert.condition==='crossing'?crossedUp||crossedDown:
      alert.condition==='greater_than'?price>target:price<target;
    if(!eligible)return alert;
    // A repeated event in the same minute/bar cannot issue duplicate notifications.
    if(freq==='once_per_minute'&&alert.lastTriggeredAt!==undefined&&at-alert.lastTriggeredAt<60000)return alert;
    const barId=observation.kind==='closed-bar'?observation.barTime!:
      Math.floor(at/1000/alertTimeframeSeconds(alert.timeframe))*
        alertTimeframeSeconds(alert.timeframe);
    if((freq==='once_per_bar'||closeOnly)&&alert.lastTriggeredBar===barId)return alert;
    const next:PriceAlert={...alert,
      triggered:freq==='once',lastTriggeredAt:at,
      lastTriggeredBar:(freq==='once_per_bar'||closeOnly)?barId:alert.lastTriggeredBar};
    hits.push(next);
    return next;
  });
  return {updated,hits};
}
