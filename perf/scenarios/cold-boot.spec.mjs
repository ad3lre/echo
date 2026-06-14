import { test } from '@playwright/test';
import { channelUrl, getPerfEnv } from '../lib/env.mjs';
import {
  disableCacheForPage,
  mergeHarnessMilestones,
  readHarnessReport,
  readNavigationTiming,
  resetHarness,
  waitForAppShell,
  waitForChatReady,
} from '../lib/harness.mjs';
import { writeScenarioResult } from '../lib/report.mjs';
import { summarizeMetricMap } from '../lib/stats.mjs';

const METRICS = [
  'boot_spinner_visible',
  'boot_vue_mounted',
  'boot_gate_dismissed',
  'boot_shell_visible',
  'boot_workspace_settled',
  'boot_chat_ready',
];

test.describe('cold boot', () => {
  test('measure cold boot milestones', async ({ browser }) => {
    const env = getPerfEnv();
    const rawSamples = [];

    for (let i = 0; i < env.iterations; i += 1) {
      const context = await browser.newContext({
        storageState: env.authStoragePath,
        viewport: { width: 1280, height: 720 },
        locale: 'en-US',
        baseURL: env.baseUrl,
      });
      await context.grantPermissions(['microphone']);
      const page = await context.newPage();
      await disableCacheForPage(page);
      await resetHarness(page);

      const startedAt = Date.now();
      await page.goto(channelUrl(env, env.channelA), {
        waitUntil: 'domcontentloaded',
      });
      await waitForAppShell(page);
      const shellMs = Date.now() - startedAt;
      await waitForChatReady(page);
      const chatMs = Date.now() - startedAt;

      const report = await readHarnessReport(page);
      const navTiming = await readNavigationTiming(page);
      const sample = { ...navTiming };
      mergeHarnessMilestones(sample, report.milestones);
      if (
        sample.boot_shell_visible == null ||
        sample.boot_shell_visible === 0
      ) {
        sample.boot_shell_visible = shellMs;
      }
      if (sample.boot_chat_ready == null) {
        sample.boot_chat_ready = chatMs;
      }
      if (sample.boot_spinner_visible == null) {
        sample.boot_spinner_visible = 0;
      }
      rawSamples.push(sample);
      await context.close();
    }

    writeScenarioResult(env.resultsDir, {
      scenario: 'cold_boot',
      rawSamples,
      stats: summarizeMetricMap(rawSamples, METRICS),
    });
  });
});
