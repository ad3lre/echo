import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, devices } from '@playwright/test';

const perfDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(perfDir, '..');

const baseURL =
  process.env.PERF_BASE_URL?.replace(/\/$/, '') || 'https://chat-echo.com';

export default defineConfig({
  testDir: './scenarios',
  testMatch: '**/*.spec.mjs',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 120_000,
  expect: { timeout: 60_000 },
  reporter: [
    ['list'],
    [
      'json',
      { outputFile: path.join(perfDir, 'results/playwright-report.json') },
    ],
  ],
  outputDir: path.join(perfDir, 'results/test-artifacts'),
  globalSetup: path.join(perfDir, 'global-setup.mjs'),
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
    viewport: { width: 1280, height: 720 },
    locale: 'en-US',
    storageState: path.join(perfDir, '.auth/storage.json'),
    launchOptions: {
      args: [
        '--use-fake-device-for-media-stream',
        '--use-fake-ui-for-media-stream',
      ],
    },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  metadata: {
    repoRoot,
    baseURL,
  },
});
