#!/usr/bin/env bun
/**
 * Measure time from empty/skeleton chat chrome → real message content.
 *
 * Modes:
 *   PERF_MODE=cold     hard-nav into channel A (default)
 *   PERF_MODE=switch   warm channel A, then click channel B (forces history fetch)
 *
 * Uses PERF_* from .env.perf. Cache disabled so history hits the network.
 */
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

const perfDir = path.dirname(fileURLToPath(import.meta.url));
const env = getPerfEnv(perfDir);
const iterations = Math.max(
  1,
  Number.parseInt(process.env.PERF_EMPTY_ITERS ?? '5', 10) || 5,
);
const mode = (process.env.PERF_MODE ?? 'switch').trim().toLowerCase();

/** @param {import('@playwright/test').Page} page */
async function installProbe(page) {
  await page.addInitScript(() => {
    const w = window;
    /** @type {any} */
    const state = {
      emptyAtMs: null,
      skeletonAtMs: null,
      contentAtMs: null,
      emptyToContentMs: null,
      skeletonToContentMs: null,
      emptySeen: false,
      skeletonSeen: false,
      contentSeen: false,
      reset() {
        this.emptyAtMs = null;
        this.skeletonAtMs = null;
        this.contentAtMs = null;
        this.emptyToContentMs = null;
        this.skeletonToContentMs = null;
        this.emptySeen = false;
        this.skeletonSeen = false;
        this.contentSeen = false;
      },
    };
    w.__echoEmptyToContent = state;
    const now = () =>
      typeof performance !== 'undefined' ? performance.now() : Date.now();

    const isEmptyCopy = (text) =>
      /No messages here yet/i.test(text) ||
      /Say hello to start the conversation/i.test(text);

    const skeletonVisible = () =>
      Boolean(document.querySelector('.message-list-skeleton-overlay'));

    const hasMessageContent = () => {
      const list = document.querySelector('[data-cy=message-list]');
      if (!list) return false;
      if (skeletonVisible()) return false;
      return (
        list.querySelectorAll(
          '[data-message-id], .message-row, [data-cy=message-row]',
        ).length > 0
      );
    };

    const tick = () => {
      const bodyText = document.body?.innerText ?? '';
      if (!state.emptySeen && isEmptyCopy(bodyText)) {
        state.emptySeen = true;
        state.emptyAtMs = now();
      }
      if (!state.skeletonSeen && skeletonVisible()) {
        state.skeletonSeen = true;
        state.skeletonAtMs = now();
      }
      if (!state.contentSeen && hasMessageContent()) {
        state.contentSeen = true;
        state.contentAtMs = now();
        if (state.emptyAtMs != null) {
          state.emptyToContentMs = Math.max(
            0,
            Math.round(state.contentAtMs - state.emptyAtMs),
          );
        }
        if (state.skeletonAtMs != null) {
          state.skeletonToContentMs = Math.max(
            0,
            Math.round(state.contentAtMs - state.skeletonAtMs),
          );
        }
      }
    };

    const obs = new MutationObserver(() => tick());
    const start = () => {
      if (!document.body) {
        requestAnimationFrame(start);
        return;
      }
      obs.observe(document.body, {
        childList: true,
        subtree: true,
        characterData: true,
      });
      tick();
    };
    start();
  });
}

/** @param {import('@playwright/test').Page} page */
async function readProbe(page) {
  return page.evaluate(() => window.__echoEmptyToContent ?? null);
}

/** @param {import('@playwright/test').Page} page */
async function resetProbe(page) {
  await page.evaluate(() => window.__echoEmptyToContent?.reset?.());
}

/** @param {import('@playwright/test').Page} page */
async function waitForProbeContent(page) {
  await page.waitForFunction(
    () => window.__echoEmptyToContent?.contentSeen === true,
    undefined,
    { timeout: 90_000 },
  );
}

/** @param {import('@playwright/test').Page} page */
async function collectHistoryNetwork(page, startedAt) {
  const entries = await page.evaluate((since) => {
    return performance
      .getEntriesByType('resource')
      .filter((e) => {
        const name = e.name || '';
        return (
          e.startTime >= since - 50 &&
          (/\/messages(?:\?|$)/.test(name) ||
            /\/channels\/[^/]+\/messages/.test(name) ||
            /history|messages\?/.test(name))
        );
      })
      .map((e) => ({
        name: e.name.replace(/^https?:\/\/[^/]+/, ''),
        durationMs: Math.round(e.duration),
        startMs: Math.round(e.startTime),
        transferSize: e.transferSize,
      }));
  }, startedAt);
  return entries;
}

async function sampleCold(i) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    storageState: env.authStoragePath,
    viewport: { width: 1280, height: 720 },
    locale: 'en-US',
    baseURL: env.baseUrl,
  });
  const page = await context.newPage();
  await disableCacheForPage(page);
  await installProbe(page);

  const url = channelUrl(env, env.channelA, true);
  const navStartedWall = Date.now();
  const perfOrigin = await page.evaluate(() => performance.now());
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await waitForAppShell(page);
  await waitForProbeContent(page);
  await page.waitForTimeout(30);

  const probe = await readProbe(page);
  const report = await readHarnessReport(page);
  const historyNet = await collectHistoryNetwork(page, perfOrigin);
  const wallMs = Date.now() - navStartedWall;

  await context.close();
  await browser.close();

  return {
    iteration: i + 1,
    mode: 'cold',
    emptySeen: Boolean(probe?.emptySeen),
    skeletonSeen: Boolean(probe?.skeletonSeen),
    emptyToContentMs: probe?.emptyToContentMs ?? null,
    skeletonToContentMs: probe?.skeletonToContentMs ?? null,
    boot_chat_ready: report.milestones?.boot_chat_ready ?? null,
    historyNetworkMs: historyNet.map((h) => h.durationMs),
    historyNetwork: historyNet,
    wallNavToContentMs: wallMs,
  };
}

async function sampleSwitch(i) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    storageState: env.authStoragePath,
    viewport: { width: 1280, height: 720 },
    locale: 'en-US',
    baseURL: env.baseUrl,
  });
  const page = await context.newPage();
  await disableCacheForPage(page);
  await installProbe(page);

  await page.goto(channelUrl(env, env.channelA, true), {
    waitUntil: 'domcontentloaded',
  });
  await waitForAppShell(page);
  await waitForChatReady(page);

  await resetHarness(page);
  await resetProbe(page);
  const switchPerfOrigin = await page.evaluate(() => performance.now());
  const wallStarted = Date.now();

  await page
    .locator(`[data-channel-row-anchor="${env.channelB}"]`)
    .click({ timeout: 30_000 });
  await waitForProbeContent(page);
  await page.waitForTimeout(30);

  const probe = await readProbe(page);
  const report = await readHarnessReport(page);
  const historyNet = await collectHistoryNetwork(page, switchPerfOrigin);
  const wallMs = Date.now() - wallStarted;

  await context.close();
  await browser.close();

  return {
    iteration: i + 1,
    mode: 'switch',
    emptySeen: Boolean(probe?.emptySeen),
    skeletonSeen: Boolean(probe?.skeletonSeen),
    emptyToContentMs: probe?.emptyToContentMs ?? null,
    skeletonToContentMs: probe?.skeletonToContentMs ?? null,
    chat_switch_fetch_start: report.milestones?.chat_switch_fetch_start ?? null,
    chat_switch_fetch_end: report.milestones?.chat_switch_fetch_end ?? null,
    chat_switch_merge_done: report.milestones?.chat_switch_merge_done ?? null,
    chat_switch_first_message_visible:
      report.milestones?.chat_switch_first_message_visible ?? null,
    historyNetworkMs: historyNet.map((h) => h.durationMs),
    historyNetwork: historyNet,
    wallSwitchToContentMs: wallMs,
  };
}

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

const samples = [];
for (let i = 0; i < iterations; i += 1) {
  process.stderr.write(`[${mode}] sample ${i + 1}/${iterations}…\n`);
  samples.push(mode === 'cold' ? await sampleCold(i) : await sampleSwitch(i));
}

const pick = (key) =>
  samples
    .map((s) => s[key])
    .filter((n) => typeof n === 'number' && Number.isFinite(n));

const historyAll = samples.flatMap((s) => s.historyNetworkMs ?? []);

const out = {
  meta: {
    baseUrl: env.baseUrl,
    mode,
    channelA: env.channelA,
    channelB: env.channelB,
    serverId: env.serverId,
    iterations,
    recordedAt: new Date().toISOString(),
  },
  samples,
  summary: {
    emptyFlashRate: `${samples.filter((s) => s.emptySeen).length}/${samples.length}`,
    skeletonFlashRate: `${samples.filter((s) => s.skeletonSeen).length}/${samples.length}`,
    emptyToContentMs: pick('emptyToContentMs').length
      ? summarize(pick('emptyToContentMs'))
      : null,
    skeletonToContentMs: pick('skeletonToContentMs').length
      ? summarize(pick('skeletonToContentMs'))
      : null,
    chat_switch_fetch_end_ms: pick('chat_switch_fetch_end').length
      ? summarize(pick('chat_switch_fetch_end'))
      : null,
    chat_switch_first_message_visible_ms: pick(
      'chat_switch_first_message_visible',
    ).length
      ? summarize(pick('chat_switch_first_message_visible'))
      : null,
    boot_chat_ready_ms: pick('boot_chat_ready').length
      ? summarize(pick('boot_chat_ready'))
      : null,
    wallToContentMs:
      (pick('wallSwitchToContentMs').length
        ? summarize(pick('wallSwitchToContentMs'))
        : null) ??
      (pick('wallNavToContentMs').length
        ? summarize(pick('wallNavToContentMs'))
        : null),
    historyApiDurationMs: historyAll.length ? summarize(historyAll) : null,
  },
};

console.log(JSON.stringify(out, null, 2));
