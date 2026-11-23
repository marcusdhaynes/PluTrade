import type {Asset,Timeframe} from '../types';
import {marketIdentity} from './marketIdentity';

export type ChartLoadState='loading'|'ready'|'empty'|'error';

const supportedHistorySources=new Set(['coinbase','binance','binance.us','kraken','okx','bybit','hyperliquid (hyperliquid)']);
export function canOfferPublicHistory(asset:Asset):boolean{
  if(asset.pairAddress&&asset.chainId)return true;
  return supportedHistorySources.has((asset.source||asset.exchange).trim().toLowerCase());
}
/** Choose a widely available, exact spot market for new installations only. Existing selections remain untouched. */
export function chartStarterMarket(assets:readonly Asset[]):Asset{
  return assets.find(a=>a.symbol==='BTCUSD'&&a.marketType==='spot'&&
    (a.source||a.exchange).toLowerCase()==='coinbase')||assets.find(canOfferPublicHistory)||assets[0];
}
export function recoveryMarkets(assets:readonly Asset[],active:Asset,limit=5):Asset[]{
  const picks=[['BTCUSD','coinbase'],['ETHUSD','coinbase'],['BTCUSDT','binance'],['ARBUSD','kraken']];
  const chosen:Asset[]=[];
  for(const [symbol,source] of picks){
    const a=assets.find(x=>x.symbol===symbol&&x.marketType==='spot'&&
      (x.source||x.exchange).trim().toLowerCase()===source);
    if(a&&marketIdentity(a)!==marketIdentity(active)&&
      !chosen.some(x=>marketIdentity(x)===marketIdentity(a)))chosen.push(a);
  }
  return chosen.slice(0,limit);
}
export function chartEmptyExplanation(asset:Asset,timeframe:Timeframe,state:ChartLoadState):string{
  const source=asset.source||asset.exchange;
  if(state==='loading')return 'Loading genuine '+source+' candles for '+asset.symbol+' at '+timeframe+'…';
  if(['1s','5s','15s','30s'].includes(timeframe)&&
    !['binance','binance.us'].includes(source.toLowerCase()))
    return source+' has no supported native second-by-second history for '+timeframe+'. Choose 1m or 1h.';
  if(!canOfferPublicHistory(asset))return 'No authenticated historical feed is connected for '+source+'. Select a supported exchange.';
  return state==='error'?
    'The '+source+' history request failed. Check the provider or network and retry.':
    'No verified '+source+' candles were returned for this market and interval. No synthetic prices will be shown.';
}
