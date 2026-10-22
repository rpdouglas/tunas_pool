import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import mdx from '@mdx-js/rollup';
import remarkFrontmatter from 'remark-frontmatter';
import remarkGfm from 'remark-gfm';
import remarkMdxFrontmatter from 'remark-mdx-frontmatter';
import { VitePWA } from 'vite-plugin-pwa';
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
    // The installable app (D-141). The worker keeps the app's own files only: never Firestore,
    // Functions, Auth, or Storage, which are other addresses and pass straight through. A new
    // version waits for Refresh on the update bar (src/features/pwa), or the next open.
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      manifestFilename: 'manifest.webmanifest',
      includeAssets: [],
      includeManifestIcons: false, // the browser fetches them itself when the app is installed
      manifest: {
        id: '/',
        name: "Tunas Weekly Football Pool Pick 'Em",
        short_name: 'Tunas Pool',
        description: 'Make your picks every week.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        theme_color: '#241773', // purple-800, as in index.html (tokens.css can't reach the manifest)
        background_color: '#241773',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: '/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // All the JS and CSS, so an old version keeps working whole until Refresh, and the
        // Latin fonts. Other font subsets, the guide's shots, and team logos are kept once seen.
        globPatterns: [
          'index.html',
          'assets/*.{js,css}',
          'assets/*-latin-[0-9]*.woff2',
          'assets/wordmark-*.webp',
        ],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/__\//], // Firebase's sign-in handler and reserved paths
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            urlPattern: ({ sameOrigin, url }) => sameOrigin && url.pathname.startsWith('/assets/'),
            handler: 'CacheFirst', // hashed names: a file never changes under the same name
            options: { cacheName: 'assets', expiration: { maxEntries: 80 } },
          },
          {
            urlPattern: ({ sameOrigin, url }) =>
              sameOrigin && /^\/(guide|teams)\//.test(url.pathname),
            handler: 'StaleWhileRevalidate', // refetched each deploy (D-103), and the guide's shots
            options: {
              cacheName: 'pictures',
              expiration: { maxEntries: 80, maxAgeSeconds: 30 * 24 * 60 * 60 },
            },
          },
        ],
      },
    }),
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
