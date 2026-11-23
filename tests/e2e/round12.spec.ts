import {test,expect} from '@playwright/test';
import {isolateExternalFeeds} from './market-fixtures';

test.beforeEach(async ({page})=>{await isolateExternalFeeds(page);});

test('Round 12 Strategy Lab opens, edits validated rules and routes Replay without fake candles',async ({page})=>{
  const errors:string[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto('./');
  await page.getByRole('button',{name:'Open Strategy Lab'}).click();
  await expect(page.getByRole('navigation',{name:'Paper trading workspace tabs'})
    .getByRole('button',{name:'Strategy Lab'})).toBeVisible();
  const lab=page.locator('#plutrade-strategy-lab');
  await expect(lab).toBeVisible();
  await expect(lab.getByText('Research & simulation only')).toBeVisible();
  await lab.getByRole('button',{name:'+ Condition'}).first().click();
  await expect(lab.getByLabel('entry condition 2 left metric')).toBeVisible();
  await lab.getByRole('button',{name:'Save locally'}).click();
  await expect(lab.getByRole('status')).toContainText('Saved to this browser only');
  await expect(lab.getByRole('button',{name:'Load Verified History'})).toBeEnabled();
  await expect(lab.getByRole('button',{name:'Run Strategy'})).toBeDisabled();
  await page.getByRole('button',{name:'Open historical replay'}).click();
  await expect(page.locator('#plutrade-historical-lab')).toBeVisible();
  expect(errors).toEqual([]);
});
