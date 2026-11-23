import {test,expect} from '@playwright/test';
import {isolateExternalFeeds} from './market-fixtures';

test.beforeEach(async({page})=>{
  await isolateExternalFeeds(page);
  await page.routeWebSocket('wss://ws-feed.exchange.coinbase.com',socket=>socket.close());
  await page.route('https://api.exchange.coinbase.com/products/BTC-USD/candles**',route=>{
    const last=Math.floor(Date.now()/60000)*60-60;
    const data=Array.from({length:120},(_,i)=>{
      const time=last-(119-i)*60,open=100+i*0.05,close=open+0.03;
      return [time,open-0.1,close+0.1,open,close,10+i];
    }).reverse();
    return route.fulfill({status:200,contentType:'application/json',
      headers:{'Access-Control-Allow-Origin':'*'},body:JSON.stringify(data)});
  });
});

test('chart legend controls open real menus and the price series can be hidden and restored',async({page})=>{
  const errors:string[]=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto('./');
  await expect(page.locator('#chart-data-recovery')).toHaveCount(0);
  const chart=page.locator('#chart-top-legend-header');
  await expect(chart).toContainText('BTCUSD');
  await chart.getByRole('button',{name:'Hide price series'}).click();
  await expect(chart.getByRole('button',{name:'Show price series'})).toBeVisible();
  await chart.getByRole('button',{name:'Show price series'}).click();
  await expect(chart.getByRole('button',{name:'Hide price series'})).toBeVisible();
  await chart.getByRole('button',{name:'Chart options'}).click();
  await expect(page.getByRole('menu',{name:'Chart options menu'})).toBeVisible();
  await page.getByRole('menuitem',{name:'Fit all candles'}).click();
  await expect(page.getByRole('menu',{name:'Chart options menu'})).toHaveCount(0);
  await chart.getByRole('button',{name:'Edit chart indicators'}).click();
  await expect(page.locator('#indicators-modal-window')).toBeVisible();
  await page.locator('#close-indicators-modal-btn').click();
  await chart.getByRole('button',{name:'Change chart symbol'}).click();
  await expect(page.locator('#symbol-search-modal-window')).toBeVisible();
  await page.locator('#close-symbol-search-modal').click();
  await page.getByTitle('Indicators and chart studies settings').click();
  await expect(page.locator('#indicators-modal-window')).toBeVisible();
  await page.locator('#close-indicators-modal-btn').click();
  expect(errors).toEqual([]);
});

test('drawings stay active when enabled, locking blocks deletion, and zoom/favorites toggles work',async({page})=>{
  const errors:string[]=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto('./');
  await expect(page.locator('#chart-data-recovery')).toHaveCount(0);
  const tools=page.locator('#tradingview-left-toolbar');
  await tools.getByRole('button',{name:'Zoom chart in'}).click();
  const keep=tools.getByTitle('Stay in Drawing Mode');
  await keep.click();
  await expect(keep).toHaveAttribute('aria-pressed','true');
  await page.getByTitle('Trend Line').click();
  const overlay=page.locator('#tradingview-drawing-overlay');
  await expect(overlay).toBeVisible();
  await overlay.click({position:{x:210,y:160}});
  await overlay.click({position:{x:300,y:200}});
  await expect(page.locator('#drawing-selected-bar')).toBeVisible();
  await expect(page.locator('#left-tool-line-group')).toHaveClass(/bg-\[#2962ff\]/);
  await tools.getByTitle('Lock All Drawings').click();
  await expect(tools.getByTitle('Unlock All Drawings')).toHaveAttribute('aria-pressed','true');
  await expect(page.locator('#drawing-selected-bar')).toHaveCount(0);
  await expect(page.locator('#clear-all-drawings-btn')).toBeDisabled();
  await tools.getByTitle('Unlock All Drawings').click();
  await expect(page.locator('#clear-all-drawings-btn')).toBeEnabled();
  await tools.locator('#hide-drawings-toggle-btn').click();
  await expect(overlay).toHaveCount(0);
  await tools.locator('#hide-drawings-toggle-btn').click();
  await expect(overlay).toBeVisible();
  const favorites=page.getByRole('button',{name:'Toggle quick drawing tools'});
  await favorites.click();
  await expect(favorites).toHaveAttribute('aria-pressed','false');
  await favorites.click();
  await expect(favorites).toHaveAttribute('aria-pressed','true');
  expect(errors).toEqual([]);
});

test('damaged toolbar preferences cannot crash chart startup',async({page})=>{
  const errors:string[]=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto('./');
  await page.evaluate(()=>{
    localStorage.setItem('tv_starred_drawing_tools','{not-json');
    localStorage.setItem('tv_selected_line_tool','not-a-drawing-tool');
    localStorage.setItem('tv_drawing_locked','not-json');
    localStorage.setItem('tv_drawing_stay_mode','not-json');
  });
  await page.reload();
  await expect(page.locator('#tradingview-app-root')).toBeVisible();
  await expect(page.locator('#chart-top-legend-header')).toContainText('BTCUSD');
  await expect(page.locator('#tradingview-left-toolbar')).toBeVisible();
  expect(errors).toEqual([]);
});


test('bottom-bar date navigation rejects unloaded dates and time scale inputs adjust the active chart',async({page})=>{
  const errors:string[]=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto('./');
  await expect(page.locator('#chart-data-recovery')).toHaveCount(0);
  await page.locator('#go-to-chart-date-btn').click();
  const panel=page.getByRole('dialog',{name:'Go to chart date'});
  await expect(panel).toBeVisible();
  await panel.getByLabel('Chart date').fill('2000-01-01');
  await panel.getByRole('button',{name:'Go'}).click();
  await expect(panel.getByRole('alert')).toContainText('No loaded market candles');
  await panel.getByLabel('Chart date').fill(new Date(Date.now()-45*60000).toISOString().slice(0,10));
  await panel.getByRole('button',{name:'Go'}).click();
  await expect(panel).toHaveCount(0);
  await page.locator('#time-scale-settings-btn').click();
  const settings=page.getByRole('dialog',{name:'Time scale settings'});
  await expect(settings).toBeVisible();
  await settings.getByLabel('Bar spacing').fill('9');
  await settings.getByLabel('Right offset').fill('8');
  await expect(settings.getByRole('alert')).toHaveCount(0);
  await settings.getByRole('button',{name:'Close'}).click();
  await expect(settings).toHaveCount(0);
  expect(errors).toEqual([]);
});
