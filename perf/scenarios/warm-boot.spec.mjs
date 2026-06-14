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
  'boot_spinner_visible',
  'boot_vue_mounted',
  'boot_gate_dismissed',
  'boot_shell_visible',
  'boot_workspace_settled',
  'boot_chat_ready',
];

test.describe('warm boot', () => {
  test('measure warm boot milestones', async ({ browser }) => {
    const env = getPerfEnv();
    const rawSamples = [];

    const context = await browser.newContext({
      storageState: env.authStoragePath,
      viewport: { width: 1280, height: 720 },
      locale: 'en-US',
      baseURL: env.baseUrl,
    });
    await context.grantPermissions(['microphone']);
    const page = await context.newPage();

    await page.goto(channelUrl(env, env.channelA), {
      waitUntil: 'domcontentloaded',
    });
    await waitForAppShell(page);
    await waitForChatReady(page);

    for (let i = 0; i < env.iterations; i += 1) {
      await resetHarness(page);
      const startedAt = Date.now();
      await page.reload({ waitUntil: 'domcontentloaded' });
      await waitForAppShell(page);
      const shellMs = Date.now() - startedAt;
      await waitForChatReady(page);
      const chatMs = Date.now() - startedAt;
      const report = await readHarnessReport(page);
      const sample = {};
      mergeHarnessMilestones(sample, report.milestones);
      sample.boot_shell_visible = sample.boot_shell_visible ?? shellMs;
      sample.boot_chat_ready = sample.boot_chat_ready ?? chatMs;
      sample.boot_spinner_visible = sample.boot_spinner_visible ?? 0;
      rawSamples.push(sample);
    }

    await context.close();

    writeScenarioResult(env.resultsDir, {
      scenario: 'warm_boot',
      rawSamples,
      stats: summarizeMetricMap(rawSamples, METRICS),
    });
  });
});
