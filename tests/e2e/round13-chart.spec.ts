import {test,expect} from '@playwright/test';
import {isolateExternalFeeds} from './market-fixtures';

test.beforeEach(async({page})=>{
  await isolateExternalFeeds(page);
  await page.routeWebSocket('wss://ws-feed.exchange.coinbase.com',webSocket=>{webSocket.close();});
});
const venueBars=()=>{
  const until=Math.floor(Date.now()/60000)*60-60;
  return Array.from({length:100},(_,index)=>{
    const start=until-(99-index)*60,open=100+index*0.1,close=open+0.05;
    return [start,open-0.2,close+0.2,open,close,10+index];
  }).reverse();
};

test('blank chart explains missing data, retries exact venue, and draws returned history',async({page})=>{
  let calls=0,errors:string[]=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('https://api.exchange.coinbase.com/products/BTC-USD/candles**',async route=>{
    calls++;
    await route.fulfill({status:200,contentType:'application/json',
      headers:{'Access-Control-Allow-Origin':'*'},body:JSON.stringify(calls===1?[]:venueBars())});
  });
  await page.goto('./');
  const empty=page.locator('#chart-data-recovery');
  await expect(empty).toBeVisible();
  await expect(empty).toContainText('No verified Coinbase candles');
  await expect(empty.getByRole('button',{name:'Retry history'})).toBeVisible();
  await empty.getByRole('button',{name:'Retry history'}).click();
  await expect(empty).toHaveCount(0);
  await expect(page.locator('#chart-top-legend-header')).toContainText('BTCUSD');
  await expect(page.locator('#chart-top-legend-header')).toContainText('O');
  await expect(page.locator('#chart-workspace-viewport')).toBeVisible();
  const height=await page.locator('#chart-workspace-viewport').evaluate(element=>element.getBoundingClientRect().height);
  expect(height).toBeGreaterThan(160);
  await page.locator('#chart-session-vwap-toggle').click();
  await expect(page.locator('#chart-session-vwap-toggle')).toHaveAttribute('aria-pressed','true');
  await expect(page.getByText('UTC Session VWAP · OHLCV approximation')).toBeVisible();
  expect(calls).toBeGreaterThanOrEqual(2);
  expect(errors).toEqual([]);
});

test('saved exact-venue Kraken perpetual is never silently replaced, and recovery choices are explicit',async({page})=>{
  await page.route('https://api.exchange.coinbase.com/products/BTC-USD/candles**',r=>
    r.fulfill({status:200,contentType:'application/json',body:'[]'}));
  await page.goto('./');
  await page.evaluate(()=>{
    localStorage.setItem('tv_active_symbol','PF_ARBUSD');
    localStorage.setItem('plutrade_active_source','Kraken');
    localStorage.setItem('plutrade_active_market_type','swap');
  });
  await page.reload();
  const empty=page.locator('#chart-data-recovery');
  await expect(empty).toBeVisible();
  await expect(empty).toContainText('PF_ARBUSD · Kraken');
  const switcher=empty.getByRole('button',{name:'BTCUSD · Coinbase'});
  await expect(switcher).toBeVisible();
  await switcher.click();
  await expect(page.locator('#chart-top-legend-header')).toContainText('BTCUSD');
});
