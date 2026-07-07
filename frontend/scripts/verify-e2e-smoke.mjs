/**
 * Headless Playwright mirror of Cypress E2E smoke specs (for hosts without Xvfb).
 * Run with E2E stack up: `npm run dev:e2e` then `node scripts/verify-e2e-smoke.mjs`
 */
import { chromium } from 'playwright';

const E2E_ORIGIN = 'http://localhost:8080';
const E2E_BACKEND_ORIGIN = 'http://127.0.0.1:3000';

async function waitForAppShell(page) {
  await page.waitForSelector('[data-cy=app-layout]', { timeout: 60_000 });
  await page.waitForSelector('.echo-boot-gate', {
    state: 'detached',
    timeout: 15_000,
  });
  await page.waitForSelector('[data-cy=app-layout]', {
    state: 'visible',
    timeout: 15_000,
  });
}

async function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function run() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
  });
  const page = await context.newPage();
  const failures = [];

  async function step(name, fn) {
    try {
      await fn();
      console.log(`✓ ${name}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`✗ ${name}: ${msg}`);
      failures.push({ name, msg });
    }
  }

  await step('smoke: backend health', async () => {
    const res = await page.request.get(`${E2E_BACKEND_ORIGIN}/api/v1/health`);
    await assert(res.status() === 200, `expected 200, got ${res.status()}`);
  });

  await step('smoke: loads app shell', async () => {
    await page.goto(`${E2E_ORIGIN}/`);
    await waitForAppShell(page);
  });

  await step('proxy: health via vite proxy', async () => {
    const res = await page.request.get(`${E2E_ORIGIN}/api/v1/health`);
    await assert(res.status() === 200, `expected 200, got ${res.status()}`);
    const body = await res.json();
    await assert(body.status === 'ok', 'health body missing status ok');
    await assert('db' in body, 'health body missing db');
    await assert('nats' in body, 'health body missing nats');
  });

  await step('proxy: reset-password surface', async () => {
    await page.goto(`${E2E_ORIGIN}/reset-password`);
    await page.waitForSelector('h1.reset-title', { timeout: 60_000 });
    const title = await page.locator('h1.reset-title').textContent();
    await assert(
      title?.includes('Reset password'),
      `unexpected title: ${title}`,
    );
    const label = await page.locator('label[for="rp-token"]').textContent();
    await assert(label?.includes('Reset token'), `unexpected label: ${label}`);
  });

  await step('proxy: forgot-password surface', async () => {
    await page.goto(`${E2E_ORIGIN}/forgot-password`);
    await page.waitForSelector('h1.forgot-title', { timeout: 60_000 });
    const title = await page.locator('h1.forgot-title').textContent();
    await assert(
      title?.includes('Forgot password'),
      `unexpected title: ${title}`,
    );
    const label = await page.locator('label[for="fp-email"]').textContent();
    await assert(label?.includes('Email'), `unexpected label: ${label}`);
  });

  await step('chat-shell: opens Explore from rail', async () => {
    await page.goto(`${E2E_ORIGIN}/`);
    await waitForAppShell(page);
    const onExplore = await page
      .locator('h1')
      .filter({ hasText: 'Find your next corner of Echo.' })
      .count();
    if (onExplore === 0) {
      const trigger = page
        .locator(
          '[data-cy=explore-rail-trigger], button.explore-trigger[title*="Explore"]',
        )
        .first();
      await trigger.click({ timeout: 60_000 });
    }
    await page.waitForSelector('h1', {
      hasText: 'Find your next corner of Echo.',
      timeout: 60_000,
    });
    await assert(
      await page
        .locator('h1', { hasText: 'Find your next corner of Echo.' })
        .isVisible(),
      'Explore heading not visible',
    );
  });

  await step('server-rail: reorder root when present', async () => {
    await page.goto(`${E2E_ORIGIN}/`);
    await waitForAppShell(page);
    const count = await page
      .locator('[data-cy=server-rail-reorder-root]')
      .count();
    if (count > 0) {
      await assert(
        await page
          .locator('[data-cy=server-rail-reorder-root]')
          .first()
          .isVisible(),
        'reorder root not visible',
      );
    }
  });

  await step('server-rail: icons when mock guilds present', async () => {
    const icons = page.locator('[data-cy=server-rail-icon]');
    const count = await icons.count();
    if (count >= 2) {
      await assert(
        await icons.nth(0).isVisible(),
        'first rail icon not visible',
      );
      await assert(
        await icons.nth(1).isVisible(),
        'second rail icon not visible',
      );
    }
  });

  await browser.close();

  if (failures.length > 0) {
    console.error(`\n${failures.length} E2E check(s) failed.`);
    process.exit(1);
  }
  console.log('\nAll E2E smoke checks passed.');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
