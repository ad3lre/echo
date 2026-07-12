/**
 * Ephemeral API for Playwright image-slot fill verification.
 * Writes connection details to IMAGE_SLOT_VERIFY_OUT (default /tmp/echo-image-slot-verify.json).
 */
import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import { buildEchoTestApp } from './echoTestApp';

const OUT =
  process.env.IMAGE_SLOT_VERIFY_OUT?.trim() ||
  '/tmp/echo-image-slot-verify.json';

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
      'imageSlotFillHarness: Echo store unavailable (need DATABASE_URL)',
    );
    process.exit(2);
  }

  const harnessPort = Number(process.env.PORT ?? 3002);
  const { baseUrl, close } = await buildEchoTestApp({ port: harnessPort });
  const tag = `slot_${Date.now().toString(36)}`;

  try {
    const reg = await fetch(`${baseUrl}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: tag,
        password: 'password123',
        email: `${tag}@echo.test`,
        displayName: 'Slot Verify',
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
      body: JSON.stringify({ name: `Slot ${tag}` }),
    });
    const srvBody = await srv.text();
    if (srv.status !== 201) {
      throw new Error(`create server failed ${srv.status}: ${srvBody}`);
    }
    const { serverId, defaultChannelId: channelId } = JSON.parse(srvBody) as {
      serverId: string;
      defaultChannelId: string;
    };

    const slotId = randomUUID();
    const contentJson = {
      type: 'doc',
      content: [
        {
          type: 'imageSlot',
          attrs: {
            slotId,
            aspectW: 16,
            aspectH: 9,
            imageUrl: null,
            storageKey: null,
            width: null,
            height: null,
          },
        },
      ],
    };
    const post = await fetch(
      `${baseUrl}/api/v1/echo/channels/${encodeURIComponent(channelId)}/messages`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': csrfToken,
          cookie,
        },
        body: JSON.stringify({
          content: `![image: ratio=16:9, slotId=${slotId}]`,
          contentJson,
          contentSchemaVersion: 2,
          messageFormatVersion: 2,
        }),
      },
    );
    const postBody = await post.text();
    if (post.status !== 201) {
      throw new Error(`post message failed ${post.status}: ${postBody}`);
    }
    const { message } = JSON.parse(postBody) as { message: { id: string } };

    const payload = {
      backendUrl: baseUrl,
      serverId,
      channelId,
      serverName: `Slot ${tag}`,
      messageId: message.id,
      slotId,
      sid,
      csrf: csrfCookie.split('=')[1],
    };
    fs.writeFileSync(OUT, JSON.stringify(payload, null, 2));
    console.log(`imageSlotFillHarness: ready ${OUT}`);
    console.log(JSON.stringify(payload));

    await new Promise<void>(() => {
      /* keep alive for Playwright */
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
