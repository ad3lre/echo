/**
 * End-to-end verification: post empty image slot → upload → fill → assert persisted + UI.
 *
 *   BACKEND_URL=http://127.0.0.1:3000 FRONTEND_URL=http://127.0.0.1:8084 \
 *     node frontend/scripts/verify-image-slot-fill.mjs
 */
import { chromium } from 'playwright';
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const BACKEND_URL = process.env.BACKEND_URL ?? 'http://127.0.0.1:3000';
const FRONTEND_URL = process.env.FRONTEND_URL ?? 'http://127.0.0.1:4173';
const RUN_UI = process.env.IMAGE_SLOT_VERIFY_UI !== '0';
const HARNESS_ENV_PATH = process.env.IMAGE_SLOT_VERIFY_ENV?.trim() ?? '';

function loadHarnessEnv() {
  if (!HARNESS_ENV_PATH) return null;
  const raw = fs.readFileSync(HARNESS_ENV_PATH, 'utf8');
  return JSON.parse(raw);
}

/** 1×1 PNG */
const PNG_BYTES = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

function parseCookies(setCookie) {
  if (!setCookie) return { sid: null, csrfCookie: null };
  const parts = Array.isArray(setCookie) ? setCookie : [setCookie];
  let sid = null;
  let csrfCookie = null;
  for (const chunk of parts) {
    const sidMatch = chunk.match(/echo_sid=([^;]+)/);
    if (sidMatch) sid = sidMatch[1];
    const csrfMatch = chunk.match(/(echo_csrf=[^;]+)/);
    if (csrfMatch) csrfCookie = csrfMatch[1];
  }
  return { sid, csrfCookie };
}

async function apiJson(method, urlPath, { cookie, csrf, body } = {}) {
  const headers = { ...(body ? { 'Content-Type': 'application/json' } : {}) };
  if (cookie) headers.cookie = cookie;
  if (csrf && method !== 'GET') headers['x-csrf-token'] = csrf;
  const res = await fetch(`${BACKEND_URL}${urlPath}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  if (text.trim()) {
    try {
      json = JSON.parse(text);
    } catch {
      json = { raw: text };
    }
  }
  const setCookie =
    res.headers.getSetCookie?.() ?? res.headers.get('set-cookie');
  return { status: res.status, json, text, setCookie };
}

function emptySlotDoc(slotId) {
  return {
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
}

function slotImageUrl(contentJson) {
  const content = contentJson?.content;
  if (!Array.isArray(content)) return null;
  for (const node of content) {
    if (node?.type !== 'imageSlot') continue;
    const url = node?.attrs?.imageUrl;
    if (typeof url === 'string' && url.trim()) return url.trim();
  }
  return null;
}

async function createSession(tagPrefix = 'slot') {
  const tag = `${tagPrefix}_${Date.now().toString(36)}`;
  const reg = await apiJson('POST', '/api/v1/auth/register', {
    body: {
      username: tag,
      password: 'password123',
      email: `${tag}@echo.test`,
      displayName: 'Slot Verify',
    },
  });
  if (reg.status !== 201) {
    throw new Error(`register failed ${reg.status}: ${reg.text}`);
  }
  const csrf = reg.json.csrfToken;
  const { sid, csrfCookie } = parseCookies(reg.setCookie);
  if (!sid || !csrfCookie) {
    throw new Error('missing session cookies after register');
  }
  const cookie = `echo_sid=${sid}; ${csrfCookie}`;

  const srv = await apiJson('POST', '/api/v1/echo/servers', {
    cookie,
    csrf,
    body: { name: `Slot verify ${tag}` },
  });
  if (srv.status !== 201) {
    throw new Error(`create server failed ${srv.status}: ${srv.text}`);
  }
  const { serverId, defaultChannelId: channelId } = srv.json;
  return {
    tag,
    csrf,
    cookie,
    sid,
    csrfValue: csrfCookie.split('=')[1],
    serverId,
    channelId,
  };
}

async function postEmptySlotMessage(session) {
  const slotId = randomUUID();
  const doc = emptySlotDoc(slotId);
  const post = await apiJson(
    'POST',
    `/api/v1/echo/channels/${encodeURIComponent(session.channelId)}/messages`,
    {
      cookie: session.cookie,
      csrf: session.csrf,
      body: {
        content: `![image: ratio=16:9, slotId=${slotId}]`,
        contentJson: doc,
        contentSchemaVersion: 2,
        messageFormatVersion: 2,
      },
    },
  );
  if (post.status !== 201) {
    throw new Error(`post message failed ${post.status}: ${post.text}`);
  }
  const messageId = post.json?.message?.id;
  if (!messageId) throw new Error('post message missing id');
  return { slotId, messageId };
}

async function uploadChatImage(session) {
  const { cookie, csrf, channelId } = session;
  const sha256Hex = createHash('sha256').update(PNG_BYTES).digest('hex');
  const phashHex = '0'.repeat(64);

  const match = await apiJson('POST', '/api/v1/echo/uploads/dedupe/match', {
    cookie,
    csrf,
    body: {
      channelId,
      purpose: 'channel_media',
      contentType: 'image/png',
      sha256Hex,
      phashHex,
      kind: 'image',
    },
  });
  if (match.status !== 200) {
    throw new Error(`dedupe/match failed ${match.status}: ${match.text}`);
  }
  const reuse = match.json?.reusePublicUrl?.trim();
  if (reuse) {
    return { url: reuse, storageKey: match.json?.storageKey };
  }

  const key = `${randomUUID()}-verify.png`;
  const presign = await apiJson('POST', '/api/v1/echo/uploads/presign', {
    cookie,
    csrf,
    body: {
      channelId,
      purpose: 'channel_media',
      key,
      contentType: 'image/png',
      contentLength: PNG_BYTES.length,
    },
  });
  if (presign.status !== 200) {
    throw new Error(`presign failed ${presign.status}: ${presign.text}`);
  }
  const uploadUrl = String(presign.json.uploadUrl ?? '');
  const authHeader =
    presign.json.headers?.Authorization ??
    presign.json.headers?.authorization ??
    '';
  const putHeaders = {
    'Content-Type': 'image/png',
    cookie,
    ...(authHeader ? { Authorization: authHeader } : {}),
  };
  const putTarget = uploadUrl.startsWith('/')
    ? `${BACKEND_URL}${uploadUrl}`
    : uploadUrl;
  const putRes = await fetch(putTarget, {
    method: 'PUT',
    headers: putHeaders,
    body: PNG_BYTES,
  });
  if (putRes.status !== 204 && !putRes.ok) {
    throw new Error(
      `upload PUT failed ${putRes.status}: ${await putRes.text()}`,
    );
  }

  const reg = await apiJson('POST', '/api/v1/echo/uploads/dedupe/register', {
    cookie,
    csrf,
    body: {
      channelId,
      purpose: 'channel_media',
      contentType: 'image/png',
      objectKey: key,
      storageKey: presign.json.key,
      publicUrl: presign.json.publicUrl,
      sha256Hex,
      phashHex,
      kind: 'image',
      byteLength: PNG_BYTES.length,
    },
  });
  if (reg.status !== 204) {
    throw new Error(`dedupe/register failed ${reg.status}: ${reg.text}`);
  }
  return { url: presign.json.publicUrl, storageKey: presign.json.key };
}

async function verifyApiFlow() {
  const session = await createSession('slot_api');
  const { slotId, messageId } = await postEmptySlotMessage(session);
  const uploaded = await uploadChatImage(session);

  const fill = await apiJson(
    'POST',
    `/api/v1/echo/channels/${encodeURIComponent(session.channelId)}/messages/${encodeURIComponent(messageId)}/image-slots/${encodeURIComponent(slotId)}/fill`,
    {
      cookie: session.cookie,
      csrf: session.csrf,
      body: {
        imageUrl: uploaded.url,
        ...(uploaded.storageKey ? { storageKey: uploaded.storageKey } : {}),
        width: 1,
        height: 1,
      },
    },
  );
  if (fill.status !== 204) {
    throw new Error(`fill slot failed ${fill.status}: ${fill.text}`);
  }

  const listed = await apiJson(
    'GET',
    `/api/v1/echo/channels/${encodeURIComponent(session.channelId)}/messages?limit=10`,
    { cookie: session.cookie },
  );
  if (listed.status !== 200) {
    throw new Error(`list messages failed ${listed.status}: ${listed.text}`);
  }
  const row = (listed.json?.messages ?? []).find((m) => m.id === messageId);
  if (!row) throw new Error('message not found after fill');
  const filledUrl = slotImageUrl(row.contentJson);
  if (!filledUrl) {
    throw new Error(
      `contentJson missing filled imageUrl; contentJson=${JSON.stringify(row.contentJson)}`,
    );
  }

  return { messageId, slotId, filledUrl, uploadUrl: uploaded.url };
}

async function waitForAppShell(page) {
  await page.waitForSelector('[data-cy=app-layout]', { timeout: 60_000 });
  await page.waitForSelector('.echo-boot-gate', {
    state: 'detached',
    timeout: 15_000,
  });
}

async function verifyUiFlow(session, messageId, pngPath) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
  });
  await context.addInitScript(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await context.addCookies([
    { name: 'echo_sid', value: session.sid, url: FRONTEND_URL },
    { name: 'echo_csrf', value: session.csrfValue, url: FRONTEND_URL },
  ]);
  const page = await context.newPage();
  const channelUrl = `${FRONTEND_URL}/channels/${encodeURIComponent(session.serverId)}/${encodeURIComponent(session.channelId)}`;
  await page.goto(channelUrl, { waitUntil: 'domcontentloaded' });
  await waitForAppShell(page);

  if (session.serverName) {
    const icons = page.locator('[data-cy="server-rail-icon"]');
    const count = await icons.count();
    for (let i = 0; i < count; i++) {
      const title = (await icons.nth(i).getAttribute('title')) ?? '';
      if (title.includes(session.serverName)) {
        await icons.nth(i).click({ noWaitAfter: true });
        await page.waitForTimeout(1200);
        break;
      }
    }
  }

  await page.waitForSelector('[data-cy="message-list"]', { timeout: 60_000 });

  const messageLocator = page.locator(`#message-${messageId}`);
  await messageLocator.first().waitFor({ state: 'attached', timeout: 60_000 });

  const emptySlot = page
    .locator(`#message-${messageId}`)
    .locator('.message-image-slot button')
    .filter({ hasText: 'Click to add image' });
  await emptySlot.first().waitFor({ state: 'visible', timeout: 15_000 });

  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser', { timeout: 10_000 }),
    emptySlot.first().click(),
  ]);
  await chooser.setFiles(pngPath);
  await page.waitForTimeout(3500);

  const filled = page
    .locator(`#message-${messageId}`)
    .locator('.message-image-slot__filled');
  const filledCount = await filled.count();
  if (filledCount < 1) {
    const slotHtml = await page
      .locator(`#message-${messageId}`)
      .locator('.message-image-slot')
      .first()
      .innerHTML()
      .catch(() => '(missing)');
    throw new Error(
      `UI did not show filled image slot after upload. slot HTML: ${slotHtml.slice(0, 400)}`,
    );
  }

  const img = filled.locator('img').first();
  await img.waitFor({ state: 'attached', timeout: 15_000 });
  const box = await img.boundingBox();
  if (!box || box.width < 2 || box.height < 2) {
    throw new Error(
      `filled slot img has no visible box: ${JSON.stringify(box)}`,
    );
  }

  await browser.close();
  return { filledCount, imgBox: box };
}

async function run() {
  console.log(`Backend: ${BACKEND_URL}`);
  console.log(`Frontend: ${FRONTEND_URL}`);
  const harness = loadHarnessEnv();

  const health = await fetch(`${BACKEND_URL}/api/v1/health`);
  if (!health.ok) throw new Error(`backend health failed: ${health.status}`);

  console.log('\n--- API: upload + fill + persist ---');
  const api = await verifyApiFlow();
  console.log(`  messageId=${api.messageId}`);
  console.log(`  slotId=${api.slotId}`);
  console.log(`  uploadUrl=${api.uploadUrl}`);
  console.log(`  filledUrl=${api.filledUrl}`);
  console.log('  ✓ API fill persisted in contentJson');

  if (RUN_UI) {
    console.log('\n--- UI: empty slot → click → upload → filled render ---');
    const session = harness
      ? {
          tag: 'harness',
          csrf: '',
          cookie: '',
          sid: harness.sid,
          csrfValue: harness.csrf,
          serverId: harness.serverId,
          channelId: harness.channelId,
          serverName: harness.serverName,
        }
      : await createSession('slot_ui');
    const messageId =
      harness?.messageId ?? (await postEmptySlotMessage(session)).messageId;
    const pngPath = path.join(
      os.tmpdir(),
      `echo-slot-verify-${session.tag}.png`,
    );
    fs.writeFileSync(pngPath, PNG_BYTES);
    try {
      const ui = await verifyUiFlow(session, messageId, pngPath);
      console.log(
        `  ✓ UI filled slot (count=${ui.filledCount}, img=${Math.round(ui.imgBox.width)}×${Math.round(ui.imgBox.height)}px)`,
      );

      if (harness) {
        const listed = await fetch(
          `${BACKEND_URL}/api/v1/echo/channels/${encodeURIComponent(harness.channelId)}/messages?limit=10`,
          { headers: { cookie: `echo_sid=${harness.sid}` } },
        );
        const listedJson = await listed.json();
        const row = (listedJson?.messages ?? []).find(
          (m) => m.id === messageId,
        );
        const persisted = slotImageUrl(row?.contentJson);
        if (!persisted) {
          throw new Error(
            'UI fill did not persist imageUrl to server contentJson',
          );
        }
        console.log('  ✓ Server contentJson has imageUrl after UI fill');
      }
    } finally {
      fs.unlinkSync(pngPath);
    }
  }

  console.log('\n✓ Image slot fill verification passed.');
}

run().catch((err) => {
  console.error('\n✗ Image slot fill verification FAILED:');
  console.error(err);
  process.exit(1);
});
