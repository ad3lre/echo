import { test } from '@playwright/test';
import { channelUrl, getPerfEnv } from '../lib/env.mjs';
import {
  readHarnessReport,
  resetHarness,
  waitForAppShell,
  waitForChatReady,
} from '../lib/harness.mjs';
import { writeScenarioResult } from '../lib/report.mjs';
import { summarizeMetricMap } from '../lib/stats.mjs';

const METRICS = [
  'misc_explore_open_ms',
  'misc_dm_tab_ms',
  'misc_server_switch_ms',
  'misc_return_guild_ms',
];

test.describe('misc navigation', () => {
  test('measure explore, DM tab, server switch, return', async ({
    browser,
  }) => {
    const env = getPerfEnv();
    const rawSamples = [];

    for (let i = 0; i < env.iterations; i += 1) {
      const context = await browser.newContext({
        storageState: env.authStoragePath,
        viewport: { width: 1280, height: 720 },
        locale: 'en-US',
        baseURL: env.baseUrl,
      });
      const page = await context.newPage();
      await page.goto(channelUrl(env, env.channelA), {
        waitUntil: 'domcontentloaded',
      });
      await waitForAppShell(page);
      await waitForChatReady(page);
      await resetHarness(page);

      const sample = {};

      const exploreStart = Date.now();
      const exploreBtn = page
        .locator('button.explore-trigger[title^="Explore "]')
        .first();
      await exploreBtn.click({ timeout: 30_000 });
      await page
        .getByRole('heading', { name: 'Find your next corner of Echo.' })
        .waitFor({ state: 'visible', timeout: 30_000 });
      sample.misc_explore_open_ms = Date.now() - exploreStart;

      await exploreBtn.click({ timeout: 30_000 });
      await waitForAppShell(page);

      const dmStart = Date.now();
      await page.locator('button[title="Direct messages"]').first().click({
        timeout: 30_000,
      });
      await page.getByRole('heading', { name: /^Direct Messages$/i }).waitFor({
        state: 'visible',
        timeout: 30_000,
      });
      sample.misc_dm_tab_ms = Date.now() - dmStart;

      const serverIcons = page.locator('[data-cy=server-rail-icon]');
      const count = await serverIcons.count();
      if (count > 1) {
        const switchStart = Date.now();
        await page.locator('button[title="Servers"]').first().click({
          timeout: 30_000,
        });
        await serverIcons.nth(1).click({ timeout: 30_000 });
        await waitForAppShell(page);
        sample.misc_server_switch_ms = Date.now() - switchStart;
      } else {
        sample.misc_server_switch_ms = 0;
      }

      const returnStart = Date.now();
      await page.goto(channelUrl(env, env.channelA), {
        waitUntil: 'domcontentloaded',
      });
      await waitForChatReady(page);
      sample.misc_return_guild_ms = Date.now() - returnStart;

      const report = await readHarnessReport(page);
      Object.assign(sample, report.milestones);
      rawSamples.push(sample);
      await context.close();
    }

    writeScenarioResult(env.resultsDir, {
      scenario: 'misc_nav',
      rawSamples,
      stats: summarizeMetricMap(rawSamples, METRICS),
    });
  });
});
