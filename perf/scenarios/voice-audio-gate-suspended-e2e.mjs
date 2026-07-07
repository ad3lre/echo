/**
 * E2E repro of the Safari one-way-audio bug: client B's mic *level monitor*
 * AudioContext is forced to stay suspended (as Safari/iOS do before a user
 * gesture). Pre-fix, the outbound voice gate read a pinned -100 dBFS from the
 * dead monitor and attenuated/muted B's outgoing mic — A could not hear B while
 * B heard A fine. Post-fix the gate fails open and A must hear B.
 *
 * Only bare `new AudioContext()` (the monitor) is sabotaged; LiveKit's send
 * context uses `{ latencyHint: 'interactive' }` and stays functional, so real
 * audio still flows on the publish path — exactly the Safari failure shape.
 *
 * Usage: node perf/scenarios/voice-audio-gate-suspended-e2e.mjs [baseUrl]
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

/** Keep bare `new AudioContext()` permanently suspended, like Safari pre-gesture. */
const SUSPEND_MONITOR_CTX_INIT = `
(() => {
  const Native = window.AudioContext || window.webkitAudioContext;
  if (!Native) return;
  class SabotagedMonitorContext extends Native {
    constructor(...args) {
      super(...args);
      const bare = args.length === 0 || args[0] == null;
      if (bare) {
        this.__echoSabotaged = true;
        void super.suspend().catch(() => {});
      }
    }
    resume() {
      if (this.__echoSabotaged) {
        return Promise.reject(new DOMException('user gesture required (simulated Safari)', 'NotAllowedError'));
      }
      return super.resume();
    }
  }
  window.AudioContext = SabotagedMonitorContext;
})();
`;

async function loginContext(browser, username, password, initScript) {
  const context = await browser.newContext({
    baseURL: BASE,
    viewport: { width: 1360, height: 800 },
    locale: 'en-US',
    permissions: ['microphone'],
  });
  if (initScript) await context.addInitScript(initScript);
  // Hard gate makes the pre-fix failure absolute (gain 0) instead of -36 dB.
  await context.addInitScript(() => {
    try {
      localStorage.setItem(
        'echo-voice-levels-v1',
        JSON.stringify({
          maxBoostEnabled: false,
          maxBoostLevel: 2,
          outputVolumePercent: 100,
          inputSensitivityPercent: 100,
          voiceActivationThresholdPercent: 24,
          outboundGateMode: 'hard',
        }),
      );
    } catch {}
  });
  // Log in via the loopback backend with a unique spoofed client IP so repeated
  // E2E runs do not exhaust the per-IP login rate limit on the public edge.
  const spoofIp = `203.0.113.${Math.floor(Math.random() * 200) + 10}`;
  const res = await fetch('http://127.0.0.1:3000/api/v1/auth/login', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'cf-connecting-ip': spoofIp,
    },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) {
    throw new Error(
      `login failed for ${username}: ${res.status} ${await res.text()}`,
    );
  }
  const cookies = [];
  for (const [key, value] of res.headers.entries()) {
    if (key.toLowerCase() !== 'set-cookie') continue;
    const [pair] = value.split(';');
    const eq = pair.indexOf('=');
    const name = pair.slice(0, eq).trim();
    const val = pair.slice(eq + 1).trim();
    if (!val) continue;
    cookies.push({
      name,
      value: val,
      url: BASE,
      secure: true,
      sameSite: 'Lax',
    });
  }
  if (!cookies.some((c) => c.name === '__Host-echo_sid')) {
    throw new Error(`no session cookie returned for ${username}`);
  }
  await context.addCookies(cookies);
  return context;
}

async function joinVoice(page, label) {
  page.on('console', (msg) => {
    const t = msg.text();
    if (
      msg.type() === 'error' ||
      (/voice|livekit|vc|audio|gate/i.test(t) &&
        /error|fail|warn|gain/i.test(t))
    ) {
      console.log(`[${label}][console:${msg.type()}]`, t.slice(0, 300));
    }
  });
  page.on('pageerror', (err) => {
    console.log(`[${label}][pageerror]`, String(err).slice(0, 300));
  });
  await page.goto(`${BASE}/channels/${SERVER_ID}/${VOICE_CHANNEL}`, {
    waitUntil: 'domcontentloaded',
  });
  await page
    .locator('[data-cy=app-layout]')
    .waitFor({ state: 'visible', timeout: 60_000 });
  await page.waitForTimeout(2500);
  // Unlock audio with a harmless keyboard gesture (a blind click can open popovers).
  await page.keyboard.press('Escape');

  // Dismiss any modal overlay (announcements, join-preflight, etc.)
  for (let i = 0; i < 5; i++) {
    const overlay = page.locator('div.fixed.inset-0');
    if (
      !(await overlay
        .first()
        .isVisible()
        .catch(() => false))
    )
      break;
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
  }

  const row = page.locator(`[data-channel-row-anchor="${VOICE_CHANNEL}"]`);
  await row.click({ timeout: 30_000 }).catch(async () => {
    await page.screenshot({
      path: `/tmp/e2e-gate-${label.replace(/\W+/g, '_')}.png`,
    });
    throw new Error(`channel row click blocked for ${label}`);
  });

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

  await page
    .waitForFunction(
      () => {
        const labels = Array.from(
          document.querySelectorAll('.vc-voice-status-label--connected'),
        );
        return labels.some((el) =>
          /voice connected/i.test(el.textContent ?? ''),
        );
      },
      undefined,
      { timeout: 60_000 },
    )
    .catch(async (e) => {
      await page.screenshot({
        path: `/tmp/e2e-gate-connect-${label.replace(/\W+/g, '_')}.png`,
      });
      throw e;
    });
  console.log(`[${label}] voice connected`);
}

async function measureRemoteAudio(page, ms) {
  return page.evaluate(async (durationMs) => {
    const els = Array.from(document.querySelectorAll('audio')).filter(
      (el) =>
        el.srcObject instanceof MediaStream &&
        el.srcObject.getAudioTracks().length > 0,
    );
    const Ctx = window.AudioContext || window.webkitAudioContext;
    // Pass an options object so client B's sabotage (bare constructor) does not
    // break the measurement context itself.
    const ctx = new Ctx({ latencyHint: 'interactive' });
    await ctx.resume();
    const probes = els.map((el) => {
      const src = ctx.createMediaStreamSource(el.srcObject);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      src.connect(analyser);
      return { analyser, buf: new Float32Array(analyser.fftSize), peakRms: 0 };
    });
    const t0 = performance.now();
    while (performance.now() - t0 < durationMs) {
      for (const p of probes) {
        p.analyser.getFloatTimeDomainData(p.buf);
        let s = 0;
        for (let i = 0; i < p.buf.length; i++) s += p.buf[i] * p.buf[i];
        p.peakRms = Math.max(p.peakRms, Math.sqrt(s / p.buf.length));
      }
      await new Promise((r) => setTimeout(r, 50));
    }
    const out = probes.map((p) => ({ peakRms: Number(p.peakRms.toFixed(5)) }));
    ctx.close();
    return { audioElementCount: els.length, probes: out };
  }, ms);
}

async function main() {
  const browserA = await chromium.launch({ headless: true, args: launchArgs });
  const browserB = await chromium.launch({ headless: true, args: launchArgs });

  const ctxA = await loginContext(browserA, USER_A, PASS_A, null);
  const ctxB = await loginContext(
    browserB,
    USER_B,
    PASS_B,
    SUSPEND_MONITOR_CTX_INIT,
  );
  const pageA = await ctxA.newPage();
  const pageB = await ctxB.newPage();

  await joinVoice(pageA, 'A');
  await joinVoice(pageB, 'B (suspended monitor ctx)');

  // Sanity: confirm B's sabotage is active (bare AudioContext stays suspended,
  // resume() rejects) so a pass is not vacuous.
  const sabotage = await pageB.evaluate(async () => {
    const ctx = new AudioContext();
    let resumeRejected = false;
    try {
      await ctx.resume();
    } catch {
      resumeRejected = true;
    }
    const state = ctx.state;
    try {
      await ctx.close();
    } catch {}
    return { state, resumeRejected };
  });
  console.log(
    '[B] sabotage check (must be suspended/resume-rejected):',
    JSON.stringify(sabotage),
  );
  if (sabotage.state === 'running' || !sabotage.resumeRejected) {
    throw new Error('sabotage not active — test would be vacuous');
  }

  await pageA.waitForTimeout(6000);

  const [resA, resB] = await Promise.all([
    measureRemoteAudio(pageA, 5000),
    measureRemoteAudio(pageB, 5000),
  ]);

  console.log("=== A (must hear B despite B's dead level monitor) ===");
  console.log(JSON.stringify(resA, null, 2));
  console.log('=== B (should hear A as before) ===');
  console.log(JSON.stringify(resB, null, 2));

  const hears = (r) => r.probes.some((p) => p.peakRms > 0.01);
  const aHears = hears(resA);
  const bHears = hears(resB);
  console.log(`RESULT: A hears B: ${aHears} | B hears A: ${bHears}`);

  await browserA.close();
  await browserB.close();
  process.exit(aHears && bHears ? 0 : 1);
}

main().catch(async (e) => {
  console.error('E2E failed:', e);
  process.exit(2);
});
