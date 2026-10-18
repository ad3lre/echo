#!/usr/bin/env bun
import { chromium } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { channelUrl, getPerfEnv } from './lib/env.mjs';
import {
  disableCacheForPage,
  readHarnessReport,
  resetHarness,
  waitForAppShell,
  waitForChatReady,
} from './lib/harness.mjs';

const env = getPerfEnv(path.dirname(fileURLToPath(import.meta.url)));
const iterations = 5;
const samples = [];

function summarize(nums) {
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 === 0
      ? Math.round((sorted[mid - 1] + sorted[mid]) / 2)
      : sorted[mid];
  return {
    n: sorted.length,
    min: sorted[0],
    median,
    max: sorted[sorted.length - 1],
    samples: sorted,
  };
}

for (let i = 0; i < iterations; i++) {
  process.stderr.write(`sample ${i + 1}/${iterations}…\n`);
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    storageState: env.authStoragePath,
    viewport: { width: 1280, height: 720 },
    locale: 'en-US',
    baseURL: env.baseUrl,
  });
  const page = await context.newPage();
  await disableCacheForPage(page);

  const historyTimings = [];
  page.on('response', async (res) => {
    try {
      const url = res.url();
      if (
        !/\/messages(?:\?|$|\/)/.test(url) &&
        !/\/channels\/[^/]+\/messages/.test(url)
      )
        return;
      const req = res.request();
      const timing = res.request().timing?.() ?? null;
      const start = Date.now();
      // Playwright Response timing via headers date is weak; use request finished delta via resource.
      historyTimings.push({
        url: url.replace(/^https?:\/\/[^/]+/, ''),
        status: res.status(),
        // filled below after wait
        _t0: start,
      });
    } catch {}
  });

  await page.goto(channelUrl(env, env.channelA, true), {
    waitUntil: 'domcontentloaded',
  });
  await waitForAppShell(page);
  await waitForChatReady(page);

  await resetHarness(page);

  // Arm DOM timing right before click
  await page.evaluate(() => {
    window.__gap = {
      clickAt: performance.now(),
      clearAt: null,
      emptyAt: null,
      skeletonAt: null,
      contentAt: null,
      emptySeen: false,
      skeletonSeen: false,
      cleared: false,
      contentSeen: false,
    };
    const g = window.__gap;
    const tick = () => {
      const list = document.querySelector('[data-cy=message-list]');
      const text = document.body?.innerText ?? '';
      const empty = /No messages here yet/i.test(text);
      const skeleton = !!document.querySelector(
        '.message-list-skeleton-overlay',
      );
      const rows = list
        ? list.querySelectorAll(
            '[data-message-id], .message-row, [data-cy=message-row]',
          ).length
        : 0;

      if (!g.cleared && (skeleton || empty || rows === 0)) {
        g.cleared = true;
        g.clearAt = performance.now();
      }
      if (g.cleared && !g.emptySeen && empty) {
        g.emptySeen = true;
        g.emptyAt = performance.now();
      }
      if (g.cleared && !g.skeletonSeen && skeleton) {
        g.skeletonSeen = true;
        g.skeletonAt = performance.now();
      }
      // Content only counts after we observed a clear/empty/skeleton transition
      if (g.cleared && !g.contentSeen && !skeleton && !empty && rows > 0) {
        g.contentSeen = true;
        g.contentAt = performance.now();
      }
    };
    const obs = new MutationObserver(tick);
    obs.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });
    tick();
    window.__gapObs = obs;
  });

  const clickWall = Date.now();
  const historyReqStarts = [];
  page.on('request', (req) => {
    const url = req.url();
    if (
      /\/messages(?:\?|$|\/)/.test(url) ||
      /\/channels\/[^/]+\/messages/.test(url)
    ) {
      historyReqStarts.push({
        url: url.replace(/^https?:\/\/[^/]+/, ''),
        t: Date.now(),
      });
    }
  });
  const historyRes = [];
  page.on('response', async (res) => {
    const url = res.url();
    if (
      !/\/messages(?:\?|$|\/)/.test(url) &&
      !/\/channels\/[^/]+\/messages/.test(url)
    )
      return;
    const start = historyReqStarts.find(
      (h) => url.endsWith(h.url) || url.includes('/messages'),
    );
    historyRes.push({
      path: url.replace(/^https?:\/\/[^/]+/, ''),
      status: res.status(),
      // approximate from matching request
      approxMs: start ? Date.now() - start.t : null,
    });
  });

  await page
    .locator(`[data-channel-row-anchor="${env.channelB}"]`)
    .click({ timeout: 30_000 });

  await page.waitForFunction(
    () => window.__gap?.contentSeen === true,
    undefined,
    { timeout: 90_000 },
  );
  await page.waitForTimeout(50);

  const gap = await page.evaluate(() => {
    const g = window.__gap;
    const round = (a, b) =>
      a != null && b != null ? Math.max(0, Math.round(b - a)) : null;
    return {
      emptySeen: g.emptySeen,
      skeletonSeen: g.skeletonSeen,
      cleared: g.cleared,
      clickToClearMs: round(g.clickAt, g.clearAt),
      clickToEmptyMs: round(g.clickAt, g.emptyAt),
      clickToSkeletonMs: round(g.clickAt, g.skeletonAt),
      clickToContentMs: round(g.clickAt, g.contentAt),
      emptyToContentMs: round(g.emptyAt, g.contentAt),
      skeletonToContentMs: round(g.skeletonAt, g.contentAt),
      clearToContentMs: round(g.clearAt, g.contentAt),
    };
  });
  const report = await readHarnessReport(page);
  const wallMs = Date.now() - clickWall;

  samples.push({
    iteration: i + 1,
    ...gap,
    wallClickToContentMs: wallMs,
    chat_switch_fetch_start: report.milestones?.chat_switch_fetch_start ?? null,
    chat_switch_fetch_end: report.milestones?.chat_switch_fetch_end ?? null,
    chat_switch_merge_done: report.milestones?.chat_switch_merge_done ?? null,
    chat_switch_first_message_visible:
      report.milestones?.chat_switch_first_message_visible ?? null,
    historyResponses: historyRes,
  });

  await context.close();
  await browser.close();
}

const pick = (k) =>
  samples.map((s) => s[k]).filter((n) => typeof n === 'number');
const out = {
  meta: {
    baseUrl: env.baseUrl,
    mode: 'switch',
    channelA: env.channelA,
    channelB: env.channelB,
    iterations,
    recordedAt: new Date().toISOString(),
  },
  samples,
  summary: {
    emptyFlashRate: `${samples.filter((s) => s.emptySeen).length}/${samples.length}`,
    skeletonFlashRate: `${samples.filter((s) => s.skeletonSeen).length}/${samples.length}`,
    clickToContentMs: summarize(pick('clickToContentMs')),
    skeletonToContentMs: pick('skeletonToContentMs').length
      ? summarize(pick('skeletonToContentMs'))
      : null,
    emptyToContentMs: pick('emptyToContentMs').length
      ? summarize(pick('emptyToContentMs'))
      : null,
    clearToContentMs: pick('clearToContentMs').length
      ? summarize(pick('clearToContentMs'))
      : null,
    fetchEndFromSwitchStartMs: pick('chat_switch_fetch_end').length
      ? summarize(pick('chat_switch_fetch_end'))
      : null,
    wallClickToContentMs: summarize(pick('wallClickToContentMs')),
  },
};
console.log(JSON.stringify(out, null, 2));
