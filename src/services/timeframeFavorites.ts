import type {Timeframe} from '../types';
import {marketIdentity} from './marketIdentity';
import type {Asset} from '../types';

export const CHART_INTERVALS:readonly Timeframe[]=[
  '1s','5s','15s','30s','1m','3m','5m','15m','30m','45m',
  '1h','2h','3h','4h','1D','1W','1M','3M','12M',
] as const;
export type IntervalFavorites=Record<string,Timeframe[]>;
export const TIMEFRAME_FAVORITES_KEY='plutrade_timeframe_favorites_per_market_v1';

const allowed=new Set<string>(CHART_INTERVALS);
export function sanitizeTimeframeFavorites(raw:unknown):IntervalFavorites{
  if(!raw||typeof raw!=='object'||Array.isArray(raw))return {};
  const results:IntervalFavorites={};
  for(const [key,value] of Object.entries(raw)){
    if(!key||key.length>256||!Array.isArray(value))continue;
    const selected=new Set(value.filter((item):item is Timeframe=>
      typeof item==='string'&&allowed.has(item)));
    results[key]=CHART_INTERVALS.filter(tf=>selected.has(tf));
  }
  return results;
}
export function marketTimeframeKey(asset:Asset):string{return marketIdentity(asset);}
export function visibleTimeframeIntervals(favorites:IntervalFavorites,key:string):Timeframe[]{
  const selected=favorites[key]||[];
  return selected.length ? CHART_INTERVALS.filter(tf=>selected.includes(tf)) : [...CHART_INTERVALS];
}
export function updateMarketTimeframes(
  current:IntervalFavorites,key:string,selected:readonly Timeframe[]
):IntervalFavorites{
  const clean=sanitizeTimeframeFavorites({...current,[key]:selected});
  // Zero favorites deliberately displays all intervals for this ticker.
  if(!clean[key]?.length)delete clean[key];
  return clean;
}
