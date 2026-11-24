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


test('mobile keeps one account/UPL/order/execution row and preloads equity sizing',async ({page})=>{
  const errors:string[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto('./');
  const bar=page.locator('#plutrade-mobile-trade-controls');
  await expect(bar).toBeVisible();
  const actions=bar.locator('div[aria-label="Mobile trading controls"] > button');
  await expect(actions).toHaveCount(9);
  const rects=await actions.evaluateAll(buttons=>buttons.map(button=>({
    top:Math.round(button.getBoundingClientRect().top),
    right:button.getBoundingClientRect().right,
  })));
  expect(new Set(rects.map(r=>r.top)).size).toBe(1);
  expect(rects.at(-1)!.right).toBeLessThanOrEqual(await page.evaluate(()=>innerWidth+1));
  await expect(actions.nth(0)).toHaveAttribute('id','mobile-active-account-btn');
  await expect(actions.nth(1)).toHaveAttribute('id','mobile-order-ticket-btn');
  await expect(actions.nth(2)).toHaveAttribute('id','mobile-upl-cash');
  await expect(actions.nth(3)).toHaveAttribute('id','mobile-upl-percent');
  await actions.nth(6).click();
  const equity=page.getByRole('dialog',{name:'Equity allocation'});
  await expect(equity).toBeVisible();
  await equity.getByRole('spinbutton',{name:'Percent of equity'}).fill('50');
  await equity.getByRole('button',{name:'Apply to Entry'}).click();
  await expect(actions.nth(6)).toContainText('50%');
  await expect(actions.nth(1)).toContainText('Order');
  await actions.nth(4).click();
  const ticket=page.getByRole('dialog',{name:'Paper Trading order entry'});
  await expect(ticket).toBeVisible();
  await expect(ticket.getByRole('spinbutton',{name:'Order size'})).toHaveValue('50');
  await expect(ticket.getByRole('button',{name:'% Available Equity'})).toBeVisible();
  await ticket.getByTitle('Close order panel').click();
  await actions.nth(7).click();
  await expect(page.getByRole('dialog',{name:'Stop loss options'})).toBeVisible();
  await page.getByRole('button',{name:/Open Entry Ticket/}).click();
  await expect(ticket.getByRole('switch',{name:'Enable stop loss'})).toHaveAttribute('aria-checked','true');
  expect(errors).toEqual([]);
});

test('holding TP reveals the advanced entry path without placing an order',async ({page})=>{
  await page.goto('./');
  const button=page.locator('#plutrade-mobile-trade-controls div[aria-label="Mobile trading controls"] > button').nth(8);
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
    await expect(page.locator('#mobile-chart-action-rows')).toHaveCount(0);
    await expect(page.locator('#mobile-top-chart-actions')).toBeVisible();
    await expect(page.locator('#mobile-top-tools-trigger')).toHaveCount(0);
  }
});

test('mobile chart controls are always visible and visual style favorites can be pinned',async ({page})=>{
  await page.setViewportSize({width:320,height:568});
  await page.goto('./');
  await expect(page.locator('#mobile-symbol-search-trigger')).toBeVisible();
  await expect(page.locator('#mobile-timeframe-selector')).toHaveCount(0);
  await expect(page.locator('#mobile-top-tools-trigger')).toHaveCount(0);
  await expect(page.locator('#mobile-chart-action-rows')).toHaveCount(0);
  const top=page.locator('#mobile-top-chart-actions');
  await expect(top).toBeVisible();
  await expect(top.getByLabel('Mobile chart layout')).toBeVisible();
  for(const name of ['Save Chart','Snapshot','Download Data'])
    await expect(top.getByRole('button',{name})).toBeVisible();
  await expect(page.locator('#right-tab-indicators')).toBeVisible();

  const style=page.getByRole('button',{name:'Choose visual chart style'});
  await expect(style).toBeVisible();
  await style.click();
  const styles=page.getByRole('dialog',{name:'Chart styles'});
  await expect(styles).toBeVisible();
  await styles.getByRole('button',{name:'Favorite Line'}).click();
  await expect(styles.getByRole('button',{name:'Unfavorite Line'})).toHaveAttribute('aria-pressed','true');
  await styles.getByRole('button',{name:'Chart style Line'}).click();
  await expect(styles).toHaveCount(0);
  await expect(style).toHaveAttribute('title','Chart type: Line');
  await style.click();
  await expect(styles).toBeVisible();
  await page.locator('#chart-workspace-viewport').dispatchEvent('pointerdown',{pointerType:'touch',bubbles:true});
  await expect(styles).toHaveCount(0);
  await page.locator('#right-tab-alerts').click();
  await expect(page.locator('#tradingview-alerts-panel')).toBeVisible();
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
  await expect(page.locator('#fit-chart-content-btn')).toBeVisible();
  await page.locator('#fit-chart-content-btn').click();
  await expect(page.getByRole('dialog',{name:'Time scale settings'})).toHaveCount(0);
  await expect(execution).toBeVisible();
});

test('mobile paper workspace remains accessible by holding Order',async ({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.goto('./');
  const order=page.locator('#mobile-order-ticket-btn');
  await order.dispatchEvent('pointerdown',{pointerType:'touch'});
  await page.waitForTimeout(585);
  await order.dispatchEvent('pointerup',{pointerType:'touch'});
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
  const order=page.locator('#mobile-order-ticket-btn');
  await order.dispatchEvent('pointerdown',{pointerType:'touch'});
  await page.waitForTimeout(585);
  await order.dispatchEvent('pointerup',{pointerType:'touch'});
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

test('mobile top bar is one row: window view, save, camera, data, PiP and fullscreen',async ({page})=>{
  for(const size of [{width:320,height:568},{width:390,height:844},{width:844,height:390}]){
    await page.setViewportSize(size);
    await page.goto('./');
    const ids=['mobile-layout-anchor','mobile-save-chart-btn','mobile-chart-snapshot-btn',
      'mobile-save-data-btn','mobile-pip-btn','mobile-fullscreen-btn'];
    const boxes=[];
    for(const id of ids){
      const element=page.locator('#'+id);
      await expect(element).toBeVisible();
      boxes.push((await element.boundingBox())!);
    }
    expect(new Set(boxes.map(rect=>Math.round(rect.y))).size).toBe(1);
    expect(boxes.every((rect,i)=>i===0||rect.x>boxes[i-1].x)).toBe(true);
    const ticker=(await page.locator('#mobile-symbol-search-trigger').boundingBox())!;
    expect(ticker.width).toBeLessThanOrEqual(67);
    expect(boxes.at(-1)!.x+boxes.at(-1)!.width).toBeLessThanOrEqual(size.width+1);
    await expect(page.locator('#mobile-chart-action-rows')).toHaveCount(0);
  }
});

test('timeframe scroll clips labels and keeps calendar/divider fixed',async ({page})=>{
  await page.setViewportSize({width:320,height:568});
  await page.goto('./');
  const scroll=page.locator('#chart-timeframe-scroll');
  const divider=page.locator('#chart-timeframe-calendar-divider');
  const calendar=page.locator('#go-to-chart-date-btn');
  const star=page.locator('#timeframe-favorites-button');
  const before=[await divider.boundingBox(),await calendar.boundingBox(),await star.boundingBox()];
  await expect(scroll).toHaveCSS('overflow-x','auto');
  expect(await scroll.evaluate(el=>el.scrollWidth>el.clientWidth)).toBe(true);
  await scroll.evaluate(el=>{el.scrollLeft=el.scrollWidth;});
  const after=[await divider.boundingBox(),await calendar.boundingBox(),await star.boundingBox()];
  for(let i=0;i<before.length;i++)expect(after[i]!.x).toBeCloseTo(before[i]!.x,1);
  const viewport=(await scroll.boundingBox())!;
  expect(viewport.x+viewport.width).toBeLessThanOrEqual(before[0]!.x+1);
  await expect(divider).toHaveCSS('border-left-style','solid');
});

test('popups render above chart/sidebar and outside tapping dismisses them',async ({page})=>{
  await page.setViewportSize({width:320,height:568});
  await page.goto('./');
  await page.locator('#chart-timeframe-dropdown-trigger').click();
  const dropdown=page.getByRole('dialog',{name:'All chart intervals'});
  await expect(dropdown).toBeVisible();
  expect(await dropdown.evaluate(el=>el.parentElement===document.body)).toBe(true);
  expect(Number(await dropdown.evaluate(el=>getComputedStyle(el).zIndex))).toBeGreaterThan(1000);
  const rect=(await dropdown.boundingBox())!;
  expect(rect.x).toBeGreaterThanOrEqual(0);
  expect(rect.x+rect.width).toBeLessThanOrEqual(321);
  await page.locator('#chart-timeframe-calendar-divider').dispatchEvent('pointerdown',{pointerType:'touch',bubbles:true});
  await expect(dropdown).toHaveCount(0);
  await page.locator('#timeframe-favorites-button').click();
  const favorites=page.getByRole('dialog',{name:/Favorite intervals for/});
  await expect(favorites).toBeVisible();
  expect(await favorites.evaluate(el=>el.parentElement===document.body)).toBe(true);
  await page.locator('#mobile-save-chart-btn').dispatchEvent('pointerdown',{pointerType:'touch',bubbles:true});
  await expect(favorites).toHaveCount(0);
  await page.locator('#go-to-chart-date-btn').click();
  const date=page.getByRole('dialog',{name:'Go to chart date'});
  await expect(date).toBeVisible();
  expect(await date.evaluate(el=>el.parentElement===document.body)).toBe(true);
  await page.locator('#chart-timeframe-scroll').dispatchEvent('pointerdown',{pointerType:'touch',bubbles:true});
  await expect(date).toHaveCount(0);
});

test('right Indicators and Alerts are sole launchers; account, Order, UPL amount and percent fit one row',async ({page})=>{
  await page.goto('./');
  await expect(page.locator('#open-alerts-modal-btn')).toHaveCount(0);
  await expect(page.locator('#open-indicators-modal-btn')).toHaveCount(0);
  await expect(page.locator('#mobile-chart-action-rows')).toHaveCount(0);
  const buttons=page.locator('#plutrade-mobile-trade-controls div[aria-label="Mobile trading controls"] > button');
  await expect(buttons.first()).toHaveAttribute('id','mobile-active-account-btn');
  await expect(buttons.nth(1)).toHaveAttribute('id','mobile-order-ticket-btn');
  await expect(buttons.nth(2)).toHaveAttribute('id','mobile-upl-cash');
  await expect(buttons.nth(3)).toHaveAttribute('id','mobile-upl-percent');
  await buttons.nth(1).click();
  await expect(page.getByRole('dialog',{name:'Paper Trading order entry'})).toBeVisible();
  await page.getByTitle('Close order panel').click();
  await page.locator('#right-tab-indicators').click();
  await expect(page.locator('#indicators-modal-window')).toBeVisible();
  await page.locator('#indicators-modal-backdrop').click({position:{x:3,y:3}});
  await page.locator('#right-tab-alerts').click();
  await expect(page.locator('#tradingview-alerts-panel')).toBeVisible();
});


test('mobile equity and stop-loss tool windows layer above sidebar and close off-click',async ({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.goto('./');
  const bar=page.locator('#plutrade-mobile-trade-controls');
  await bar.getByRole('button',{name:/Eq/}).click();
  const equity=page.getByRole('dialog',{name:'Equity allocation'});
  await expect(equity).toBeVisible();
  const z=await bar.evaluate(el=>Number(getComputedStyle(el).zIndex));
  expect(z).toBeGreaterThan(1400);
  await page.locator('#chart-timeframe-bar').dispatchEvent('pointerdown',{pointerType:'touch',bubbles:true});
  await expect(equity).toHaveCount(0);
  await bar.getByRole('button',{name:/Stop loss/}).click();
  const stops=page.getByRole('dialog',{name:'Stop loss options'});
  await expect(stops).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(stops).toHaveCount(0);
});


test('mobile account displays active ledger name and configurable UPL amount and percent without rewriting P/L',async ({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.goto('./');
  const bar=page.locator('#plutrade-mobile-trade-controls');
  const account=page.locator('#mobile-active-account-btn');
  await expect(account).toBeVisible();
  await expect(account).toContainText('Primary');
  await account.click();
  const picker=page.getByRole('dialog',{name:'Choose trading account'});
  await expect(picker).toBeVisible();
  await expect(picker.getByRole('button',{name:/Use account Primary/})).toBeVisible();
  await picker.getByRole('button',{name:/Use account Primary/}).click();
  await expect(picker).toHaveCount(0);

  const cash=page.locator('#mobile-upl-cash'),pct=page.locator('#mobile-upl-percent');
  await expect(cash).toContainText('UP/L$');
  await expect(pct).toContainText('UP/L%');
  await cash.click();
  const display=page.getByRole('dialog',{name:'Unrealized P/L display options'});
  await expect(display).toContainText('simulated account ledger');
  await expect(display.getByRole('button',{name:'Whole account'})).toHaveAttribute('aria-pressed','true');
  await display.getByRole('checkbox',{name:'Compact money (K/M/B)'}).uncheck();
  await display.getByRole('button',{name:'Done'}).click();
  await pct.click();
  await display.getByLabel('UP/L percent precision').selectOption('1');
  await display.getByRole('button',{name:'Done'}).click();
  await expect(pct).toContainText('0.0%');
  await page.reload();
  await expect(pct).toContainText('0.0%');
  await expect(bar).toBeVisible();
  const buttons=bar.locator('div[aria-label="Mobile trading controls"] > button');
  expect(new Set(await buttons.evaluateAll(items=>items.map(b=>Math.round(b.getBoundingClientRect().top)))).size).toBe(1);
  expect((await buttons.last().boundingBox())!.x+(await buttons.last().boundingBox())!.width).toBeLessThanOrEqual(391);
});

test('Trade Journal has always-visible X and one-line filter/search/sort with screen-fitted analytics cards',async ({page})=>{
  for(const size of [{width:320,height:568},{width:390,height:844}]){
    await page.setViewportSize(size);
    await page.goto('./');
    await page.locator('#right-tab-trade-journal').click();
    const journal=page.locator('#trade-journal-window-card');
    await expect(journal).toBeVisible();
    await expect(page.locator('#journal-global-close')).toBeVisible();
    const main=page.locator('#journal-main-content-viewport');
    const toolbar=page.locator('#journal-mobile-filter-strip');
    await expect(toolbar).toBeVisible();
    const children=toolbar.locator(':scope > *');
    expect(new Set(await children.evaluateAll(items=>items.map(el=>Math.round(el.getBoundingClientRect().y)))).size).toBe(1);
    await expect(toolbar.getByRole('combobox',{name:'Sort journal trades'})).toBeVisible();
    await toolbar.getByRole('combobox',{name:'Sort journal trades'}).selectOption('best');
    await toolbar.getByRole('button',{name:'Journal filters'}).click();
    const filters=page.getByRole('dialog',{name:'Journal filter options'});
    await expect(filters).toBeVisible();
    expect(await filters.evaluate(el=>el.parentElement===document.body)).toBe(true);
    await filters.getByRole('combobox',{name:'Filter Date'}).selectOption('Today');
    await filters.getByRole('button',{name:'Done'}).click();
    await expect(filters).toHaveCount(0);
    await expect(page.locator('#journal-desktop-filter-row')).toBeHidden();
    await expect(page.locator('#journal-mobile-trade-cards')).toBeVisible();
    await expect(page.locator('#journal-desktop-trades-table')).toBeHidden();
    const grid=page.locator('#journal-trade-main-grid');
    const table=page.locator('#journal-trade-table-panel');
    const right=page.locator('#journal-trade-widgets-column');
    await expect(grid).toBeVisible();
    await expect(right).toBeVisible();
    const rightRect=(await right.boundingBox())!,tableRect=(await table.boundingBox())!;
    const mainRect=(await main.boundingBox())!;
    expect(rightRect.x).toBeGreaterThanOrEqual(mainRect.x-1);
    expect(rightRect.x+rightRect.width).toBeLessThanOrEqual(mainRect.x+mainRect.width+2);
    expect(rightRect.y).toBeGreaterThanOrEqual(tableRect.y+tableRect.height-2);
    const rail=journal.locator('aside').first();
    expect((await rail.boundingBox())!.width).toBeGreaterThanOrEqual(27);
    await page.locator('#journal-global-close').click();
    await expect(journal).toHaveCount(0);
  }
});

test('full and overview journal calendars keep all eight equal square cells inside screen, with vertical drilldown',async({page})=>{
  await page.setViewportSize({width:320,height:568});
  await page.goto('./');
  await page.locator('#right-tab-trade-journal').click();
  const rail=page.locator('#trade-journal-window-card aside').first();
  await rail.getByTitle('Calendar Heatmap').click();
  const full=page.locator('#journal-calendar-square-grid');
  await expect(full).toBeVisible();
  const week=full.locator('.journal-calendar-week').first();
  await expect(week).toBeVisible();
  const squares=week.locator('[data-journal-calendar-square]');
  await expect(squares).toHaveCount(8);
  const fullRect=(await full.boundingBox())!;
  const all=await squares.evaluateAll(items=>items.map(el=>{
    const rect=el.getBoundingClientRect();
    return {x:rect.x,width:rect.width,height:rect.height};
  }));
  for(const rect of all){
    expect(Math.abs(rect.width-rect.height)).toBeLessThanOrEqual(2);
    expect(rect.x).toBeGreaterThanOrEqual(fullRect.x-1);
    expect(rect.x+rect.width).toBeLessThanOrEqual(fullRect.x+fullRect.width+2);
  }
  await expect(page.locator('#journal-calendar-filters')).toBeVisible();
  const filterRows=await page.locator('#journal-calendar-filters > div:visible').evaluateAll(items=>
    items.map(el=>Math.round(el.getBoundingClientRect().y)));
  expect(new Set(filterRows).size).toBe(1);
  const fullScroll=page.locator('#journal-calendar-scroll');
  expect(await fullScroll.evaluate(el=>el.scrollWidth<=el.clientWidth+2)).toBe(true);
  await rail.getByTitle('Account Analytics & WaveScore').click();
  const mini=page.locator('#journal-dashboard-calendar-grid');
  await expect(mini).toBeVisible();
  const miniSquares=mini.locator('[data-journal-calendar-square]');
  expect(await miniSquares.count()).toBeGreaterThan(6);
  const miniRect=(await mini.boundingBox())!;
  expect(miniRect.x+miniRect.width).toBeLessThanOrEqual(321);
  const first=(await miniSquares.first().boundingBox())!;
  expect(Math.abs(first.width-first.height)).toBeLessThanOrEqual(2);
});

test('journal Insights show responsive analytics cards and hide wide desktop table',async({page})=>{
  await page.setViewportSize({width:320,height:568});
  await page.goto('./');
  await page.locator('#right-tab-trade-journal').click();
  await page.locator('#trade-journal-window-card aside').first().getByRole('button',{name:'Journal Strategy Insights'}).click();
  await expect(page.locator('#journal-insights-mobile-cards')).toBeVisible();
  await expect(page.locator('#journal-insights-data-panel > table')).toBeHidden();
  expect(await page.locator('#journal-insights-data-panel').evaluate(el=>el.scrollWidth<=el.clientWidth+2)).toBe(true);
});

test('mobile top-left chart icons have no boxes and chart has no TV lower-left logo',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.goto('./');
  for(const id of ['mobile-chart-style-trigger','mobile-save-chart-btn','mobile-chart-snapshot-btn','mobile-save-data-btn','mobile-pip-btn','mobile-fullscreen-btn']){
    const button=page.locator('#'+id);
    await expect(button).toBeVisible();
    expect(await button.evaluate(el=>getComputedStyle(el).borderTopWidth)).toBe('0px');
    expect(await button.evaluate(el=>getComputedStyle(el).backgroundColor)).toBe('rgba(0, 0, 0, 0)');
  }
  await expect(page.locator('#tv-attr-logo')).toHaveCount(0);
  await page.locator('#time-scale-settings-btn').click();
  await expect(page.getByRole('dialog',{name:'Time scale settings'}).getByRole('link',{name:/Lightweight Charts/})).toBeVisible();
});

test('mobile chart chrome remains compact and legend preference persists',async ({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.goto('./');
  const legend=page.locator('#chart-top-legend-header');
  const currency=page.locator('#chart-quote-currency-trigger');
  const corner=page.locator('#chart-corner-controls');
  const footer=page.locator('#left-toolbar-layout-controls');
  const execution=page.locator('#plutrade-mobile-trade-controls');
  await expect(legend).toBeHidden();
  await expect(currency).toBeVisible();
  await expect(corner).toBeVisible();
  const measured=await page.evaluate(()=>{
    const rect=(id:string)=>document.getElementById(id)!.getBoundingClientRect();
    const box=(id:string)=>{const r=rect(id);return {x:r.x,y:r.y,width:r.width,height:r.height};};
    const cornerStyle=getComputedStyle(document.getElementById('chart-corner-controls')!);
    return {footer:box('left-toolbar-layout-controls'),execution:box('plutrade-mobile-trade-controls'),
      currency:box('chart-quote-currency-anchor'),cornerBorder:cornerStyle.borderTopWidth,cornerBackground:cornerStyle.backgroundColor};
  });
  expect(Math.abs(measured.footer.y-measured.execution.y)).toBeLessThanOrEqual(2);
  expect(Math.abs(measured.footer.height-measured.execution.height)).toBeLessThanOrEqual(1);
  expect(Number.parseFloat(measured.cornerBorder)).toBe(0);
  expect(measured.cornerBackground).toBe('rgba(0, 0, 0, 0)');
  await currency.click();
  await expect(page.getByRole('menu',{name:'Quote currency'})).toBeVisible();
  await currency.click();

  await page.locator('#time-scale-settings-btn').click();
  const preference=page.locator('#mobile-chart-legend-setting');
  await expect(preference).not.toBeChecked();
  await preference.check();
  await expect(legend).toBeVisible();
  await page.reload();
  await expect(page.locator('#chart-top-legend-header')).toBeVisible();
  await page.locator('#time-scale-settings-btn').click();
  await page.locator('#mobile-chart-legend-setting').uncheck();
  await expect(page.locator('#chart-top-legend-header')).toBeHidden();
});


test('mobile top header, native time scale, custom price rail and order bar are equally sized',async ({page})=>{
  for(const size of [{width:320,height:568},{width:390,height:844},{width:844,height:390}]){
    await page.setViewportSize(size);
    await page.goto('./');
    await expect(page.locator('#plutrade-mobile-price-axis')).toBeVisible();
    const sizes=await page.evaluate(()=>{
      const box=(id:string)=>document.getElementById(id)!.getBoundingClientRect();
      const canvas=document.getElementById('plutrade-native-chart-canvas')!;
      const rows=canvas.querySelectorAll('table tr');
      const nativeTimeAxis=rows.length?rows[rows.length-1].getBoundingClientRect():null;
      const {height:order}=box('plutrade-mobile-trade-controls');
      const {height:header}=box('tradingview-top-navbar');
      const {height:ticker}=box('plutrade-mobile-navbar');
      const {height:interval}=box('tradingview-bottom-bar');
      const rail=box('plutrade-mobile-price-axis');
      const corner=box('plutrade-mobile-price-axis-corner');
      return {
        order,header,ticker,interval,priceWidth:rail.width,
        timeHeight:nativeTimeAxis?.height??-1,
        chartToRailGap:rail.left-canvas.getBoundingClientRect().right,
        cornerWidth:corner.width,cornerHeight:corner.height,
        nativeCanvasRight:canvas.getBoundingClientRect().right,
        rightDockLeft:box('tradingview-right-dock').left,
      };
    });
    const target=sizes.order;
    expect(target).toBeGreaterThanOrEqual(23);
    expect(target).toBeLessThanOrEqual(25);
    for(const key of ['header','ticker','interval','priceWidth','timeHeight','cornerWidth','cornerHeight'] as const){
      expect(Math.abs(sizes[key]-target),`${key} mismatch at ${size.width}x${size.height}`).toBeLessThanOrEqual(1);
    }
    expect(Math.abs(sizes.chartToRailGap)).toBeLessThanOrEqual(1);
    expect(sizes.nativeCanvasRight).toBeLessThanOrEqual(sizes.rightDockLeft+1);
  }
});


test('mobile toolbar gaps match the right rail at every screen width',async({page})=>{
  for(const viewport of [{width:320,height:568},{width:390,height:844},{width:844,height:390}]){
    await page.setViewportSize(viewport);
    await page.goto('./');
    const gaps=await page.evaluate(()=>{
      const element=(selector:string)=>document.querySelector(selector);
      const gap=(selector:string)=>element(selector)?getComputedStyle(element(selector)!).gap:null;
      return {
        right:gap('#tradingview-right-icon-bar > div:first-child'),
        left:gap('#tradingview-left-toolbar > div:first-child'),
        starred:gap('#left-toolbar-starred-tools'),
        top:gap('#plutrade-mobile-navbar'),
        chartStyles:gap('#mobile-chart-style-anchor'),
        favorites:gap('#mobile-chart-style-favorites'),
        actions:gap('#mobile-top-chart-actions'),
        window:gap('#mobile-window-actions'),
      };
    });
    expect(gaps.right).toBe('2px');
    for(const [name,value] of Object.entries(gaps)){
      if(value!==null)expect(value,`${name} at ${viewport.width}x${viewport.height}`).toBe(gaps.right);
    }
  }
});

test('mobile price marker stays compact and above chart overlays without covering axes',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.route('https://api.exchange.coinbase.com/products/BTC-USD/candles**',route=>{
    const last=Math.floor(Date.now()/60000)*60-60;
    const data=Array.from({length:120},(_,i)=>{
      const time=last-(119-i)*60,open=100+i*0.05,close=open+0.03;
      return [time,open-0.1,close+0.1,open,close,10+i];
    }).reverse();
    return route.fulfill({status:200,contentType:'application/json',
      headers:{'Access-Control-Allow-Origin':'*'},body:JSON.stringify(data)});
  });
  await page.goto('./');
  const label=page.locator('#chart-current-price-label').first();
  const axis=page.locator('#plutrade-mobile-price-axis').first();
  await expect(label).toBeVisible();
  await expect(axis).toBeVisible();
  const geometry=await page.evaluate(()=>{
    const badge=document.querySelector('#chart-current-price-label')!.getBoundingClientRect();
    const rail=document.querySelector('#plutrade-mobile-price-axis')!.getBoundingClientRect();
    const plot=document.querySelector('[data-testid="chart-pinch-surface"]')!.getBoundingClientRect();
    const canvas=document.querySelector('#plutrade-native-chart-canvas')!;
    const rows=canvas.querySelectorAll('table tr');
    const timeAxis=rows[rows.length-1].getBoundingClientRect();
    const style=getComputedStyle(document.querySelector('#chart-current-price-label')!);
    return {badge:{left:badge.left,right:badge.right,top:badge.top,bottom:badge.bottom,height:badge.height},
      railLeft:rail.left,plotLeft:plot.left,plotTop:plot.top,timeAxisTop:timeAxis.top,
      background:style.backgroundColor,zIndex:Number(style.zIndex)};
  });
  expect(geometry.badge.height).toBeLessThanOrEqual(17);
  expect(geometry.badge.left).toBeGreaterThanOrEqual(geometry.plotLeft);
  expect(geometry.badge.right).toBeLessThanOrEqual(geometry.railLeft-1);
  expect(geometry.badge.bottom).toBeLessThanOrEqual(geometry.timeAxisTop+1);
  expect(geometry.badge.top).toBeGreaterThanOrEqual(geometry.plotTop-1);
  expect(geometry.background).toBe('rgb(41, 98, 255)');
  expect(geometry.zIndex).toBeGreaterThan(50);
});


test('quick cash sizing, precise available-equity percent and independent SL TP setups',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.goto('./');
  const amount=page.locator('#mobile-order-amount-btn');
  await amount.click();
  const quick=page.getByRole('dialog',{name:'Equity allocation'});
  await expect(quick.getByText('Available equity:')).toBeVisible();
  await quick.getByRole('group',{name:'Order size basis'}).getByRole('button',{name:'Cash Amount'}).click();
  await quick.getByRole('spinbutton',{name:'Cash margin amount'}).fill('125.43');
  await quick.getByRole('button',{name:'Apply to Entry'}).click();
  await expect(amount).toContainText('$125.43');
  await page.locator('#mobile-order-ticket-btn').click();
  const ticket=page.getByRole('dialog',{name:'Paper Trading order entry'});
  await expect(ticket.getByRole('spinbutton',{name:'Order size'})).toHaveValue('125.43');
  await expect(ticket.getByRole('button',{name:'Cash Margin USD'})).toBeVisible();
  await ticket.getByTitle('Close order panel').click();

  await amount.click();
  await quick.getByRole('group',{name:'Order size basis'}).getByRole('button',{name:'% Available Equity'}).click();
  await quick.getByRole('spinbutton',{name:'Percent of equity'}).fill('12.345678');
  await quick.getByRole('button',{name:'Apply to Entry'}).click();
  await expect(amount).toContainText('12% Equity');
  await page.getByRole('button',{name:'Enter',exact:true}).click();
  await expect(ticket.getByRole('spinbutton',{name:'Order size'})).toHaveValue('12.345678');
  await expect(ticket.getByRole('button',{name:'% Available Equity'})).toBeVisible();
  await ticket.getByTitle('Close order panel').click();

  await page.locator('#mobile-stop-setup-btn').click();
  const sl=page.getByRole('dialog',{name:'Stop loss options'});
  await sl.getByRole('spinbutton',{name:'Exit level value'}).fill('1.25');
  await sl.getByRole('button',{name:'Save SL setup'}).click();
  await expect(ticket).toHaveCount(0);
  await page.locator('#mobile-target-setup-btn').click();
  const tp=page.getByRole('dialog',{name:'Take profit options'});
  await tp.getByRole('spinbutton',{name:'Exit level value'}).fill('2.5');
  await tp.getByRole('button',{name:'Save TP setup'}).click();
  await expect(ticket).toHaveCount(0);
  await page.getByRole('button',{name:'Enter',exact:true}).click();
  await expect(ticket.getByRole('switch',{name:'Enable stop loss'})).toHaveAttribute('aria-checked','true');
  await expect(ticket.getByRole('switch',{name:'Enable take profit'})).toHaveAttribute('aria-checked','true');
  await expect(ticket.getByRole('spinbutton',{name:'Stop-loss value'})).toHaveValue('1.25');
  await expect(ticket.getByRole('spinbutton',{name:'Take-profit value'})).toHaveValue('2.5');
  await ticket.getByTitle('Close order panel').click();
  await page.locator('#mobile-stop-setup-btn').click();
  await sl.getByRole('button',{name:'Clear SL setup'}).click();
  await page.getByRole('button',{name:'Enter',exact:true}).click();
  await expect(ticket.getByRole('switch',{name:'Enable stop loss'})).toHaveAttribute('aria-checked','false');
  await expect(ticket.getByRole('switch',{name:'Enable take profit'})).toHaveAttribute('aria-checked','true');
});

test('mobile toolbar icon geometry matches right rail and bottom button width ratios',async({page})=>{
  for(const size of [{width:320,height:568},{width:390,height:844},{width:844,height:390}]){
    await page.setViewportSize(size);
    await page.goto('./');
    const measurements=await page.evaluate(()=>{
      const rect=(selector:string)=>document.querySelector(selector)!.getBoundingClientRect();
      const r=rect('#right-tab-indicators');
      const buttons=['#mobile-save-chart-btn','#mobile-chart-snapshot-btn','#mobile-save-data-btn',
        '#mobile-layout-picker-btn','#mobile-chart-style-trigger','#mobile-pip-btn','#mobile-fullscreen-btn',
        '#left-tool-crosshair','#left-toolbar-edit'];
      const icons=buttons.map(selector=>({selector,width:rect(selector).width,height:rect(selector).height}));
      const order=rect('#mobile-order-ticket-btn').width;
      const amount=rect('#mobile-order-amount-btn').width;
      const sl=rect('#mobile-stop-setup-btn').width;
      const tp=rect('#mobile-target-setup-btn').width;
      const font=getComputedStyle(document.getElementById('mobile-order-ticket-btn')!).fontSize;
      const cashFont=getComputedStyle(document.querySelector('#mobile-upl-cash span')!).fontSize;
      const percentFont=getComputedStyle(document.querySelector('#mobile-upl-percent span')!).fontSize;
      return {reference:r.width,icons,order,amount,sl,tp,font,cashFont,percentFont};
    });
    expect(measurements.reference).toBe(22);
    for(const button of measurements.icons){
      expect(button.width,button.selector).toBeCloseTo(measurements.reference,0);
      expect(button.height,button.selector).toBeCloseTo(measurements.reference,0);
    }
    expect(Math.abs(measurements.amount/measurements.order-2)).toBeLessThan(0.12);
    expect(Math.abs(measurements.sl/measurements.order-0.5)).toBeLessThan(0.12);
    expect(Math.abs(measurements.tp/measurements.order-0.5)).toBeLessThan(0.12);
    expect(measurements.cashFont).toBe(measurements.font);
    expect(measurements.percentFont).toBe(measurements.font);
  }
});

test('visual mobile chart layout picker and single centered settings gear',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.goto('./');
  const picker=page.locator('#mobile-layout-picker-btn');
  await picker.click();
  const choices=page.getByRole('dialog',{name:'Choose chart window layout'});
  await expect(choices).toBeVisible();
  expect(await choices.locator('button svg').count()).toBeGreaterThan(5);
  await choices.getByRole('button',{name:'2 Columns',exact:true}).click();
  await expect(choices).toHaveCount(0);
  await expect(picker).toHaveAttribute('title',/2 Columns/);
  await picker.click();
  await choices.getByRole('button',{name:'Single'}).click();

  const gear=page.locator('#time-scale-settings-btn');
  const box=page.locator('#chart-corner-controls');
  await expect(page.locator('#fit-chart-content-btn')).toHaveCount(0);
  const g=await gear.boundingBox(),b=await box.boundingBox();
  expect(g).not.toBeNull();expect(b).not.toBeNull();
  expect(Math.abs((g!.x+g!.width/2)-(b!.x+b!.width/2))).toBeLessThanOrEqual(0.5);
  expect(Math.abs((g!.y+g!.height/2)-(b!.y+b!.height/2))).toBeLessThanOrEqual(0.5);
  await gear.click();
  await expect(page.getByRole('dialog',{name:'Time scale settings'}).locator('#fit-chart-content-btn')).toBeVisible();
});


test('global sidebar dialogs escape the app stacking context and cover the top bar',async({page})=>{
  for(const size of [{width:320,height:568},{width:390,height:844},{width:844,height:390}]){
    await page.setViewportSize(size);
    await page.goto('./');
    const header=page.locator('#tradingview-top-navbar');
    await expect(header).toBeVisible();
    const dialogOnTop=async(selector:string,fullBackdrop=true)=>{
      const modal=page.locator(selector);
      await expect(modal).toBeVisible();
      const result=await page.evaluate(selector=>{
        const overlay=document.querySelector(selector)!;
        const rect=overlay.getBoundingClientRect();
        const navbar=document.getElementById('tradingview-top-navbar')!.getBoundingClientRect();
        const x=Math.min(innerWidth-8,Math.max(8,rect.left+Math.min(12,rect.width/2)));
        const y=navbar.top+navbar.height/2;
        const hit=document.elementFromPoint(x,y);
        return {portaled:!!overlay.closest('[data-plutrade-viewport-portal]'),
          top:rect.top,left:rect.left,bottom:rect.bottom,right:rect.right,
          navbarBottom:navbar.bottom,
          visibleAtHeader:!!hit&&(overlay===hit||overlay.contains(hit))};
      },selector);
      expect(result.portaled,selector+' should escape chart and sidebar clipping').toBe(true);
      expect(result.top).toBeGreaterThanOrEqual(-1);
      expect(result.left).toBeGreaterThanOrEqual(-1);
      expect(result.bottom).toBeLessThanOrEqual(size.height+1);
      expect(result.right).toBeLessThanOrEqual(size.width+1);
      if(fullBackdrop)expect(result.visibleAtHeader,selector+' should be in front of top navbar').toBe(true);
      else expect(result.top).toBeLessThanOrEqual(result.navbarBottom+8);
    };
    await page.locator('#right-tab-indicators').click();
    await dialogOnTop('#indicators-modal-backdrop');
    await page.locator('#close-indicators-modal-btn').click();
    await page.locator('#right-tab-alerts').click();
    await page.locator('#create-new-alert-plus-btn').click();
    await dialogOnTop('#alerts-modal-backdrop');
    await page.locator('#close-alerts-modal-btn').click();
    await page.locator('#mobile-order-ticket-btn').click();
    await dialogOnTop('[role="dialog"][aria-label="Paper Trading order entry"]',false);
    await page.getByTitle('Close order panel').click();
  }
});

test('watchlist menu and creation dialog remain visible above fixed header',async({page})=>{
  await page.setViewportSize({width:320,height:568});
  await page.goto('./');
  await page.locator('#right-tab-watchlist').click();
  await page.locator('#watchlist-selector-dropdown-btn').click();
  const menu=page.locator('#watchlist-dropdown-menu');
  await expect(menu).toBeVisible();
  const menuGeometry=await menu.evaluate(node=>{
    const b=node.getBoundingClientRect();
    return {parentIsBody:node.parentElement===document.body,left:b.left,right:b.right,top:b.top,bottom:b.bottom};
  });
  expect(menuGeometry.parentIsBody).toBe(true);
  expect(menuGeometry.left).toBeGreaterThanOrEqual(0);
  expect(menuGeometry.top).toBeGreaterThanOrEqual(0);
  expect(menuGeometry.right).toBeLessThanOrEqual(321);
  expect(menuGeometry.bottom).toBeLessThanOrEqual(569);
  await menu.getByRole('button',{name:/New Watchlist/}).click();
  await expect(page.locator('#right-sidebar-content-pane')).toBeVisible();
  const backdrop=page.locator('#watchlist-create-modal');
  await expect(backdrop).toBeVisible();
  const layering=await backdrop.evaluate(node=>{
    const header=document.getElementById('tradingview-top-navbar')!.getBoundingClientRect();
    const root=node.closest('[data-plutrade-viewport-portal]');
    const hit=document.elementFromPoint(header.left+header.width/2,header.top+header.height/2);
    return {portaled:!!root,coversHeader:node===hit||node.contains(hit)};
  });
  expect(layering.portaled).toBe(true);
  expect(layering.coversHeader).toBe(true);
  await backdrop.getByRole('button',{name:'Cancel'}).click();
  await expect(backdrop).toHaveCount(0);
  await expect(page.locator('#right-sidebar-content-pane')).toBeVisible();
});

test('left drawing flyouts stay inside the viewport instead of hiding behind navbar',async({page})=>{
  for(const size of [{width:320,height:568},{width:390,height:844}]){
    await page.setViewportSize(size);
    await page.goto('./');
    await page.locator('#left-tool-line-group').click();
    const flyout=page.locator('#tradingview-lines-flyout-menu');
    await expect(flyout).toBeVisible();
    const layout=await flyout.evaluate(node=>{
      const b=node.getBoundingClientRect();
      return {parentIsBody:node.parentElement===document.body,left:b.left,right:b.right,top:b.top,bottom:b.bottom,
        zIndex:Number(getComputedStyle(node).zIndex)};
    });
    expect(layout.parentIsBody).toBe(true);
    expect(layout.left).toBeGreaterThanOrEqual(0);
    expect(layout.top).toBeGreaterThanOrEqual(0);
    expect(layout.right).toBeLessThanOrEqual(size.width+1);
    expect(layout.bottom).toBeLessThanOrEqual(size.height+1);
    expect(layout.zIndex).toBeGreaterThan(1000);
    await flyout.locator('#line-flyout-trendline').click();
    await expect(flyout).toHaveCount(0);
  }
});


test('mobile right drawer header stays on top of timeframe row and is interactive',async({page})=>{
  for(const viewport of [{width:320,height:568},{width:390,height:844},{width:844,height:390}]){
    await page.setViewportSize(viewport);
    await page.goto('./');
    await page.locator('#right-tab-alerts').click();
    const pane=page.locator('#right-sidebar-content-pane');
    const alerts=page.locator('#tradingview-alerts-panel');
    const alertHeader=alerts.locator(':scope > div').first();
    await expect(alertHeader).toBeVisible();
    const visual=await page.evaluate(()=>{
      const rect=(id:string)=>document.getElementById(id)!.getBoundingClientRect();
      const panel=document.getElementById('right-sidebar-content-pane')!;
      const header=document.querySelector('#tradingview-alerts-panel > div:first-child')!;
      const hr=header.getBoundingClientRect();
      const nav=rect('tradingview-top-navbar');
      const timeframe=rect('tradingview-bottom-bar');
      const rail=rect('tradingview-right-icon-bar');
      const pr=panel.getBoundingClientRect();
      const atHeader=document.elementFromPoint(hr.left+Math.min(12,hr.width/2),hr.top+hr.height/2);
      return {
        parentIsBody:panel.parentElement===document.body,
        paneTop:pr.top,paneLeft:pr.left,paneRight:pr.right,paneBottom:pr.bottom,
        headerTop:hr.top,headerBottom:hr.bottom,headerVisible:header.contains(atHeader),
        navbarBottom:nav.bottom,timeframeTop:timeframe.top,timeframeBottom:timeframe.bottom,
        railLeft:rail.left,
      };
    });
    expect(visual.parentIsBody,'Mobile right pane must escape chart workspace clipping').toBe(true);
    expect(visual.headerVisible,'Timeframe controls must not cover the Alerts header').toBe(true);
    expect(visual.headerTop).toBeGreaterThanOrEqual(visual.navbarBottom-2);
    expect(visual.headerTop).toBeLessThanOrEqual(visual.timeframeBottom+1);
    expect(visual.paneLeft).toBeGreaterThanOrEqual(0);
    expect(visual.paneRight).toBeLessThanOrEqual(visual.railLeft+1);
    expect(visual.paneBottom).toBeLessThanOrEqual(viewport.height+1);
    // A real pointer click on a header control must work, not hit 1s/5s.
    await alertHeader.getByRole('button',{name:/Log/}).click();
    await expect(alertHeader.getByRole('button',{name:/Log/})).toHaveClass(/bg-\[#2a2e39\]/);
    await alertHeader.getByRole('button',{name:'Alerts',exact:true}).click();
    await expect(pane).toBeVisible();
    await page.locator('#right-tab-watchlist').click();
    await page.locator('#watchlist-selector-dropdown-btn').click();
    await expect(page.locator('#watchlist-dropdown-menu')).toBeVisible();
    await page.locator('#watchlist-dropdown-menu').getByRole('button',{name:/New Watchlist/}).click();
    await expect(page.locator('#watchlist-create-modal')).toBeVisible();
    await page.locator('#watchlist-create-modal').getByRole('button',{name:'Cancel'}).click();
    await expect(pane).toBeVisible();
  }
});
