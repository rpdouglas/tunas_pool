import { defineConfig } from 'vitest/config';

// Rules tests and the functions' integration tests (functions/src/*.int.test.ts) run against the
// Firestore emulator via `npm run test:rules`.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/rules/**/*.test.ts', 'functions/src/**/*.int.test.ts'],
    testTimeout: 30000,
    hookTimeout: 30000,
    fileParallelism: false,
  },
});
