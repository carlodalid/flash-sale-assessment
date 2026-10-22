import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globalSetup: './test/global-setup.ts',
    // Every test file shares one Postgres database and one Redis DB index.
    fileParallelism: false,
    testTimeout: 20_000,
    // Failure-path tests log on purpose; only show logs for tests that fail.
    silent: 'passed-only',
  },
});
