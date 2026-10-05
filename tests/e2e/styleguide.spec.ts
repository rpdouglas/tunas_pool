import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/styleguide');
  await page.evaluate(() => document.fonts.ready);
});

test('styleguide has no axe violations (WCAG 2.2 AA)', async ({ page }) => {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
});

test('brand fonts load (DESIGN_SYSTEM typography)', async ({ page }) => {
  const loaded = await page.evaluate(() => {
    const families = ['Alfa Slab One', 'Barlow Condensed', 'Barlow'];
    const faces = [...document.fonts].filter((f) => f.status === 'loaded');
    return families.filter((family) => faces.some((f) => f.family.replace(/"/g, '') === family));
  });
  expect(loaded).toEqual(['Alfa Slab One', 'Barlow Condensed', 'Barlow']);
});

test('no horizontal scroll', async ({ page }) => {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
