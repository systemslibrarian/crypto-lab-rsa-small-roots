import { expect,test } from '@playwright/test';
import { boot,run,scan } from './gate';
for(const width of [1280,320])test(`WCAG A/AA production states at ${width}px`,async({page})=>{
  test.setTimeout(240000);await page.setViewportSize({width,height:900});const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await boot(page);await scan(page,'arrival');await page.locator('.cl-skip-link').focus();await scan(page,'skip-link focus');
  await page.locator('#run').focus();await scan(page,'run-button focus');await page.locator('#prefix').focus();await scan(page,'prefix focus');
  await run(page);await expect(page.locator('#reveal')).toBeVisible();await scan(page,'recovered suffix alarm');
  for(const id of ['challenge','basis','reduction','roots']) {await page.locator(`#${id}-details>summary`).click();await scan(page,`${id} disclosure open`);}
  await page.locator('#row-select').selectOption('1');await scan(page,'selected alternate row');
  await page.locator('#trace-next').click();await scan(page,'trace step');
  await page.locator('.math-details>summary').click();await scan(page,'mathematical explanation');
  await page.locator('#prefix').fill('x'.repeat(80));await expect(page.locator('#app')).toHaveAttribute('data-status','invalid-input');await scan(page,'invalid message interval');
  await page.locator('#factor-tab').click();await expect(page.locator('#run')).toBeEnabled();await scan(page,'prime hint');
  await run(page);await expect(page.locator('#reveal')).toBeVisible();await scan(page,'recovered factors alarm');
  await page.locator('#run').click();await page.locator('#cancel').click();await scan(page,'cancelled run');
  await page.locator('#budget').selectOption('1');await run(page);await scan(page,'resource limit');
  await page.locator('#wiener-tab').click();await expect(page.locator('#run')).toBeEnabled({timeout:30000});await page.locator('#budget').selectOption('15000');await scan(page,'Wiener public challenge');
  await run(page);await expect(page.locator('#reveal')).toBeVisible({timeout:30000});await scan(page,'Wiener recovered-key alarm');
  await page.locator('#wiener-details>summary').click();await scan(page,'Wiener convergent ladder open');
  await page.locator('#wiener-evidence').click();await expect(page.locator('#run')).toBeEnabled({timeout:30000});await run(page);await expect(page.locator('#reveal')).toHaveAttribute('data-outcome','not-recovered',{timeout:30000});await scan(page,'Wiener no-recovery amber evidence');
  expect(errors).toEqual([]);
});
