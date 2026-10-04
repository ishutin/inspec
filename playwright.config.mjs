import { defineConfig, devices } from '@playwright/test';

// The page tests (tests/read/*.spec.mjs); the node tests are *.test.mjs and run under `node --test`.
export default defineConfig({
  testDir: 'tests/read',
  testMatch: '**/*.spec.mjs',
  // Each test starts its own repository and server; one worker keeps a stopped server's port free for its `open`.
  workers: 1,
  timeout: 60000,
  reporter: 'list',
  use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 }, actionTimeout: 10000 },
});
