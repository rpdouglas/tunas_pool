import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

// Pages that render without a backend: the styleguide, the player sign-in screens, and the admin
// sign-in gate (no one is signed in, so it shows the email form).
const PAGES = [
  { path: '/styleguide', ready: 'Styleguide' },
  { path: '/account', ready: 'Email me a link' },
  { path: '/auth/finish', ready: "This isn't a sign-in link." },
  { path: '/admin', ready: 'This area is for the pool admin' },
];

for (const { path, ready } of PAGES) {
  test.describe(path, () => {
    test.beforeEach(async ({ page }) => {
      await page.goto(path);
      await page.getByText(ready).first().waitFor();
      await page.evaluate(() => document.fonts.ready);
    });

    test('has no axe violations (WCAG 2.2 AA)', async ({ page }) => {
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
        .analyze();
      expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
    });

    test('has no horizontal scroll', async ({ page }) => {
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);
    });
  });
}

test('brand fonts load (DESIGN_SYSTEM typography)', async ({ page }) => {
  await page.goto('/styleguide');
  // The styleguide loads on demand; wait for it, not the loading placeholder.
  await page.getByRole('heading', { name: 'Styleguide' }).waitFor();
  await page.evaluate(() => document.fonts.ready);
  const loaded = await page.evaluate(() => {
    const families = ['Alfa Slab One', 'Barlow Condensed', 'Barlow'];
    const faces = [...document.fonts].filter((f) => f.status === 'loaded');
    return families.filter((family) => faces.some((f) => f.family.replace(/"/g, '') === family));
  });
  expect(loaded).toEqual(['Alfa Slab One', 'Barlow Condensed', 'Barlow']);
});
