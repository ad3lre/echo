/**
 * E2E voice audio check: two Chromium clients join the same guild voice channel
 * with fake mic devices (tone generators) and each side measures:
 *  1. remote MediaStream RMS (network receive path)
 *  2. attached <audio> element playback state
 * Usage: node server/ops/perf/scenarios/voice-audio-e2e.mjs [baseUrl]
 * Env: E2E_USER_A/E2E_PASS_A, E2E_USER_B/E2E_PASS_B, E2E_SERVER_ID, E2E_VOICE_CHANNEL
 */
import { chromium } from '@playwright/test';

const BASE = (
  process.argv[2] ||
  process.env.E2E_BASE_URL ||
  'https://chat-echo.com'
).replace(/\/$/, '');
const USER_A = process.env.E2E_USER_A || 'devseed';
const PASS_A = process.env.E2E_PASS_A || 'devseed123';
const USER_B = process.env.E2E_USER_B || 'e2evoicetest';
const PASS_B = process.env.E2E_PASS_B || 'E2eVoicePass123';
const SERVER_ID = process.env.E2E_SERVER_ID || '1499816749103710208';
const VOICE_CHANNEL = process.env.E2E_VOICE_CHANNEL || '1499816761208471552';

const launchArgs = [
  '--use-fake-ui-for-media-stream',
  '--use-fake-device-for-media-stream',
  '--autoplay-policy=no-user-gesture-required',
];

async function loginContext(browser, username, password) {
  const context = await browser.newContext({
    baseURL: BASE,
    viewport: { width: 1360, height: 800 },
    locale: 'en-US',
    permissions: ['microphone'],
  });
  const res = await context.request.post(`${BASE}/api/v1/auth/login`, {
    data: { username, password },
  });
  if (!res.ok()) {
    throw new Error(
      `login failed for ${username}: ${res.status()} ${await res.text()}`,
    );
  }
  return context;
}

async function joinVoice(page, label) {
  page.on('console', (msg) => {
    const t = msg.text();
    if (/voice|livekit|vc|audio/i.test(t) && /error|fail|warn/i.test(t)) {
      console.log(`[${label}][console]`, t.slice(0, 300));
    }
  });
  await page.goto(`${BASE}/channels/${SERVER_ID}/${VOICE_CHANNEL}`, {
    waitUntil: 'domcontentloaded',
  });
  await page
    .locator('[data-cy=app-layout]')
    .waitFor({ state: 'visible', timeout: 60_000 });
  await page.waitForTimeout(2500);
  // gesture to unlock audio playback
  await page.mouse.click(680, 400);

  const row = page.locator(`[data-channel-row-anchor="${VOICE_CHANNEL}"]`);
  await row.click({ timeout: 30_000 });

  // Dismiss preflight dialogs if any
  for (const name of [/^Retry$/i, /^Join muted$/i, /^OK$/i]) {
    const btn = page.getByRole('button', { name });
    if (await btn.isVisible({ timeout: 1500 }).catch(() => false)) {
      if (
        String(name) === String(/^Join muted$/i) ||
        String(name) === String(/^OK$/i)
      ) {
        await btn.click();
      }
    }
  }

  await page.waitForFunction(
    () => {
      const labels = Array.from(
        document.querySelectorAll('.vc-voice-status-label--connected'),
      );
      return labels.some((el) => /voice connected/i.test(el.textContent ?? ''));
    },
    undefined,
    { timeout: 60_000 },
  );
  console.log(`[${label}] voice connected`);
}

/** Measure remote audio streams for `ms` milliseconds; returns per-element stats. */
async function measureRemoteAudio(page, ms) {
  return page.evaluate(async (durationMs) => {
    const els = Array.from(document.querySelectorAll('audio')).filter(
      (el) =>
        el.srcObject instanceof MediaStream &&
        el.srcObject.getAudioTracks().length > 0,
    );
    const Ctx = window.AudioContext || window.webkitAudioContext;
    const ctx = new Ctx();
    await ctx.resume();
    const probes = els.map((el) => {
      const stream = el.srcObject;
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      src.connect(analyser);
      return {
        el,
        analyser,
        buf: new Float32Array(analyser.fftSize),
        peakRms: 0,
        sumRms: 0,
        n: 0,
      };
    });
    const t0 = performance.now();
    while (performance.now() - t0 < durationMs) {
      for (const p of probes) {
        p.analyser.getFloatTimeDomainData(p.buf);
        let s = 0;
        for (let i = 0; i < p.buf.length; i++) s += p.buf[i] * p.buf[i];
        const rms = Math.sqrt(s / p.buf.length);
        p.peakRms = Math.max(p.peakRms, rms);
        p.sumRms += rms;
        p.n++;
      }
      await new Promise((r) => setTimeout(r, 50));
    }
    const out = probes.map((p) => ({
      trackCount: p.el.srcObject.getAudioTracks().length,
      trackStates: p.el.srcObject.getAudioTracks().map((t) => ({
        readyState: t.readyState,
        muted: t.muted,
        enabled: t.enabled,
      })),
      paused: p.el.paused,
      elVolume: p.el.volume,
      elMuted: p.el.muted,
      peakRms: Number(p.peakRms.toFixed(5)),
      avgRms: Number((p.sumRms / Math.max(1, p.n)).toFixed(5)),
    }));
    ctx.close();
    return { audioElementCount: els.length, probes: out };
  }, ms);
}

async function main() {
  const browserA = await chromium.launch({ headless: true, args: launchArgs });
  const browserB = await chromium.launch({ headless: true, args: launchArgs });

  const ctxA = await loginContext(browserA, USER_A, PASS_A);
  const ctxB = await loginContext(browserB, USER_B, PASS_B);
  const pageA = await ctxA.newPage();
  const pageB = await ctxB.newPage();

  await joinVoice(pageA, 'A');
  await joinVoice(pageB, 'B');

  // Let media flow / mic processors attach
  await pageA.waitForTimeout(6000);

  const [resA, resB] = await Promise.all([
    measureRemoteAudio(pageA, 5000),
    measureRemoteAudio(pageB, 5000),
  ]);

  console.log('=== A (should hear B) ===');
  console.log(JSON.stringify(resA, null, 2));
  console.log('=== B (should hear A) ===');
  console.log(JSON.stringify(resB, null, 2));

  const hears = (r) => r.probes.some((p) => p.peakRms > 0.01);
  const aHears = hears(resA);
  const bHears = hears(resB);
  console.log(`RESULT: A hears B: ${aHears} | B hears A: ${bHears}`);

  await browserA.close();
  await browserB.close();
  process.exit(aHears && bHears ? 0 : 1);
}

main().catch((e) => {
  console.error('E2E failed:', e);
  process.exit(2);
});
