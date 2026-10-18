#!/usr/bin/env bun
/**
 * Measure the empty-shell flash on a full page refresh (what users actually see).
 *
 * Prior measure-empty-to-content / switch-gap scripts mostly hit warm channel
 * switches where history sets `initialLoading=true` → skeleton path, so they
 * reported 0/5 "No messages here yet" flashes. That does NOT match cold refresh
 * into an unresolved guild/DM shell, where empty copy + "No channels to show"
 * can sit on screen long enough to read.
 *
 * This probe hard-navigates (cache disabled) and times:
 *   - empty message copy visible → gone
 *   - channel-panel empty copy visible → gone
 *   - first real message row
 *   - first channel row
 *
 * Usage:
 *   bun server/ops/perf/measure-empty-shell-refresh.mjs
 *   PERF_EMPTY_ITERS=5 bun server/ops/perf/measure-empty-shell-refresh.mjs
 */
import { chromium } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { channelUrl, getPerfEnv } from './lib/env.mjs';
import { disableCacheForPage, waitForAppShell } from './lib/harness.mjs';

const perfDir = path.dirname(fileURLToPath(import.meta.url));
const env = getPerfEnv(perfDir);
const iterations = Math.max(
  1,
  Number.parseInt(process.env.PERF_EMPTY_ITERS ?? '5', 10) || 5,
);

/** @param {import('@playwright/test').Page} page */
async function installProbe(page) {
  await page.addInitScript(() => {
    /** @type {any} */
    const state = {
      navAt: null,
      bootGateGoneAt: null,
      emptyMsgAt: null,
      emptyMsgGoneAt: null,
      emptyChannelsAt: null,
      emptyChannelsGoneAt: null,
      firstChannelAt: null,
      firstMessageAt: null,
      emptyMsgSeen: false,
      emptyChannelsSeen: false,
      reset(navAt) {
        this.navAt = navAt;
        this.bootGateGoneAt = null;
        this.emptyMsgAt = null;
        this.emptyMsgGoneAt = null;
        this.emptyChannelsAt = null;
        this.emptyChannelsGoneAt = null;
        this.firstChannelAt = null;
        this.firstMessageAt = null;
        this.emptyMsgSeen = false;
        this.emptyChannelsSeen = false;
      },
    };
    window.__echoEmptyShell = state;
    const now = () => performance.now();

    const emptyMsgVisible = () =>
      /No messages here yet/i.test(document.body?.innerText ?? '');
    const emptyChannelsVisible = () =>
      /No channels to show/i.test(document.body?.innerText ?? '');
    const bootGateVisible = () =>
      Boolean(document.querySelector('.echo-boot-gate'));
    const hasChannelRow = () =>
      Boolean(
        document.querySelector(
          '[data-channel-row-anchor], [data-cy=channel-row], .channel-row',
        ),
      );
    const hasMessageRow = () => {
      if (document.querySelector('.message-list-skeleton-overlay'))
        return false;
      const list = document.querySelector('[data-cy=message-list]');
      if (!list) return false;
      return (
        list.querySelectorAll(
          '[data-message-id], .message-row, [data-cy=message-row]',
        ).length > 0
      );
    };

    const tick = () => {
      if (state.navAt == null) return;
      if (state.bootGateGoneAt == null && !bootGateVisible()) {
        state.bootGateGoneAt = now();
      }
      if (!state.emptyMsgSeen && emptyMsgVisible()) {
        state.emptyMsgSeen = true;
        state.emptyMsgAt = now();
      }
      if (
        state.emptyMsgSeen &&
        state.emptyMsgGoneAt == null &&
        !emptyMsgVisible()
      ) {
        state.emptyMsgGoneAt = now();
      }
      if (!state.emptyChannelsSeen && emptyChannelsVisible()) {
        state.emptyChannelsSeen = true;
        state.emptyChannelsAt = now();
      }
      if (
        state.emptyChannelsSeen &&
        state.emptyChannelsGoneAt == null &&
        !emptyChannelsVisible()
      ) {
        state.emptyChannelsGoneAt = now();
      }
      if (state.firstChannelAt == null && hasChannelRow()) {
        state.firstChannelAt = now();
      }
      if (state.firstMessageAt == null && hasMessageRow()) {
        state.firstMessageAt = now();
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
      setInterval(tick, 50);
    };
    start();
  });
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

async function oneSample(i) {
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

  // PERF_LANDING=channel (default) deep-links into channel A.
  // PERF_LANDING=base opens the app root (closer to "refresh wherever I was").
  const landing = (process.env.PERF_LANDING ?? 'channel').trim().toLowerCase();
  const url =
    landing === 'base'
      ? `${env.baseUrl}/?perfHarness=1`
      : channelUrl(env, env.channelA, true);
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    window.__echoEmptyShell?.reset(performance.now());
  });
  await waitForAppShell(page);

  await page.waitForFunction(
    () => {
      const s = window.__echoEmptyShell;
      return Boolean(s?.firstMessageAt && s?.firstChannelAt);
    },
    undefined,
    { timeout: 120_000 },
  );
  await page.waitForTimeout(100);

  const probe = await page.evaluate(() => {
    const s = window.__echoEmptyShell;
    const d = (a, b) =>
      a != null && b != null ? Math.max(0, Math.round(b - a)) : null;
    return {
      emptyMsgSeen: s.emptyMsgSeen,
      emptyChannelsSeen: s.emptyChannelsSeen,
      emptyMsgVisibleMs: d(s.emptyMsgAt, s.emptyMsgGoneAt ?? s.firstMessageAt),
      emptyChannelsVisibleMs: d(
        s.emptyChannelsAt,
        s.emptyChannelsGoneAt ?? s.firstChannelAt,
      ),
      navToEmptyMsgMs: d(s.navAt, s.emptyMsgAt),
      navToFirstMessageMs: d(s.navAt, s.firstMessageAt),
      navToFirstChannelMs: d(s.navAt, s.firstChannelAt),
      bootGateToFirstMessageMs: d(s.bootGateGoneAt, s.firstMessageAt),
    };
  });

  await context.close();
  await browser.close();
  return { iteration: i + 1, ...probe };
}

const samples = [];
for (let i = 0; i < iterations; i += 1) {
  process.stderr.write(`empty-shell sample ${i + 1}/${iterations}…\n`);
  samples.push(await oneSample(i));
}

const pick = (k) =>
  samples
    .map((s) => s[k])
    .filter((n) => typeof n === 'number' && Number.isFinite(n));

const out = {
  meta: {
    baseUrl: env.baseUrl,
    channelA: env.channelA,
    iterations,
    recordedAt: new Date().toISOString(),
    note: 'Cold refresh empty-shell probe. emptyMsgVisibleMs is how long "No messages here yet" stayed on screen.',
  },
  samples,
  summary: {
    emptyMsgFlashRate: `${samples.filter((s) => s.emptyMsgSeen).length}/${samples.length}`,
    emptyChannelsFlashRate: `${samples.filter((s) => s.emptyChannelsSeen).length}/${samples.length}`,
    emptyMsgVisibleMs: pick('emptyMsgVisibleMs').length
      ? summarize(pick('emptyMsgVisibleMs'))
      : null,
    emptyChannelsVisibleMs: pick('emptyChannelsVisibleMs').length
      ? summarize(pick('emptyChannelsVisibleMs'))
      : null,
    navToFirstMessageMs: pick('navToFirstMessageMs').length
      ? summarize(pick('navToFirstMessageMs'))
      : null,
    bootGateToFirstMessageMs: pick('bootGateToFirstMessageMs').length
      ? summarize(pick('bootGateToFirstMessageMs'))
      : null,
  },
};

console.log(JSON.stringify(out, null, 2));
