// Adapted from crypto-lab-schnorr-forge's production-state accessibility gate.
// Setup checks structure only. Product language is checked in claims.spec.ts.
import AxeBuilder from '@axe-core/playwright';
import { expect,type Page } from '@playwright/test';
import { auditContrast,formatContrastFailures } from './contrast';
import { auditNonText,formatNonTextFailures } from './nontext';
export async function boot(page:Page) {
  await page.emulateMedia({reducedMotion:'reduce'});await page.goto('.');
  await expect(page.locator('#run')).toBeEnabled({timeout:30000});
  await expect(page.locator('main')).toHaveCount(1);await expect(page.locator('h1')).toHaveCount(1);
  await expect(page.locator('[role=banner]')).toHaveCount(1);
  await expect(page.locator('.scenario-switch button')).toHaveCount(2);
  await expect(page.locator('.scenario-switch [aria-pressed=true]')).toHaveCount(1);
  await expect(page.locator('#reveal')).toBeHidden();await expect(page.locator('details[open]')).toHaveCount(0);
  await expect(page.locator('.cl-skip-link')).toHaveAttribute('href','#app');
  await expect(page.locator('#app')).toHaveCount(1);await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
  expect(await page.evaluate(()=>matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(true);
  await expect(page.locator('[data-theme-toggle],#cl-theme-toggle,#theme-toggle')).toHaveCount(0);
}
export async function run(page:Page) {
  await page.locator('#run').click();await expect(page.locator('#app')).not.toHaveAttribute('data-status','running',{timeout:65000});
}
export async function scan(page:Page,state:string) {
  const wcag=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa']).analyze();
  expect(wcag.violations,`${state}: axe WCAG violations`).toEqual([]);
  // Incomplete contrast decisions are owned by the arithmetic oracle below.
  // Other unresolved axe nodes must be reviewed, not silently dropped.
  expect(wcag.incomplete.filter(v=>v.id!=='color-contrast'),`${state}: unresolved axe checks`).toEqual([]);
  expect(formatContrastFailures(await auditContrast(page)),`${state}: text contrast`).toEqual([]);
  expect(formatNonTextFailures(await auditNonText(page)),`${state}: control and generated-content contrast`).toEqual([]);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${state}: page reflow`).toBe(true);
}
