import {test,expect} from '@playwright/test';
import {isolateExternalFeeds} from './market-fixtures';

test('IF → THEN / WHILE builder binds drawing crossings and equity-sized entries to all paper accounts',async({page})=>{
  await isolateExternalFeeds(page);
  const errors:string[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript(()=>{
    const now=Math.floor(Date.now()/1000);
    localStorage.setItem('tv_drawings_by_market_v1',JSON.stringify({
      'BTCUSD|Coinbase|spot':[{
        id:'qa-trendline-X',type:'trendline',color:'#2962ff',lineWidth:2,
        label:'Trendline X',points:[
          {time:now-3600,price:60000},{time:now+3600,price:61000}
        ],
      }]
    }));
  });
  await page.goto('./');
  await page.getByRole('button',{name:/Paper Trading/}).first().click();
  await expect(page.getByRole('button',{name:'Create order'})).toBeEnabled();
  const picker=page.getByRole('button',{name:'Select Paper Trading account'});
  await picker.click();
  await page.getByRole('button',{name:/Create account/}).click();
  const account=page.getByRole('dialog',{name:'Create Paper Trading account'});
  await account.getByLabel('Account name').fill('Second Conditional QA');
  await account.getByRole('button',{name:'Create',exact:true}).click();
  await expect(account).toHaveCount(0);
  const tabs=page.getByRole('navigation',{name:'Paper trading workspace tabs'});
  await tabs.getByRole('button',{name:/Orders/}).first().click();
  await page.getByRole('button',{name:'New Conditional Order'}).click();
  const modal=page.locator('#conditional-order-builder-modal');
  await expect(modal).toBeVisible();
  await modal.getByLabel('Rule execution account').selectOption('all');
  await modal.getByRole('button',{name:/WHILE/}).click();
  await modal.getByLabel('Condition 1 source').selectOption('drawing');
  await modal.getByLabel('Condition 1 operator').selectOption('crosses_either');
  await modal.getByRole('button',{name:'Add Condition'}).click();
  await modal.getByLabel('Condition 2 source').selectOption('account');
  await modal.getByLabel('Condition 2 operator').selectOption('equity_greater_than');
  await modal.getByLabel('Condition 2 threshold').fill('100');
  await modal.getByRole('button',{name:'Use 99% of Equity'}).click();
  await expect(modal).toContainText('Trendline X');
  await modal.getByRole('button',{name:'Create Conditional Order'}).click();
  await expect(modal).toHaveCount(0);
  await expect.poll(()=>page.evaluate(()=>{
    const state=JSON.parse(localStorage.getItem('plutrade_paper_accounts_v3')||'{}');
    if(state.accounts?.length!==2)return 'missing';
    const orders=state.accounts.map((a:any)=>a.orders.find((o:any)=>o.title.includes('Conditional')));
    return orders.every((o:any)=>o?.accountScope==='all_paper'&&o.conditionLogic==='WHILE'&&
      o.execution.size===99&&o.execution.sizeUnit==='equity_percent'&&
      o.conditions.some((c:any)=>c.dependencyType==='drawing'&&c.dependencyId==='qa-trendline-X')&&
      o.conditions.some((c:any)=>c.dependencyType==='account'))?'saved':'pending';
  })).toBe('saved');
  expect(errors).toEqual([]);
});

test('paper order ticket offers a mutually exclusive dynamic ATR stop with tunable parameters',async({page})=>{
  await isolateExternalFeeds(page);
  const errors:string[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto('./');
  await page.getByRole('button',{name:/Paper Trading/}).first().click();
  await expect(page.getByRole('button',{name:'Create order'})).toBeEnabled();
  await page.getByRole('button',{name:'Create order'}).click();
  const ticket=page.getByRole('dialog',{name:'Paper Trading order entry'});
  await expect(ticket).toBeVisible();
  const dynamic=ticket.getByRole('switch',{name:'Enable dynamic ATR trailing stop'});
  await dynamic.click();
  await expect(dynamic).toHaveAttribute('aria-checked','true');
  await expect(ticket.getByLabel('Ticket dynamic ATR period')).toHaveValue('22');
  await expect(ticket.getByLabel('Ticket dynamic multiplier')).toHaveValue('3');
  await ticket.getByLabel('Ticket dynamic lookback').fill('30');
  await ticket.getByLabel('Ticket dynamic timeframe').selectOption('5m');
  await expect(ticket).toContainText('The dynamic level is unavailable until enough history');
  const percent=ticket.getByRole('switch',{name:'Enable trailing stop loss'});
  await percent.click();
  await expect(percent).toHaveAttribute('aria-checked','true');
  await expect(dynamic).toHaveAttribute('aria-checked','false');
  expect(errors).toEqual([]);
});
