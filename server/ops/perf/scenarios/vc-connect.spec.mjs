import { test } from '@playwright/test';
import { channelUrl, getPerfEnv } from '../lib/env.mjs';
import {
  dismissBlockingDialogs,
  mergeHarnessMilestones,
  readHarnessReport,
  resetHarness,
  waitForAppShell,
  waitForVcConnected,
} from '../lib/harness.mjs';
import { writeScenarioResult } from '../lib/report.mjs';
import { summarizeMetricMap } from '../lib/stats.mjs';

const METRICS = ['vc_connect_start', 'vc_connected', 'vc_connect_duration'];

test.describe('vc connect', () => {
  test('measure voice channel join to connected', async ({ browser }) => {
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

      await page.goto(channelUrl(env, env.channelA), {
        waitUntil: 'domcontentloaded',
      });
      await waitForAppShell(page);

      const leaveVoice = page.getByRole('button', {
        name: /^Leave voice channel$/i,
      });
      if (await leaveVoice.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await leaveVoice.click();
        await page.waitForTimeout(1_500);
      }

      await resetHarness(page);
      const startedAt = Date.now();
      await page
        .locator(`[data-channel-row-anchor="${env.voiceChannel}"]`)
        .click({ timeout: 30_000 });
      await dismissBlockingDialogs(page);
      await waitForVcConnected(page);
      const totalMs = Date.now() - startedAt;

      const report = await readHarnessReport(page);
      const sample = {
        vc_connect_start: report.milestones.vc_connect_start ?? 0,
        vc_connected: report.milestones.vc_connected ?? totalMs,
        vc_connect_duration: report.milestones.vc_connect_duration ?? totalMs,
      };
      mergeHarnessMilestones(sample, report.milestones);
      rawSamples.push(sample);

      if (await leaveVoice.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await leaveVoice.click();
      }

      await context.close();
    }

    writeScenarioResult(env.resultsDir, {
      scenario: 'vc_connect',
      rawSamples,
      stats: summarizeMetricMap(rawSamples, METRICS),
    });
  });
});
