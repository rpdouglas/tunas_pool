import { defineConfig, devices } from '@playwright/test';

// Browser checks against a production build of the dev-only /styleguide route.
// PW_CHROMIUM_PATH points at a preinstalled Chromium (cloud sessions); CI uses Playwright's own.
const executablePath = process.env.PW_CHROMIUM_PATH || undefined;

export default defineConfig({
  testDir: 'tests/e2e',
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://localhost:4173',
    launchOptions: { executablePath },
  },
  projects: [
    // Design target: 375px phone (CLAUDE.md §4.8).
    {
      name: 'phone-375',
      use: { ...devices['Desktop Chrome'], viewport: { width: 375, height: 812 } },
    },
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command:
      'VITE_ENABLE_STYLEGUIDE=true npx vite build --outDir dist-a11y && npx vite preview --outDir dist-a11y --port 4173 --strictPort',
    url: 'http://localhost:4173/styleguide',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
