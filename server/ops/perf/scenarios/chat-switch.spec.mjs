import { test } from '@playwright/test';
import { channelUrl, getPerfEnv } from '../lib/env.mjs';
import {
  mergeHarnessMilestones,
  readHarnessReport,
  resetHarness,
  waitForAppShell,
  waitForChatReady,
} from '../lib/harness.mjs';
import { writeScenarioResult } from '../lib/report.mjs';
import { summarizeMetricMap } from '../lib/stats.mjs';

const METRICS = [
  'chat_switch_start',
  'chat_switch_fetch_start',
  'chat_switch_fetch_end',
  'chat_switch_merge_done',
  'chat_switch_ui_rendered',
  'chat_switch_first_message_visible',
];

test.describe('chat switch', () => {
  test('measure channel A to channel B switch', async ({ browser }) => {
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
      const startedAt = Date.now();
      await page
        .locator(`[data-channel-row-anchor="${env.channelB}"]`)
        .click({ timeout: 30_000 });
      await waitForChatReady(page);
      const totalMs = Date.now() - startedAt;

      const report = await readHarnessReport(page);
      const sample = {
        chat_switch_start: 0,
        chat_switch_ui_rendered:
          report.milestones.chat_switch_ui_rendered ?? totalMs,
        chat_switch_first_message_visible:
          report.milestones.chat_switch_first_message_visible ?? totalMs,
      };
      mergeHarnessMilestones(sample, report.milestones);
      rawSamples.push(sample);
      await context.close();
    }

    writeScenarioResult(env.resultsDir, {
      scenario: 'chat_switch',
      rawSamples,
      stats: summarizeMetricMap(rawSamples, METRICS),
    });
  });
});
