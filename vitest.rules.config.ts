import { defineConfig } from 'vitest/config';

// Rules tests run against the Firestore emulator via `npm run test:rules`.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/rules/**/*.test.ts'],
    testTimeout: 30000,
    hookTimeout: 30000,
    fileParallelism: false,
  },
});
