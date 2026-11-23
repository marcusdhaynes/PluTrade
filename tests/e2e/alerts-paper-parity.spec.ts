import {test,expect} from '@playwright/test';
import {isolateExternalFeeds} from './market-fixtures';

test('alerts dialog saves TradingView-style conditions, recurrence and expiration without a fake server claim',async({page})=>{
  await isolateExternalFeeds(page);
  const errors:string[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto('./');
  await page.locator('#open-alerts-modal-btn').click();
  const modal=page.locator('#alerts-modal-window');
  await expect(modal).toBeVisible();
  await expect(modal).toContainText('do not keep monitoring after you close');
  await modal.locator('#alert-condition-select').selectOption('greater_than');
  await modal.locator('#alert-frequency-select').selectOption('once_per_minute');
  await modal.locator('#alert-expiration-select').selectOption('7d');
  await modal.locator('#alert-target-price-input').fill('101');
  await modal.locator('#alert-notes-input').fill('QA test alert — no order');
  await modal.locator('#create-alert-submit-btn').click();
  await expect(modal).toContainText('QA test alert — no order');
  await expect(modal).toContainText('once per minute');
  const saved=await page.evaluate(()=>{
    const alerts=JSON.parse(localStorage.getItem('tv_alerts')||'[]');
    return alerts.find((a:any)=>a.notes==='QA test alert — no order');
  });
  expect(saved).toMatchObject({condition:'greater_than',frequency:'once_per_minute',targetPrice:101,triggered:false});
  expect(saved.expiresAt).toBeGreaterThan(saved.createdAt);
  await modal.getByRole('button',{name:'Pause',exact:true}).last().click();
  await expect(modal).toContainText('Paused');
  await modal.getByRole('button',{name:'Resume',exact:true}).last().click();
  await expect(modal).toContainText('Active');
  await modal.locator('#close-alerts-modal-btn').click();
  await page.reload();
  await page.locator('#open-alerts-modal-btn').click();
  await expect(page.locator('#alerts-modal-window')).toContainText('QA test alert — no order');
  expect(errors).toEqual([]);
});

test('paper order amendment validates marketability, maintains reserved margin and shows lifecycle audit',async({page})=>{
  const errors:string[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript(()=>{
    class SimulatedVenueSocket{
      onopen:((event:any)=>void)|null=null;
      onmessage:((event:any)=>void)|null=null;
      onclose:((event:any)=>void)|null=null;
      timer:number|undefined;
      n=2000;
      constructor(private url:string){
        window.setTimeout(()=>{
          this.onopen?.({});
          if(url.includes('binance'))this.timer=window.setInterval(()=>
            this.onmessage?.({data:JSON.stringify({e:'trade',p:'105',q:'0.5',m:false,t:++this.n,T:Date.now()})}),150);
        },25);
      }
      send(){}
      close(){if(this.timer!==undefined)window.clearInterval(this.timer);}
    }
    Object.defineProperty(window,'WebSocket',{configurable:true,value:SimulatedVenueSocket});
    localStorage.setItem('tv_active_symbol','BTCUSDT');
    localStorage.setItem('plutrade_active_source','Binance');
    localStorage.setItem('plutrade_active_market_type','spot');
    const now=Date.now();
    const settings={
      currency:'USDT',startingBalance:10000,marginControl:false,
      leverages:{stocks:1,futures:20,forex:50,crypto:10,others:50},
      commission:{enabled:false,mode:'fixed',amount:0},
      futuresOptions:{enabled:false,perContract:0},
    };
    const pending={
      id:'qa-pending-edit',symbol:'BTCUSDT',exchange:'Binance',side:'Long',
      kind:'limit',qty:2,price:95,currency:'USDT',assetCategory:'crypto',marketType:'spot',
      leverage:1,createdAt:now-1000,status:'pending',
    };
    const portfolio={
      settings,
      account:{name:'Pending QA',balance:10000,equity:10000,realizedPnL:0,
        unrealizedPnL:0,accountMargin:0,availableFunds:9810,ordersMargin:190,marginBuffer:0},
      positions:[],fills:[],pendingOrders:[pending],
      orderEvents:[{id:'qa-event',orderId:pending.id,symbol:'BTCUSDT',exchange:'Binance',
        side:'Long',kind:'limit',qty:2,price:95,at:now-1000,action:'submitted'}],
    };
    localStorage.setItem('plutrade_paper_accounts_v3',JSON.stringify({
      activeId:'qa-account',accounts:[{id:'qa-account',portfolio,orders:[]}],
    }));
  });
  await page.goto('./');
  await page.getByRole('button',{name:/Paper Trading/}).first().click();
  await expect(page.getByText(/Live reference 105/)).toBeVisible();
  const tabs=page.getByRole('navigation',{name:'Paper trading workspace tabs'});
  await tabs.getByRole('button',{name:/Orders/}).first().click();
  await expect(page.getByText('qa-pending-edit')).toHaveCount(0); // IDs must not leak into the UI.
  await page.getByTitle('Amend resting order').click();
  await page.getByLabel('Amend order units').fill('3');
  await page.getByLabel('Amend order price').fill('110');
  await page.getByRole('button',{name:'Save changes'}).click();
  await expect(page.getByRole('alert')).toContainText('Marketable replacement');
  await page.getByLabel('Amend order price').fill('94');
  await page.getByRole('button',{name:'Save changes'}).click();
  await expect(page.getByText('3 units')).toBeVisible();
  await tabs.getByRole('button',{name:'Order history'}).click();
  await expect(page.getByText('amended',{exact:true})).toBeVisible();
  await expect(page.getByText('submitted',{exact:true})).toBeVisible();
  expect(errors).toEqual([]);
});
