/**
 * E2E DM call audio check: user A calls user B in a DM thread;
 * B accepts; both sides measure remote audio RMS from attached <audio> elements.
 * DM voice E2EE follows the `ECHO_DM_VOICE_E2EE_ENABLED` / `VITE_DM_VOICE_E2EE`
 * flags (off by default).
 * Usage: node perf/scenarios/dm-call-audio-e2e.mjs [baseUrl]
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
const DM_CHANNEL = process.env.E2E_DM_CHANNEL || '1523381048807915520';

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

function wireConsole(page, label) {
  page.on('console', (msg) => {
    const t = msg.text();
    if (/voice|livekit|e2ee|call|epoch|envelope/i.test(t)) {
      console.log(`[${label}][console:${msg.type()}]`, t.slice(0, 500));
    }
  });
  page.on('pageerror', (e) =>
    console.log(`[${label}][pageerror]`, String(e).slice(0, 400)),
  );
  page.on('requestfailed', (r) => {
    if (/voice|livekit|e2ee|dm_call/i.test(r.url())) {
      console.log(`[${label}][reqfail]`, r.url(), r.failure()?.errorText);
    }
  });
  page.on('response', (r) => {
    if (
      /voice|livekit-session|e2ee|epoch|envelope/i.test(r.url()) &&
      r.status() >= 400
    ) {
      console.log(`[${label}][http ${r.status()}]`, r.url());
      r.text()
        .then((t) => console.log(`[${label}][body]`, t.slice(0, 300)))
        .catch(() => {});
    }
  });
}

async function openDm(page, label) {
  await page.goto(`${BASE}/channels/@me/c/${DM_CHANNEL}`, {
    waitUntil: 'domcontentloaded',
  });
  await page
    .locator('[data-cy=app-layout]')
    .waitFor({ state: 'visible', timeout: 60_000 });
  await page.waitForTimeout(2500);
  await page.keyboard.press('Escape'); // unlock audio without popover side effects
  console.log(`[${label}] DM thread open`);
}

async function waitVcConnected(page, label) {
  // DM call UI does not render the guild "Voice connected" strip; treat an
  // attached remote MediaStream <audio> element as the connected signal.
  await page.waitForFunction(
    () =>
      Array.from(document.querySelectorAll('audio')).some(
        (el) =>
          el.srcObject instanceof MediaStream &&
          el.srcObject.getAudioTracks().length > 0,
      ),
    undefined,
    { timeout: 60_000 },
  );
  console.log(`[${label}] voice connected (remote audio element attached)`);
}

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
      const src = ctx.createMediaStreamSource(el.srcObject);
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
      trackStates: p.el.srcObject.getAudioTracks().map((t) => ({
        readyState: t.readyState,
        muted: t.muted,
        enabled: t.enabled,
      })),
      paused: p.el.paused,
      elVolume: p.el.volume,
      peakRms: Number(p.peakRms.toFixed(5)),
      avgRms: Number((p.sumRms / Math.max(1, p.n)).toFixed(5)),
    }));
    ctx.close();
    return { audioElementCount: els.length, probes: out };
  }, ms);
}

async function clickButtonByLabel(page, patterns, label, what) {
  for (const pattern of patterns) {
    const btn = page.getByRole('button', { name: pattern }).first();
    if (await btn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await btn.click();
      console.log(`[${label}] clicked ${what} (${pattern})`);
      return true;
    }
  }
  return false;
}

async function main() {
  const browserA = await chromium.launch({ headless: true, args: launchArgs });
  const browserB = await chromium.launch({ headless: true, args: launchArgs });
  const ctxA = await loginContext(browserA, USER_A, PASS_A);
  const ctxB = await loginContext(browserB, USER_B, PASS_B);
  const pageA = await ctxA.newPage();
  const pageB = await ctxB.newPage();
  wireConsole(pageA, 'A');
  wireConsole(pageB, 'B');

  await openDm(pageA, 'A');
  await openDm(pageB, 'B');

  const started = await clickButtonByLabel(
    pageA,
    [/^Start call$/i, /start call/i],
    'A',
    'Start call',
  );
  if (!started) {
    // dump candidate buttons for debugging
    const btns = await pageA.evaluate(() =>
      Array.from(document.querySelectorAll('button'))
        .map(
          (b) =>
            b.getAttribute('aria-label') ||
            b.title ||
            b.textContent?.trim() ||
            '',
        )
        .filter(Boolean)
        .slice(0, 80),
    );
    console.log('[A] no Start call button. buttons:', JSON.stringify(btns));
    throw new Error('Start call button not found');
  }

  // dismiss preflight on A if shown
  await clickButtonByLabel(
    pageA,
    [/^Join muted$/i],
    'A',
    'Join muted (preflight)',
  );

  // B: accept incoming call
  const accepted = await (async () => {
    for (let i = 0; i < 30; i++) {
      if (
        await clickButtonByLabel(
          pageB,
          [
            /^Answer call$/i,
            /^Accept$/i,
            /accept call/i,
            /^Join call$/i,
            /join call/i,
          ],
          'B',
          'Accept call',
        )
      ) {
        return true;
      }
      await pageB.waitForTimeout(1000);
    }
    return false;
  })();
  if (!accepted) {
    const btns = await pageB.evaluate(() =>
      Array.from(document.querySelectorAll('button'))
        .map(
          (b) =>
            b.getAttribute('aria-label') ||
            b.title ||
            b.textContent?.trim() ||
            '',
        )
        .filter(Boolean)
        .slice(0, 80),
    );
    console.log('[B] no Accept button. buttons:', JSON.stringify(btns));
    throw new Error('Accept call button not found');
  }
  await clickButtonByLabel(
    pageB,
    [/^Join muted$/i],
    'B',
    'Join muted (preflight)',
  );

  await waitVcConnected(pageA, 'A');
  await waitVcConnected(pageB, 'B');

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
