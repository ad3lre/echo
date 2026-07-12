/**
 * Ephemeral Postgres-backed API for Playwright message-list layout verification.
 * Writes connection details to the path in LAYOUT_VERIFY_OUT (default /tmp/echo-layout-verify.json).
 *
 * Run: node --import tsx backend/src/tests/helpers/messageListLayoutHarness.ts
 */
import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import { buildEchoTestApp } from './echoTestApp';

const OUT =
  process.env.LAYOUT_VERIFY_OUT?.trim() || '/tmp/echo-layout-verify.json';
const FIXTURE = (process.env.SCROLL_FIXTURE ?? 'geometry').toLowerCase();
const MESSAGE_COUNT = Number(
  process.env.LAYOUT_VERIFY_MESSAGE_COUNT ??
    (FIXTURE === 'scale'
      ? 200
      : FIXTURE === 'history'
        ? 40
        : FIXTURE === 'geometry'
          ? 80
          : 12),
);

function parseCookies(setCookie: string[] | undefined) {
  let sid: string | null = null;
  let csrfCookie: string | null = null;
  for (const chunk of setCookie ?? []) {
    const sidMatch = chunk.match(/echo_sid=([^;]+)/);
    if (sidMatch) sid = sidMatch[1];
    const csrfMatch = chunk.match(/(echo_csrf=[^;]+)/);
    if (csrfMatch) csrfCookie = csrfMatch[1];
  }
  return { sid, csrfCookie };
}

async function main(): Promise<void> {
  let enabled = false;
  try {
    const { getEchoStore } = await import('../../domain/echoStore');
    const store = await getEchoStore();
    enabled = store.enabled;
  } catch {
    enabled = false;
  }
  if (!enabled) {
    console.error(
      'messageListLayoutHarness: Echo store unavailable (need DATABASE_URL)',
    );
    process.exit(2);
  }

  const harnessPort = Number(process.env.PORT ?? 3000);
  const { baseUrl, close } = await buildEchoTestApp({ port: harnessPort });
  const tag = `layout_${Date.now().toString(36)}`;

  try {
    const reg = await fetch(`${baseUrl}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: tag,
        password: 'password123',
        email: `${tag}@echo.test`,
        displayName: 'Layout Verify',
      }),
    });
    const regBody = await reg.text();
    if (reg.status !== 201) {
      throw new Error(`register failed ${reg.status}: ${regBody}`);
    }
    const { csrfToken } = JSON.parse(regBody) as { csrfToken: string };
    const { sid, csrfCookie } = parseCookies(reg.headers.getSetCookie());
    if (!sid || !csrfCookie) throw new Error('missing session cookies');
    const cookie = `echo_sid=${sid}; ${csrfCookie}`;

    const srv = await fetch(`${baseUrl}/api/v1/echo/servers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-csrf-token': csrfToken,
        cookie,
      },
      body: JSON.stringify({ name: `Layout ${tag}` }),
    });
    const srvBody = await srv.text();
    if (srv.status !== 201) {
      throw new Error(`create server failed ${srv.status}: ${srvBody}`);
    }
    const { serverId, defaultChannelId } = JSON.parse(srvBody) as {
      serverId: string;
      defaultChannelId: string;
    };

    const bodies = [
      'Short ping.',
      'A longer line to exercise wrapping in the virtualized message list.',
      'Line one\nLine two\nLine three with explicit newlines.',
      'Another row with enough characters to span multiple visual lines in chat.',
      '👋',
      '🎉 🔥 💯',
      '<:pepe:1486467212268142592>',
      'Check https://example.com/docs/guide for the full write-up.',
      'Watch https://vimeo.com/76979871 for the demo recording.',
      'GIF link https://tenor.com/view/cat-example',
      'Mixed 👋 see https://example.com and react',
    ];
    for (let i = 0; i < MESSAGE_COUNT; i++) {
      const content = `[${i + 1}/${MESSAGE_COUNT}] ${bodies[i % bodies.length]}`;
      const res = await fetch(
        `${baseUrl}/api/v1/echo/channels/${encodeURIComponent(defaultChannelId)}/messages`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-csrf-token': csrfToken,
            cookie,
          },
          body: JSON.stringify({
            channelId: defaultChannelId,
            content,
            id: randomUUID(),
          }),
        },
      );
      if (res.status !== 201) {
        throw new Error(
          `post message ${i + 1} failed ${res.status}: ${await res.text()}`,
        );
      }
      await new Promise((r) => setTimeout(r, 120));
    }

    const payload = {
      backendUrl: baseUrl,
      serverId,
      channelId: defaultChannelId,
      sid,
      csrf: csrfCookie.split('=')[1],
      messageCount: MESSAGE_COUNT,
      fixture: FIXTURE,
    };
    fs.writeFileSync(OUT, JSON.stringify(payload, null, 2));
    console.log(`messageListLayoutHarness: ready ${OUT}`);
    console.log(JSON.stringify(payload));

    await new Promise<void>(() => {
      /* keep process alive for Playwright */
    });
  } catch (err) {
    await close();
    throw err;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
