import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import mdx from '@mdx-js/rollup';
import remarkFrontmatter from 'remark-frontmatter';
import remarkGfm from 'remark-gfm';
import remarkMdxFrontmatter from 'remark-mdx-frontmatter';
import path from 'node:path';

export default defineConfig({
  plugins: [
    // The in-app guide (D-136): .mdx pages under src/features/help/pages, frontmatter as an export.
    {
      enforce: 'pre',
      ...mdx({
        providerImportSource: '@mdx-js/react',
        remarkPlugins: [remarkFrontmatter, remarkMdxFrontmatter, remarkGfm],
      }),
    },
    react({ include: /\.(mdx|tsx?|jsx?)$/ }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@shared': path.resolve(__dirname, 'shared'),
    },
  },
  // host: true lets Codespaces forward the dev server port
  server: { host: true, port: 5173 },
  test: {
    globals: true,
    exclude: ['**/*.int.test.ts', '**/node_modules/**'], // integration tests need the emulator: npm run test:rules
    css: false,
    projects: [
      {
        extends: true,
        test: {
          name: 'web',
          environment: 'jsdom',
          pool: 'vmThreads', // one jsdom per worker, not per file (D-137)
          setupFiles: ['./src/test/setup.ts'],
          include: ['src/**/*.test.{ts,tsx}', 'shared/**/*.test.ts'],
        },
      },
      {
        // The functions' tests stay on the default pool: on Node 22 (CI) vmThreads can't load
        // jose, an ES module that firebase-admin requires through jwks-rsa.
        extends: true,
        test: {
          name: 'functions',
          environment: 'node',
          include: ['functions/src/**/*.test.ts'],
        },
      },
    ],
  },
});
