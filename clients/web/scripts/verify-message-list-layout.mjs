/**
 * Playwright layout verification for message-list shell/hydration overlap fix.
 *
 * Requires a Postgres-backed stack with Vite using the `/api` proxy (unset VITE_API_URL):
 *   BACKEND_URL=http://127.0.0.1:3000 FRONTEND_URL=http://localhost:8081 node clients/web/scripts/verify-message-list-layout.mjs
 *
 * Default seed mode `guest` uses an existing busy directory server channel (no create-server rate limits).
 * Set LAYOUT_VERIFY_SEED=register to create an isolated server + messages instead.
 */
import { chromium } from 'playwright';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';

const BACKEND_URL = process.env.BACKEND_URL ?? 'http://127.0.0.1:3000';
const FRONTEND_URL = process.env.FRONTEND_URL ?? 'http://localhost:8081';
const SEED_MODE = (process.env.LAYOUT_VERIFY_SEED ?? 'guest').toLowerCase();
const SCROLL_FIXTURE = (process.env.SCROLL_FIXTURE ?? 'geometry').toLowerCase();
const SCROLL_MODALITY = (process.env.SCROLL_MODALITY ?? 'wheel').toLowerCase();
const MESSAGE_COUNT = Number(process.env.LAYOUT_VERIFY_MESSAGE_COUNT ?? 25);
const MESSAGE_POST_DELAY_MS = Number(
  process.env.LAYOUT_VERIFY_POST_DELAY_MS ?? 50,
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

function authCookieHeader(sid, csrfCookie) {
  return `echo_sid=${sid}; ${csrfCookie}`;
}

async function apiGuestDiscoverChannel() {
  const guest = await fetch(`${BACKEND_URL}/api/v1/auth/guest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });
  const guestBody = await guest.text();
  if (guest.status !== 201 && guest.status !== 200) {
    throw new Error(
      `guest mint failed ${guest.status}: ${guestBody.slice(0, 240)}`,
    );
  }
  const setCookies =
    guest.headers.getSetCookie?.() ?? guest.headers.get('set-cookie');
  const { sid, csrfCookie } = parseCookies(setCookies);
  if (!sid || !csrfCookie)
    throw new Error('guest mint missing echo_sid or echo_csrf cookie');
  const cookieHeader = authCookieHeader(sid, csrfCookie);

  const wsRes = await fetch(`${BACKEND_URL}/api/v1/echo/workspace`, {
    headers: { cookie: cookieHeader },
  });
  const wsBody = await wsRes.text();
  if (!wsRes.ok) {
    throw new Error(
      `workspace failed ${wsRes.status}: ${wsBody.slice(0, 240)}`,
    );
  }
  const workspace = JSON.parse(wsBody);
  const servers = workspace.servers ?? [];
  if (servers.length === 0) {
    throw new Error('guest workspace has no servers to verify against');
  }

  let best = null;
  for (const server of servers) {
    const chRes = await fetch(
      `${BACKEND_URL}/api/v1/echo/servers/${encodeURIComponent(server.id)}/channels`,
      { headers: { cookie: cookieHeader } },
    );
    if (!chRes.ok) continue;
    const { channels = [] } = await chRes.json();
    const textChannels = channels.filter((c) => c.type === 'text');
    const preferred =
      textChannels.find((c) => c.name?.toLowerCase() === 'chat') ??
      textChannels.find((c) => c.name?.toLowerCase() === 'general') ??
      textChannels[0];
    if (!preferred?.id) continue;
    const msgRes = await fetch(
      `${BACKEND_URL}/api/v1/echo/channels/${encodeURIComponent(preferred.id)}/messages?limit=50`,
      { headers: { cookie: cookieHeader } },
    );
    if (!msgRes.ok) continue;
    const { messages = [] } = await msgRes.json();
    const score = messages.length;
    if (!best || score > best.score) {
      best = {
        serverId: server.id,
        defaultChannelId: preferred.id,
        channelName: preferred.name,
        score,
      };
    }
  }

  if (!best || best.score < 8) {
    throw new Error(
      'could not find a text channel with enough messages for layout verification',
    );
  }

  return {
    sid,
    csrfCookie,
    serverId: best.serverId,
    defaultChannelId: best.defaultChannelId,
    tag: `guest:${best.channelName}`,
    messageCount: best.score,
  };
}

async function apiRegisterAndSeed() {
  const tag = `layout_${Date.now().toString(36)}`;
  const reg = await fetch(`${BACKEND_URL}/api/v1/auth/register`, {
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
    throw new Error(`register failed ${reg.status}: ${regBody.slice(0, 240)}`);
  }
  const { csrfToken } = JSON.parse(regBody);
  const setCookies =
    reg.headers.getSetCookie?.() ?? reg.headers.get('set-cookie');
  const { sid, csrfCookie } = parseCookies(setCookies);
  if (!sid || !csrfCookie)
    throw new Error('register missing echo_sid or echo_csrf cookie');
  const cookieHeader = authCookieHeader(sid, csrfCookie);

  const srv = await fetch(`${BACKEND_URL}/api/v1/echo/servers`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-csrf-token': csrfToken,
      cookie: cookieHeader,
    },
    body: JSON.stringify({ name: `Layout ${tag}` }),
  });
  const srvBody = await srv.text();
  if (srv.status !== 201) {
    throw new Error(
      `create server failed ${srv.status}: ${srvBody.slice(0, 240)}`,
    );
  }
  const { serverId, defaultChannelId } = JSON.parse(srvBody);

  const bodies = [
    'Short ping.',
    'A slightly longer line to exercise multi-line wrapping in the virtualized list.',
    '**Bold** and _italic_ markdown line for richer bubble height.',
    'Line one\nLine two\nLine three — explicit newline block.',
    'Another message with enough text to span more than one visual row in the chat column.',
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
      `${BACKEND_URL}/api/v1/echo/channels/${encodeURIComponent(defaultChannelId)}/messages`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': csrfToken,
          cookie: cookieHeader,
        },
        body: JSON.stringify({
          channelId: defaultChannelId,
          content,
          id: randomUUID(),
        }),
      },
    );
    if (res.status !== 201) {
      const text = await res.text();
      throw new Error(
        `post message ${i + 1} failed ${res.status}: ${text.slice(0, 240)}`,
      );
    }
    if (MESSAGE_POST_DELAY_MS > 0) {
      await new Promise((r) => setTimeout(r, MESSAGE_POST_DELAY_MS));
    }
  }

  return {
    sid,
    csrfCookie,
    serverId,
    defaultChannelId,
    tag,
    messageCount: MESSAGE_COUNT,
  };
}

async function prepareSessionFromHarnessFile() {
  const path = process.env.LAYOUT_VERIFY_ENV?.trim();
  if (!path || !fs.existsSync(path)) return null;
  const raw = JSON.parse(fs.readFileSync(path, 'utf8'));
  if (!raw?.sid || !raw?.csrf || !raw?.serverId || !raw?.channelId) {
    throw new Error(`invalid harness env file: ${path}`);
  }
  return {
    sid: raw.sid,
    csrfCookie: `echo_csrf=${raw.csrf}`,
    serverId: raw.serverId,
    defaultChannelId: raw.channelId,
    tag: 'harness',
    messageCount: raw.messageCount ?? MESSAGE_COUNT,
  };
}

async function prepareSession() {
  const harness = await prepareSessionFromHarnessFile();
  if (harness) return harness;
  if (SEED_MODE === 'register') return apiRegisterAndSeed();
  return apiGuestDiscoverChannel();
}

async function waitForAppShell(page) {
  await page.waitForSelector('[data-cy=app-layout]', { timeout: 60_000 });
  await page.waitForSelector('.echo-boot-gate', {
    state: 'detached',
    timeout: 15_000,
  });
}

async function measureLayout(page) {
  return page.evaluate(() => {
    const scroll = document.querySelector('[data-cy="message-list"]');
    if (!scroll) return { error: 'no message-list scroll container' };

    const slots = Array.from(scroll.querySelectorAll('[data-index]'))
      .map((row) => {
        const r = row.getBoundingClientRect();
        return {
          index: row.getAttribute('data-index'),
          top: Math.round(r.top * 10) / 10,
          bottom: Math.round(r.bottom * 10) / 10,
          height: Math.round(r.height * 10) / 10,
        };
      })
      .filter((r) => r.height > 0)
      .sort((a, b) => a.top - b.top);

    const slotOverlaps = [];
    const EXCESSIVE_GAP_PX = 96;
    for (let i = 0; i < slots.length - 1; i++) {
      const gap = slots[i + 1].top - slots[i].bottom;
      if (gap < -2) {
        slotOverlaps.push({
          a: slots[i].index,
          b: slots[i + 1].index,
          overlapPx: Math.round(-gap * 10) / 10,
        });
      }
    }

    const messages = Array.from(scroll.querySelectorAll('[id^="message-"]'));
    const rects = messages
      .map((el) => {
        const r = el.getBoundingClientRect();
        const rowSlot = el.closest('[data-index]');
        const slotRect = rowSlot?.getBoundingClientRect();
        return {
          id: el.id,
          height: Math.round(r.height * 10) / 10,
          slotHeight: slotRect ? Math.round(slotRect.height * 10) / 10 : null,
          isShell: el.getAttribute('aria-hidden') === 'true',
        };
      })
      .filter((r) => r.height > 0);

    const slotOverflows = rects.filter(
      (r) => r.slotHeight != null && r.height > r.slotHeight + 4,
    );

    const scrollRect = scroll.getBoundingClientRect();
    const visibleSlots = slots.filter(
      (r) => r.bottom > scrollRect.top + 2 && r.top < scrollRect.bottom - 2,
    );

    const slotExcessiveGapsVisible = [];
    for (let i = 0; i < visibleSlots.length - 1; i++) {
      const gap = visibleSlots[i + 1].top - visibleSlots[i].bottom;
      if (gap > EXCESSIVE_GAP_PX) {
        slotExcessiveGapsVisible.push({
          a: visibleSlots[i].index,
          b: visibleSlots[i + 1].index,
          gapPx: Math.round(gap * 10) / 10,
        });
      }
    }

    return {
      slotCount: slots.length,
      visibleSlotCount: visibleSlots.length,
      messageCount: rects.length,
      shellCount: rects.filter((r) => r.isShell).length,
      hydratedCount: rects.filter((r) => !r.isShell).length,
      slotOverlapCount: slotOverlaps.length,
      slotOverlaps: slotOverlaps.slice(0, 8),
      slotExcessiveGapCount: slotExcessiveGapsVisible.length,
      slotExcessiveGaps: slotExcessiveGapsVisible.slice(0, 8),
      embedCount: scroll.querySelectorAll('.message-link-embed').length,
      embedHostCount: scroll.querySelectorAll('.message-link-embeds').length,
      slotOverflowCount: slotOverflows.length,
      slotOverflows: slotOverflows.slice(0, 8).map((r) => ({
        id: r.id,
        contentH: r.height,
        slotH: r.slotHeight,
        delta: Math.round((r.height - (r.slotHeight ?? 0)) * 10) / 10,
      })),
      scrollTop: scroll.scrollTop,
      scrollHeight: scroll.scrollHeight,
      clientHeight: scroll.clientHeight,
    };
  });
}

async function run() {
  console.log(`Backend: ${BACKEND_URL}`);
  console.log(`Frontend: ${FRONTEND_URL}`);

  const health = await fetch(`${BACKEND_URL}/api/v1/health`);
  if (!health.ok) {
    throw new Error(`backend health failed: ${health.status}`);
  }
  const healthJson = await health.json();
  if (healthJson.echo === false || healthJson.db === 'memory') {
    console.warn(
      'Warning: backend may be memory-only; Echo chat APIs need Postgres (DATABASE_URL).',
    );
  }

  const seed = await prepareSession();
  console.log(
    `Using ${SEED_MODE} seed: server=${seed.serverId} channel=${seed.defaultChannelId} (${seed.tag}, ~${seed.messageCount ?? MESSAGE_COUNT} messages)`,
  );

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
  });
  await context.addCookies([
    {
      name: 'echo_sid',
      value: seed.sid,
      url: FRONTEND_URL,
    },
    {
      name: 'echo_csrf',
      value: seed.csrfCookie.split('=')[1],
      url: FRONTEND_URL,
    },
  ]);

  const page = await context.newPage();
  await page.addInitScript(() => {
    try {
      localStorage.setItem('echo_message_list_scroll_metrics', '1');
      localStorage.setItem('echo_message_list_debug', '1');
    } catch {
      /* ignore */
    }
  });
  const channelUrl = `${FRONTEND_URL}/channels/${encodeURIComponent(seed.serverId)}/${encodeURIComponent(seed.defaultChannelId)}?scrollMetrics=1`;
  await page.goto(channelUrl, { waitUntil: 'domcontentloaded' });
  await waitForAppShell(page);
  await page.waitForSelector('[data-cy="message-list"]', { timeout: 60_000 });
  await page.waitForSelector('[id^="message-"]', { timeout: 60_000 });

  // Let initial anchor + first hydration pass settle.
  await page.waitForTimeout(1200);

  const initial = await measureLayout(page);
  console.log('\n--- Initial layout (post-open) ---');
  console.log(JSON.stringify(initial, null, 2));

  const scroll = page.locator('[data-cy="message-list"]');
  let blankViewportSamples = 0;
  await page.evaluate(
    ([fixture, modality]) => {
      window.__echoMessageListScrollMetrics?.setScenario(
        `layout_verify_${modality}`,
        fixture,
      );
      window.__echoMessageListScrollMetrics?.reset();
    },
    [SCROLL_FIXTURE, SCROLL_MODALITY],
  );

  async function runScrollBurst(bursts, deltaFn) {
    for (let burst = 0; burst < bursts; burst++) {
      if (SCROLL_MODALITY === 'keyboard') {
        await page.keyboard.press(burst % 2 === 0 ? 'PageUp' : 'PageDown');
      } else if (SCROLL_MODALITY === 'scrollbar') {
        await scroll.evaluate((el, burstIdx) => {
          el.scrollTop += burstIdx % 2 === 0 ? -900 : 700;
        }, burst);
      } else {
        await scroll.evaluate((el, burstIdx) => {
          el.scrollTop += burstIdx % 2 === 0 ? -900 : 700;
        }, burst);
      }
      await page.waitForTimeout(40);
      const snap = await measureLayout(page);
      if (
        snap.visibleSlotCount === 0 &&
        snap.scrollHeight > snap.clientHeight
      ) {
        blankViewportSamples++;
      }
    }
  }

  await runScrollBurst(24);

  const midScroll = await measureLayout(page);
  console.log('\n--- After fast scroll bursts ---');
  console.log(JSON.stringify(midScroll, null, 2));
  console.log(`Blank viewport samples during scroll: ${blankViewportSamples}`);

  // Scroll to middle history and settle hydration.
  await scroll.evaluate((el) => {
    el.scrollTop = Math.max(0, Math.floor(el.scrollHeight * 0.35));
  });
  await page.waitForTimeout(250);
  for (let burst = 0; burst < 12; burst++) {
    await scroll.evaluate((el, burstIdx) => {
      el.scrollTop += burstIdx % 2 === 0 ? -500 : 500;
    }, burst);
    await page.waitForTimeout(50);
  }
  await page.waitForTimeout(2000);

  // Post link + grouped burst to exercise embed render and same-minute clustering.
  await page.evaluate(async () => {
    const scroll = document.querySelector('[data-cy="message-list"]');
    if (!scroll) return;
    scroll.scrollTop = scroll.scrollHeight;
  });
  await page.waitForTimeout(400);

  const embedProbe = await page.evaluate(async () => {
    const links = Array.from(
      document.querySelectorAll(
        '[data-cy="message-list"] .message-link-embeds',
      ),
    );
    return {
      embedHostCount: links.length,
      embedCardCount: document.querySelectorAll(
        '[data-cy="message-list"] .message-link-embed',
      ).length,
    };
  });
  console.log('\n--- Embed visibility (settled, includes link messages) ---');
  console.log(JSON.stringify(embedProbe, null, 2));

  const settled = await measureLayout(page);
  const scrollMetrics = await page.evaluate(
    () => window.__echoMessageListScrollMetrics?.getReport?.() ?? null,
  );
  console.log('\n--- Scroll metrics ---');
  console.log(JSON.stringify(scrollMetrics, null, 2));
  console.log('\n--- After scroll settle (2s) ---');
  console.log(JSON.stringify(settled, null, 2));

  await browser.close();

  const failures = [];
  if (initial.error) failures.push(initial.error);
  if (initial.slotOverlapCount > 0) {
    failures.push(
      `initial: ${initial.slotOverlapCount} virtual row slot overlap(s)`,
    );
  }
  if (settled.slotOverlapCount > 0) {
    failures.push(
      `settled: ${settled.slotOverlapCount} virtual row slot overlap(s)`,
    );
  }
  if (settled.slotOverflowCount > 0) {
    failures.push(
      `settled: ${settled.slotOverflowCount} row(s) taller than virtual slot`,
    );
  }
  if (blankViewportSamples > 4) {
    failures.push(
      `fast scroll: blank viewport in ${blankViewportSamples}/24 samples`,
    );
  }
  if ((settled.slotCount ?? 0) < 4) {
    failures.push(
      `only ${settled.slotCount ?? 0} virtual row slots measured in DOM`,
    );
  }
  if (settled.slotExcessiveGapCount > 0) {
    failures.push(
      `settled: ${settled.slotExcessiveGapCount} excessive virtual row gap(s) (>96px)`,
    );
  }
  if (embedProbe.embedHostCount < 1) {
    failures.push(
      'settled: expected at least one link embed host in the message list',
    );
  }

  if (failures.length > 0) {
    console.error('\n✗ Message list layout verification FAILED:');
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }

  console.log('\n✓ Message list layout verification passed.');
  console.log(
    `  slot overlaps: initial=${initial.slotOverlapCount}, settled=${settled.slotOverlapCount}`,
  );
  console.log(
    `  slot overflow: initial=${initial.slotOverflowCount}, settled=${settled.slotOverflowCount}`,
  );
  console.log(
    `  visible slots: initial=${initial.visibleSlotCount}, settled=${settled.visibleSlotCount}`,
  );
  console.log(
    `  excessive gaps: initial=${initial.slotExcessiveGapCount ?? 0}, settled=${settled.slotExcessiveGapCount ?? 0}`,
  );
  console.log(
    `  embed cards: settled=${settled.embedCount ?? 0} (hosts=${embedProbe.embedHostCount})`,
  );
  console.log(
    `  shells after settle: ${settled.shellCount} (hydrated=${settled.hydratedCount})`,
  );
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
