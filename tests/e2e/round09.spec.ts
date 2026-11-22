import {test,expect} from '@playwright/test';
import {isolateExternalFeeds} from './market-fixtures';
test.beforeEach(async({page})=>{await isolateExternalFeeds(page);});
test('installable manifest and offline shell are served',async({page})=>{
 await page.goto('./');
 const manifest=await page.locator('link[rel="manifest"]').getAttribute('href');
 expect(manifest).toBeTruthy();
 const response=await page.request.get(new URL(manifest!,page.url()).toString());
 expect(response.ok()).toBeTruthy();
 const m=await response.json();
 expect(m.name).toContain('PluTrade');
 expect(m.display).toBe('standalone');
 const sw=await page.request.get(new URL('./sw.js',page.url()).toString());
 expect(sw.ok()).toBeTruthy();
 const code=await sw.text();
 expect(code).toContain('app-shell');
 expect(code).not.toContain('marketFetch');
});
test('shortcuts navigate screener, replay and help without changing URL',async({page})=>{
 await page.goto('./');
 await page.keyboard.press('Shift+S');
 await expect(page.locator('#plutrade-screener')).toBeVisible();
 await page.keyboard.press('Shift+R');
 await expect(page.locator('#plutrade-historical-lab')).toBeVisible();
 await page.keyboard.press('Shift+Slash');
 await expect(page.getByRole('dialog',{name:'PluTrade Keyboard Shortcuts'})).toBeVisible();
 await page.keyboard.press('Escape');
 await expect(page.getByRole('dialog',{name:'PluTrade Keyboard Shortcuts'})).toHaveCount(0);
});
