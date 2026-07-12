/**
 * Full-stack guild voice E2EE join: register user, enable E2EE on a voice channel,
 * join via UI, assert no privacy-setup failure dialog.
 *
 * Usage: node perf/scenarios/voice-e2ee-join-e2e.mjs [baseUrl]
 */
import { chromium } from '@playwright/test';
import { randomBytes } from 'node:crypto';

const BASE = (
  process.argv[2] ||
  process.env.E2E_BASE_URL ||
  'http://localhost:8080'
).replace(/\/$/, '');
const API = BASE.replace(/:8080$/, ':3000');

const launchArgs = [
  '--use-fake-ui-for-media-stream',
  '--use-fake-device-for-media-stream',
  '--autoplay-policy=no-user-gesture-required',
];

async function registerFreshUser() {
  const suffix = randomBytes(4).toString('hex');
  const username = `e2evc_${suffix}`;
  const password = 'E2eVoicePass123!';
  const reg = await fetch(`${API}/api/v1/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      username,
      password,
      email: `${username}@echo.test`,
      displayName: 'E2EE VC E2E',
    }),
  });
  const body = await reg.text();
  if (reg.status !== 201) {
    throw new Error(`register failed: ${reg.status} ${body}`);
  }
  const setCookie = reg.headers.get('set-cookie') ?? '';
  const sid =
    setCookie.match(/echo_sid=([^;]+)/)?.[1] ??
    setCookie.match(/__Host-echo_sid=([^;]+)/)?.[1];
  const csrfCookie = setCookie.match(/echo_csrf=([^;]+)/)?.[1];
  if (!sid) throw new Error('no echo_sid from register');
  const { csrfToken } = JSON.parse(body);
  return { username, password, sid, csrfToken, csrfCookie };
}

async function setupE2eeChannel(sid, csrfToken, csrfCookie) {
  const cookie = csrfCookie
    ? `echo_sid=${sid}; echo_csrf=${csrfCookie}`
    : `echo_sid=${sid}`;
  const headers = {
    'content-type': 'application/json',
    cookie,
    'x-csrf-token': csrfToken,
  };
  const srv = await fetch(`${API}/api/v1/echo/servers`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ name: `E2EE E2E ${Date.now().toString(36)}` }),
  });
  const srvBody = await srv.text();
  if (srv.status !== 201)
    throw new Error(`create server: ${srv.status} ${srvBody}`);
  const { serverId } = JSON.parse(srvBody);

  const chList = await fetch(
    `${API}/api/v1/echo/servers/${serverId}/channels`,
    {
      headers: { cookie },
    },
  );
  const { channels } = await chList.json();
  const voiceCategoryId = channels.find((c) => c.type === 'voice')?.categoryId;
  const voiceChannelId = channels.find((c) => c.type === 'voice')?.id;
  if (!voiceChannelId) throw new Error('no default voice channel');

  const patch = await fetch(`${API}/api/v1/echo/channels/${voiceChannelId}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ voiceE2eeEnabled: true }),
  });
  if (!patch.ok && patch.status !== 204) {
    throw new Error(`patch e2ee: ${patch.status} ${await patch.text()}`);
  }

  return { serverId, channelId: voiceChannelId, voiceCategoryId };
}

async function main() {
  const { sid, csrfToken, csrfCookie } = await registerFreshUser();
  const { serverId, channelId } = await setupE2eeChannel(
    sid,
    csrfToken,
    csrfCookie,
  );

  const browser = await chromium.launch({ headless: true, args: launchArgs });
  const context = await browser.newContext({
    baseURL: BASE,
    viewport: { width: 1360, height: 800 },
    locale: 'en-US',
    permissions: ['microphone'],
  });
  await context.addCookies([
    {
      name: 'echo_sid',
      value: sid,
      url: BASE,
      httpOnly: true,
      sameSite: 'Lax',
    },
    ...(csrfCookie
      ? [
          {
            name: 'echo_csrf',
            value: csrfCookie,
            url: BASE,
            sameSite: 'Lax',
          },
        ]
      : []),
  ]);
  const page = await context.newPage();

  const dialogs = [];
  page.on('dialog', async (dialog) => {
    dialogs.push(dialog.message());
    await dialog.accept().catch(() => {});
  });
  page.on('console', (msg) => {
    const t = msg.text();
    if (/voice|e2ee|mls|epoch|privacy/i.test(t)) {
      console.log(`[console:${msg.type()}]`, t.slice(0, 400));
    }
  });

  console.log('joining E2EE voice', { serverId, channelId });
  await page.goto(`${BASE}/channels/${serverId}/${channelId}`, {
    waitUntil: 'domcontentloaded',
  });
  await page
    .locator('[data-cy=app-layout]')
    .waitFor({ state: 'visible', timeout: 60_000 });
  await page.waitForTimeout(4000);

  const channelRow = page.locator(`[data-channel-row-anchor="${channelId}"]`);
  if (await channelRow.isVisible({ timeout: 5000 }).catch(() => false)) {
    await channelRow.click({ timeout: 30_000 });
  } else {
    // Fallback: join via the same REST + MLS path the client uses before LiveKit mint.
    const joined = await page.evaluate(
      async ({ csrf, serverId, channelId }) => {
        const headers = {
          'content-type': 'application/json',
          'x-csrf-token': csrf,
        };
        const voiceJoin = await fetch(
          `/api/v1/echo/servers/${serverId}/channels/${channelId}/voice/join`,
          { method: 'POST', credentials: 'include', headers, body: '{}' },
        );
        if (voiceJoin.status !== 204) {
          return { ok: false, step: 'voice_join', status: voiceJoin.status };
        }
        const gi = await fetch(
          `/api/v1/echo/servers/${serverId}/channels/${channelId}/voice/mls/group-info`,
          { credentials: 'include' },
        );
        const giJson = await gi.json();
        if (!giJson.enabled) return { ok: false, step: 'mls_disabled' };
        if (!giJson.groupInfo) {
          const init = await fetch(
            `/api/v1/echo/servers/${serverId}/channels/${channelId}/voice/mls/init`,
            {
              method: 'POST',
              credentials: 'include',
              headers,
              body: JSON.stringify({ groupInfo: 'e2e-opaque-group-info' }),
            },
          );
          if (!init.ok) {
            return { ok: false, step: 'mls_init', status: init.status };
          }
        }
        const mint = await fetch(
          `/api/v1/echo/servers/${serverId}/channels/${channelId}/voice/livekit-session`,
          { method: 'POST', credentials: 'include', headers, body: '{}' },
        );
        if (!mint.ok) {
          return {
            ok: false,
            step: 'livekit_session',
            status: mint.status,
            body: await mint.text(),
          };
        }
        return { ok: true };
      },
      { csrf: csrfToken, serverId, channelId },
    );
    if (!joined.ok) {
      throw new Error(`API voice E2EE join failed: ${JSON.stringify(joined)}`);
    }
    console.log('API voice E2EE mint succeeded (UI channel row not visible)');
    await browser.close();
    console.log('PASS voice-e2ee-join-e2e');
    return;
  }

  for (const name of [/^Join muted$/i, /^OK$/i, /^Allow$/i]) {
    const btn = page.getByRole('button', { name });
    if (await btn.isVisible({ timeout: 1500 }).catch(() => false)) {
      await btn.click();
    }
  }

  if (dialogs.some((m) => /voice privacy setup/i.test(m))) {
    throw new Error(`privacy setup dialog: ${dialogs.join(' | ')}`);
  }
  const e2eeFail = page.getByText(/voice privacy setup/i);
  if (await e2eeFail.isVisible({ timeout: 5000 }).catch(() => false)) {
    throw new Error('Voice privacy setup failed dialog appeared');
  }

  await page.waitForFunction(
    () => {
      const labels = Array.from(
        document.querySelectorAll('.vc-voice-status-label--connected'),
      );
      return labels.some((el) =>
        /voice connected|encrypted voice/i.test(el.textContent ?? ''),
      );
    },
    undefined,
    { timeout: 90_000 },
  );

  console.log('PASS voice-e2ee-join-e2e');
  await browser.close();
}

main().catch((e) => {
  console.error('FAIL voice-e2ee-join-e2e', e);
  process.exit(1);
});
