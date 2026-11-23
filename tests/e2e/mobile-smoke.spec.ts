import {test,expect} from '@playwright/test';
import {isolateExternalFeeds} from './market-fixtures';

test.beforeEach(async ({page})=>{await isolateExternalFeeds(page);});

test('narrow-screen application launches without a fatal browser exception',async ({page})=>{
  const errors:string[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto('./');
  await expect(page.locator('#tradingview-app-root')).toBeVisible();
  await expect(page.locator('#tradingview-right-icon-bar')).toBeAttached();
  expect(errors).toEqual([]);
});


test('mobile keeps a single five-action trading row and preloads equity sizing',async ({page})=>{
  const errors:string[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto('./');
  const bar=page.locator('#plutrade-mobile-trade-controls');
  await expect(bar).toBeVisible();
  const actions=bar.locator('div[aria-label="Mobile trading controls"] > button');
  await expect(actions).toHaveCount(5);
  const rects=await actions.evaluateAll(buttons=>buttons.map(button=>({
    top:Math.round(button.getBoundingClientRect().top),
    right:button.getBoundingClientRect().right,
  })));
  expect(new Set(rects.map(r=>r.top)).size).toBe(1);
  expect(rects.at(-1)!.right).toBeLessThanOrEqual(await page.evaluate(()=>innerWidth+1));
  await actions.nth(2).click();
  const equity=page.getByRole('dialog',{name:'Equity allocation'});
  await expect(equity).toBeVisible();
  await equity.getByRole('spinbutton',{name:'Percent of equity'}).fill('50');
  await equity.getByRole('button',{name:'Apply to Entry'}).click();
  await expect(actions.nth(2)).toContainText('50%');
  await actions.first().click();
  const ticket=page.getByRole('dialog',{name:'Paper Trading order entry'});
  await expect(ticket).toBeVisible();
  await expect(ticket.getByRole('spinbutton',{name:'Order size'})).toHaveValue('50');
  await expect(ticket.getByRole('button',{name:'% Equity'})).toBeVisible();
  await ticket.getByTitle('Close order panel').click();
  await actions.nth(3).click();
  await expect(page.getByRole('dialog',{name:'Stop loss options'})).toBeVisible();
  await page.getByRole('button',{name:/Open Entry Ticket/}).click();
  await expect(ticket.getByRole('switch',{name:'Enable stop loss'})).toHaveAttribute('aria-checked','true');
  expect(errors).toEqual([]);
});

test('holding TP reveals the advanced entry path without placing an order',async ({page})=>{
  await page.goto('./');
  const button=page.locator('#plutrade-mobile-trade-controls div[aria-label="Mobile trading controls"] > button').nth(4);
  await button.dispatchEvent('pointerdown',{pointerType:'touch'});
  await page.waitForTimeout(510);
  await button.dispatchEvent('pointerup',{pointerType:'touch'});
  await expect(page.getByRole('dialog',{name:'Take profit options'})).toBeVisible();
  await page.getByRole('button',{name:/Open Entry Ticket/}).click();
  const ticket=page.getByRole('dialog',{name:'Paper Trading order entry'});
  await expect(ticket.getByRole('switch',{name:'Enable take profit'})).toHaveAttribute('aria-checked','true');
  await expect(page.locator('#plutrade-mobile-trade-controls')).toBeVisible();
});


test('toolbar Edit applies hidden controls; Default requires two taps to restore',async ({page})=>{
  await page.goto('./');
  const edit=page.locator('#left-toolbar-edit');
  const reset=page.locator('#left-toolbar-reset');
  const zoom=page.getByRole('button',{name:'Zoom chart in'});
  await expect(edit).toBeVisible();
  await expect(reset).toHaveCount(0);
  await expect(zoom).toBeVisible();
  await expect(page.getByRole('button',{name:'Toggle favorite drawing tools'})).toHaveCount(0);
  await edit.click();
  await expect(reset).toBeVisible();
  await expect(edit).toHaveAttribute('aria-pressed','true');
  await page.getByRole('button',{name:'Hide Zoom In'}).click();
  await expect(page.locator('[data-toolbar-slot="zoom"]')).toHaveAttribute('data-toolbar-visible','false');
  await edit.click();
  await expect(reset).toHaveCount(0);
  await expect(zoom).toHaveCount(0);
  await edit.click();
  await expect(reset).toBeVisible();
  await reset.click();
  await expect(reset).toHaveAttribute('aria-label','Confirm reset toolbar to default');
  // In Edit mode, a hidden slot remains as a dimmed placeholder so the user
  // can re-enable it; it disappears only after Apply is clicked.
  await expect(page.locator('[data-toolbar-slot="zoom"]')).toHaveAttribute('data-toolbar-visible','false');
  await reset.click();
  await expect(reset).toHaveCount(0);
  await expect(zoom).toBeVisible();
  await expect(page.locator('#left-toolbar-starred-tools > button')).toHaveCount(2);
});

test('mobile chart reserves time/price axes and disables page-touch zoom only on chart',async ({page})=>{
  await page.goto('./');
  const chart=page.locator('[data-testid="chart-pinch-surface"]').first();
  await expect(chart).toBeVisible();
  await expect(chart).toHaveCSS('touch-action','none');
  await expect(chart.getByLabel('Trading chart with time axis at bottom and price axis at right')).toBeAttached();
  await expect(page.locator('meta[name="viewport"]')).toHaveAttribute('content',/width=device-width/);
  const root=page.locator('#tradingview-app-root');
  expect(await root.evaluate(node=>node.scrollWidth<=window.innerWidth+1)).toBe(true);
});


test('right tool rail is attached, visible and usable without a hamburger',async ({page})=>{
  await page.goto('./');
  const rail=page.locator('#tradingview-right-icon-bar');
  const dock=page.locator('#tradingview-right-dock');
  await expect(rail).toBeVisible();
  await expect(page.locator('#mobile-right-sidebar-menu')).toHaveCount(0);
  const rect=await dock.boundingBox();
  const width=await page.evaluate(()=>innerWidth);
  expect(rect).not.toBeNull();
  expect(rect!.width).toBeGreaterThanOrEqual(25);
  expect(rect!.width).toBeLessThanOrEqual(34);
  expect(rect!.x+rect!.width).toBeGreaterThanOrEqual(width-1);
  expect(rect!.x+rect!.width).toBeLessThanOrEqual(width+1);
  await rail.locator('#right-tab-watchlist').click();
  await expect(page.locator('#right-sidebar-content-pane')).toBeVisible();
  await expect(rail).toBeVisible();
  await rail.locator('#right-tab-watchlist').click();
  await expect(page.locator('#right-sidebar-content-pane')).toHaveCount(0);
  await expect(rail).toBeVisible();
});


test('the timeframe selector replaces range controls above the plot; native axes stay on chart',async ({page})=>{
  await page.goto('./');
  const toolbar=page.locator('#tradingview-bottom-bar');
  const plot=page.locator('#chart-workspace-viewport');
  const chart=page.locator('[data-testid="chart-pinch-surface"]').first();
  await expect(toolbar).toBeVisible();
  await expect(toolbar).toHaveAttribute('data-layout','above-chart');
  await expect(plot).toBeVisible();
  await expect(chart).toBeVisible();
  const headerBox=await page.locator('#tradingview-top-navbar').boundingBox();
  const toolbarBox=await toolbar.boundingBox();
  const plotBox=await plot.boundingBox();
  const chartBox=await chart.boundingBox();
  expect(headerBox).not.toBeNull();
  expect(toolbarBox).not.toBeNull();
  expect(plotBox).not.toBeNull();
  expect(chartBox).not.toBeNull();
  expect(toolbarBox!.y).toBeGreaterThanOrEqual(headerBox!.y+headerBox!.height-1);
  expect(toolbarBox!.y+toolbarBox!.height).toBeLessThanOrEqual(plotBox!.y+1);
  expect(chartBox!.height).toBeGreaterThan(110);
  await expect(page.locator('#tradingview-top-navbar #chart-timeframe-bar')).toHaveCount(0);
  await expect(toolbar.locator('#chart-timeframe-bar')).toBeVisible();
  await expect(toolbar.locator('#chart-timeframe-scroll')).toBeVisible();
  await expect(toolbar.locator('#chart-timeframe-dropdown-trigger')).toBeVisible();
  await expect(toolbar.locator('#go-to-chart-date-btn')).toBeVisible();
  await expect(toolbar.locator('#timeframe-favorites-button')).toBeVisible();
  await expect(toolbar.locator('#range-btn-1D')).toHaveCount(0);
  const star=await toolbar.locator('#timeframe-favorites-button').boundingBox();
  const calendar=await toolbar.locator('#go-to-chart-date-btn').boundingBox();
  expect(star!.x).toBeGreaterThan(calendar!.x);
  await expect(page.getByLabel('Chart timeframe and calendar controls')).toBeVisible();
  await expect(chart.getByLabel('Trading chart with time axis at bottom and price axis at right')).toBeAttached();
  // Native Lightweight Charts renders separate axis cells inside its table,
  // not a fake date or price row outside the chart element.
  await expect(chart.locator('table').first()).toBeVisible();
});

test('portrait and landscape touch layouts fit without scrolling the application',async ({page})=>{
  for(const size of [{width:320,height:568},{width:390,height:844},{width:844,height:390}]){
    await page.setViewportSize(size);
    await page.goto('./');
    const mobileNav=page.locator('#plutrade-mobile-navbar');
    const chartRange=page.locator('#tradingview-bottom-bar');
    const trading=page.locator('#plutrade-mobile-trade-controls');
    await expect(mobileNav).toBeVisible();
    await expect(chartRange).toBeVisible();
    await expect(trading).toBeVisible();
    const geometry=await page.evaluate(()=>{
      const element=(id:string)=>document.getElementById(id)!.getBoundingClientRect();
      const nav=element('plutrade-mobile-navbar');
      const range=element('tradingview-bottom-bar');
      const chart=element('chart-workspace-viewport');
      const trade=element('plutrade-mobile-trade-controls');
      return {
        width:innerWidth,height:innerHeight,
        docWidth:document.documentElement.scrollWidth,
        docHeight:document.documentElement.scrollHeight,
        navRight:nav.right,rangeRight:range.right,tradeRight:trade.right,
        tradeBottom:trade.bottom,chartHeight:chart.height,
      };
    });
    expect(geometry.docWidth).toBeLessThanOrEqual(size.width+1);
    expect(geometry.docHeight).toBeLessThanOrEqual(size.height+1);
    expect(geometry.navRight).toBeLessThanOrEqual(size.width+1);
    expect(geometry.rangeRight).toBeLessThanOrEqual(size.width+1);
    expect(geometry.tradeRight).toBeLessThanOrEqual(size.width+1);
    expect(geometry.tradeBottom).toBeLessThanOrEqual(size.height+1);
    expect(geometry.chartHeight).toBeGreaterThan(80);
    await expect(page.locator('#chart-timeframe-bar')).toBeVisible();
    await expect(page.locator('#mobile-chart-action-rows')).toBeVisible();
    await expect(page.locator('#mobile-top-tools-trigger')).toHaveCount(0);
  }
});

test('mobile chart controls are always visible and visual style favorites can be pinned',async ({page})=>{
  await page.setViewportSize({width:320,height:568});
  await page.goto('./');
  await expect(page.locator('#mobile-symbol-search-trigger')).toBeVisible();
  await expect(page.locator('#mobile-timeframe-selector')).toHaveCount(0);
  await expect(page.locator('#mobile-top-tools-trigger')).toHaveCount(0);
  const rows=page.locator('#mobile-chart-action-rows');
  await expect(rows).toBeVisible();
  await expect(rows.getByRole('button',{name:'Alert'})).toBeVisible();
  await expect(rows.getByRole('button',{name:'Paper Trading'})).toBeVisible();
  await expect(rows.getByLabel('Mobile chart layout')).toBeVisible();

  const style=page.getByRole('button',{name:'Choose visual chart style'});
  await expect(style).toBeVisible();
  await style.click();
  const styles=page.getByRole('dialog',{name:'Chart styles'});
  await expect(styles).toBeVisible();
  await styles.getByRole('button',{name:'Favorite Line'}).click();
  await expect(page.locator('#mobile-chart-type-btn-line')).toBeVisible();
  await styles.getByRole('button',{name:'Chart style Line'}).click();
  await expect(styles).toHaveCount(0);
  await expect(page.locator('#mobile-chart-type-btn-line')).toHaveClass(/bg-\[#295ee8\]/);
  await style.click();
  await expect(styles).toBeVisible();
  await page.locator('#chart-timeframe-scroll').click({position:{x:3,y:5}});
  await expect(styles).toHaveCount(0);
  await rows.getByRole('button',{name:'Alert'}).click();
  await expect(page.locator('#alerts-modal-window')).toBeVisible();
});

test('all intervals scroll horizontally until ticker favorites are explicitly saved',async ({page})=>{
  await page.setViewportSize({width:320,height:568});
  await page.goto('./');
  const row=page.locator('#chart-timeframe-scroll');
  await expect(row).toBeVisible();
  const buttons=row.locator('button');
  await expect(buttons).toHaveCount(19);
  expect(await row.evaluate(node=>node.scrollWidth>node.clientWidth)).toBe(true);
  await expect(page.locator('#timeframe-dropdown-trigger')).toHaveCount(0);

  const star=page.locator('#timeframe-favorites-button');
  await star.click();
  const panel=page.getByRole('dialog',{name:/Favorite intervals for /});
  await expect(panel).toBeVisible();
  await panel.getByRole('button',{name:'Favorite 1m',exact:true}).click();
  await panel.getByRole('button',{name:'Favorite 1h',exact:true}).click();
  await panel.getByRole('button',{name:'Save for ticker'}).click();
  await expect(panel).toHaveCount(0);
  await expect(buttons).toHaveCount(2);
  await expect(row.locator('#tf-btn-1m')).toBeVisible();
  await expect(row.locator('#tf-btn-1h')).toBeVisible();
  await expect(row.locator('#tf-btn-3m')).toHaveCount(0);

  await page.reload();
  await expect(page.locator('#chart-timeframe-scroll button')).toHaveCount(2);
  await star.click();
  await panel.getByRole('button',{name:'Clear all'}).click();
  await panel.getByRole('button',{name:'Save for ticker'}).click();
  await expect(page.locator('#chart-timeframe-scroll button')).toHaveCount(19);
});


test('mobile has matched 24px execution/range bars and chart-corner settings',async ({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.goto('./');
  const execution=page.locator('#plutrade-mobile-trade-controls');
  const range=page.locator('#tradingview-bottom-bar');
  const corner=page.locator('#chart-corner-controls');
  await expect(execution).toBeVisible();
  await expect(range).toBeVisible();
  await expect(corner).toBeVisible();
  const executionRect=await execution.boundingBox();
  const rangeRect=await range.boundingBox();
  expect(executionRect).not.toBeNull();
  expect(rangeRect).not.toBeNull();
  expect(executionRect!.height).toBeGreaterThanOrEqual(23);
  expect(executionRect!.height).toBeLessThanOrEqual(25);
  expect(rangeRect!.height).toBeGreaterThanOrEqual(23);
  expect(rangeRect!.height).toBeLessThanOrEqual(25);
  await expect(page.locator('#paper-trading-collapsed-strip')).toBeHidden();
  await expect(page.locator('#percent-scale-toggle')).toHaveCount(0);
  await expect(page.locator('#log-scale-toggle')).toHaveCount(0);
  await expect(page.getByText('auto',{exact:true})).toHaveCount(0);
  const cornerRect=await corner.boundingBox();
  const chartRect=await page.locator('#chart-workspace-viewport').boundingBox();
  expect(cornerRect).not.toBeNull();
  expect(chartRect).not.toBeNull();
  expect(cornerRect!.x+cornerRect!.width).toBeLessThanOrEqual(chartRect!.x+chartRect!.width+1);
  expect(cornerRect!.y+cornerRect!.height).toBeLessThanOrEqual(chartRect!.y+chartRect!.height+1);
  await page.locator('#time-scale-settings-btn').click();
  await expect(page.getByRole('dialog',{name:'Time scale settings'})).toBeVisible();
  await page.getByRole('dialog',{name:'Time scale settings'}).getByRole('button',{name:'Close'}).click();
  await page.locator('#fit-chart-content-btn').click();
  await expect(execution).toBeVisible();
});

test('mobile paper workspace remains accessible through actions after removing collapsed strip',async ({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.goto('./');
  await page.locator('#mobile-chart-action-rows').getByRole('button',{name:'Paper Trading'}).click();
  await expect(page.locator('#paper-trading-open-panel')).toBeVisible();
  await expect(page.locator('#plutrade-mobile-trade-controls')).toBeVisible();
  await expect(page.locator('#tradingview-right-icon-bar')).toBeVisible();
});

test('attached right rail, trading strip and chart fit 320px portrait and touch landscape',async ({page})=>{
  for(const size of [{width:320,height:568},{width:390,height:844},{width:844,height:390}]){
    await page.setViewportSize(size);
    await page.goto('./');
    const layout=await page.evaluate(()=>{
      const rect=(id:string)=>document.getElementById(id)!.getBoundingClientRect();
      return {
        documentW:document.documentElement.scrollWidth,
        documentH:document.documentElement.scrollHeight,
        right:rect('tradingview-right-dock').right,
        tradeBottom:rect('plutrade-mobile-trade-controls').bottom,
        tradeHeight:rect('plutrade-mobile-trade-controls').height,
        chartHeight:rect('chart-workspace-viewport').height,
      };
    });
    expect(layout.documentW).toBeLessThanOrEqual(size.width+1);
    expect(layout.documentH).toBeLessThanOrEqual(size.height+1);
    expect(layout.right).toBeGreaterThanOrEqual(size.width-1);
    expect(layout.right).toBeLessThanOrEqual(size.width+1);
    expect(layout.tradeBottom).toBeLessThanOrEqual(size.height+1);
    expect(layout.tradeHeight).toBeGreaterThanOrEqual(23);
    expect(layout.chartHeight).toBeGreaterThan(75);
  }
});


test('mobile trade journal content shrinks independently of its untouched left rail',async ({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.goto('./');
  await page.locator('#right-tab-trade-journal').click();
  const journal=page.locator('#trade-journal-window-card');
  const rail=journal.locator('aside').first();
  const viewport=page.locator('#journal-main-content-viewport');
  const scaled=page.locator('#journal-mobile-scaled-content');
  await expect(journal).toBeVisible();
  await expect(rail).toBeVisible();
  await expect(viewport).toBeVisible();
  await expect(scaled).toBeVisible();
  const railRect=await rail.boundingBox();
  const bodyRect=await viewport.boundingBox();
  const scaledRect=await scaled.boundingBox();
  expect(railRect).not.toBeNull();
  expect(bodyRect).not.toBeNull();
  expect(scaledRect).not.toBeNull();
  expect(railRect!.width).toBeGreaterThanOrEqual(27);
  expect(railRect!.width).toBeLessThanOrEqual(29);
  expect(scaledRect!.width).toBeLessThanOrEqual(bodyRect!.width+2);
  await expect(scaled).toHaveCSS('transform',/matrix\(0\.68/);
  // Scaling doesn't disable the journal's own interactive content.
  await expect(page.locator('#journal-opening-balance')).toBeVisible();
  await page.locator('#journal-opening-balance').fill('12500');
  await expect(page.locator('#journal-opening-balance')).toHaveValue('12500');
});

test('paper account imports starting capital and percent fees without silently creating trades',async ({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.goto('./');
  await page.locator('#mobile-chart-action-rows').getByRole('button',{name:'Paper Trading'}).click();
  await page.getByRole('button',{name:'Select Paper Trading account'}).click();
  await page.getByText('Create account…').click();
  const dialog=page.getByRole('dialog',{name:'Create Paper Trading account'});
  await expect(dialog).toBeVisible();
  const file=dialog.getByLabel('Import paper account settings file');
  await file.setInputFiles({
    name:'account.csv',mimeType:'text/csv',
    buffer:Buffer.from('setting,value\nstartingBalance,35000\ncurrency,USD\nfeePercent,0.125\nspreadBps,2\nslippageBps,1'),
  });
  await expect(dialog.getByRole('status')).toContainText('Settings imported for review');
  await expect(dialog.getByLabel('Starting balance')).toHaveValue('35000');
  await expect(dialog.getByLabel('Commission percent')).toHaveValue('0.125');
  await expect(dialog.getByLabel('Commission type')).toHaveValue('percent');
  await dialog.getByRole('button',{name:'Create',exact:true}).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Select Paper Trading account'})).toContainText('Primary');
  await expect(page.locator('#paper-trading-open-panel')).toContainText('35,000');
});


test('right-side toolbox and time-scale popovers close on outside pointerdown',async ({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.goto('./');
  const rail=page.locator('#tradingview-right-icon-bar');
  await rail.locator('#right-tab-watchlist').click();
  const tools=page.locator('#right-sidebar-content-pane');
  await expect(tools).toBeVisible();
  await page.locator('#chart-workspace-viewport').dispatchEvent('pointerdown',{pointerType:'touch',bubbles:true});
  await expect(tools).toHaveCount(0);
  await expect(rail).toBeVisible();

  await page.locator('#time-scale-settings-btn').click();
  await expect(page.getByRole('dialog',{name:'Time scale settings'})).toBeVisible();
  await page.locator('#chart-timeframe-scroll').dispatchEvent('pointerdown',{pointerType:'touch',bubbles:true});
  await expect(page.getByRole('dialog',{name:'Time scale settings'})).toHaveCount(0);
});


test('custom timeframe dropdown includes strict digits, every unit, actual selection and tick restriction',async ({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.goto('./');
  const trigger=page.locator('#chart-timeframe-dropdown-trigger');
  await trigger.click();
  const dropdown=page.getByRole('dialog',{name:'All chart intervals'});
  await expect(dropdown).toBeVisible();
  await expect(dropdown.getByText('Custom interval')).toBeVisible();
  const input=dropdown.getByRole('textbox',{name:'Custom interval number'});
  await expect(input).toHaveAttribute('inputmode','numeric');
  await input.fill('2x3');
  await expect(input).toHaveValue('23');
  await input.fill('2');
  const select=dropdown.getByLabel('Custom interval unit');
  await expect(select.locator('option')).toHaveCount(8);
  expect(await select.locator('option').allTextContents()).toEqual([
    'ticks','seconds','minutes','hours','days','weeks','months','years'
  ]);
  await select.selectOption('hours');
  await dropdown.getByRole('button',{name:'Apply'}).click();
  await expect(dropdown).toHaveCount(0);
  await expect(trigger).toContainText('2h');
  await expect(page.locator('#go-to-chart-date-btn')).toBeVisible();
  await trigger.click();
  await select.selectOption('ticks');
  await dropdown.getByRole('button',{name:'Apply'}).click();
  await expect(dropdown.getByRole('alert')).toContainText('verified historical individual-trade feed');
  await expect(trigger).toContainText('2h');
  await page.locator('#chart-timeframe-scroll').dispatchEvent('pointerdown',{pointerType:'touch',bubbles:true});
  await expect(dropdown).toHaveCount(0);
  await page.locator('#tf-btn-1m').click();
  await expect(trigger).toContainText('1m');
});

test('ticker selector stays as narrow as the compact icon controls at top',async ({page})=>{
  for(const size of [{width:320,height:568},{width:390,height:844},{width:844,height:390}]){
    await page.setViewportSize(size);
    await page.goto('./');
    const ticker=page.locator('#mobile-symbol-search-trigger');
    const icon=page.locator('#mobile-chart-action-rows > button').first();
    await expect(ticker).toBeVisible();
    await expect(icon).toBeVisible();
    const a=await ticker.boundingBox(),b=await icon.boundingBox();
    expect(a!.width).toBeLessThanOrEqual(b!.width+3);
    expect(a!.width).toBeGreaterThan(45);
    await expect(page.locator('#mobile-chart-action-rows').getByRole('button',{name:'Alert'})).toBeVisible();
    await expect(page.locator('#mobile-chart-action-rows').getByRole('button',{name:'Alert'}).locator('svg')).toBeVisible();
  }
});
