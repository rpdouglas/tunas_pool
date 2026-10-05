import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@shared': path.resolve(__dirname, 'shared'),
    },
  },
  // host: true lets Codespaces forward the dev server port
  server: { host: true, port: 5173 },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}', 'shared/**/*.test.ts', 'functions/src/**/*.test.ts'],
    exclude: ['**/*.int.test.ts', '**/node_modules/**'], // integration tests need the emulator: npm run test:rules
    css: false,
  },
});
