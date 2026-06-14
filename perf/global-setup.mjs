import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { getPerfEnv } from './lib/env.mjs';

const perfDir = path.dirname(fileURLToPath(import.meta.url));

export default async function globalSetup() {
  const env = getPerfEnv(perfDir);
  fs.mkdirSync(path.dirname(env.authStoragePath), { recursive: true });

  if (fs.existsSync(env.authStoragePath)) {
    const ageMs = Date.now() - fs.statSync(env.authStoragePath).mtimeMs;
    if (ageMs < 6 * 60 * 60 * 1000) {
      return;
    }
  }

  const browser = await chromium.launch({
    args: [
      '--use-fake-device-for-media-stream',
      '--use-fake-ui-for-media-stream',
    ],
  });
  const context = await browser.newContext({
    baseURL: env.baseUrl,
    viewport: { width: 1280, height: 720 },
  });
  await context.clearCookies();

  const loginRes = await context.request.post('/api/v1/auth/login', {
    data: {
      username: env.username,
      password: env.password,
    },
  });
  if (!loginRes.ok()) {
    throw new Error(
      `Global perf auth setup failed: login HTTP ${loginRes.status()}`,
    );
  }

  const meRes = await context.request.get('/api/v1/auth/me');
  if (!meRes.ok()) {
    throw new Error(
      `Global perf auth setup failed: auth/me HTTP ${meRes.status()}`,
    );
  }
  const meBody = await meRes.json();
  if (meBody?.user?.isGuest !== false) {
    throw new Error(
      'Global perf auth setup failed: expected a non-guest session after login.',
    );
  }

  const page = await context.newPage();
  await page.goto('/?perfHarness=1', { waitUntil: 'domcontentloaded' });
  await page
    .locator('[data-cy=app-layout]')
    .waitFor({ state: 'visible', timeout: 60_000 });

  await context.storageState({ path: env.authStoragePath });
  await browser.close();
}
