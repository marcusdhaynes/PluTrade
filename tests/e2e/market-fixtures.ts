import type {Page} from '@playwright/test';

/** Browser UI tests should not depend on third-party exchange CORS or uptime.
 * Deliberately supply NO MARKET DATA. Accuracy of real feeds is tested separately.
 */
export async function isolateExternalFeeds(page:Page):Promise<void>{
  const headers={'Access-Control-Allow-Origin':'*','Content-Type':'application/json'};
  await page.route('https://plutrade-market-api.vercel.app/**',route=>
    route.fulfill({status:200,headers,body:JSON.stringify({candles:[]})}));
  await page.route('https://futures.kraken.com/**',route=>
    route.fulfill({status:200,headers,body:JSON.stringify({tickers:[]})}));
  // Symbol search may scan several public venue directories. Keep UI tests
  // independent from provider uptime, rate limits and WebKit's CORS policy:
  // empty catalogs mean unavailable, never manufactured market prices.
  await page.route('https://api.bybit.com/**',route=>
    route.fulfill({status:200,headers,body:JSON.stringify({retCode:0,result:{list:[],nextPageCursor:''}})}));
  await page.route('https://data-api.binance.vision/**',route=>
    route.fulfill({status:200,headers,body:JSON.stringify({symbols:[]})}));
}
