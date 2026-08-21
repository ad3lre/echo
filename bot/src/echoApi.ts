import { randomUUID } from 'node:crypto';
import { createHmac } from 'node:crypto';
import { fetchEchoWebhook } from './echoFetch.js';
import { sleep } from './util/rateLimitQueue.js';
import {
  noteBridgeAllowlistRefresh,
  noteWebhookPostResult,
} from './botHealth.js';
import { parseRetryAfterMs } from './util/numberParsing.js';

/** Keep in sync with `contracts/echoWebhookHmac.ts`. */
function signEchoWebhookBody(
  secret: string,
  rawBody: string,
  tsMs: number = Date.now(),
): { ts: string; signature: string } {
  const ts = String(tsMs);
  const signature = createHmac('sha256', secret)
    .update(`${ts}.${rawBody}`)
    .digest('hex');
  return { ts, signature };
}

export function echoApiBaseUrl(): string {
  const raw = process.env.ECHO_API_BASE_URL?.trim();
  if (raw) return raw.replace(/\/$/, '');
  const hook = process.env.ECHO_DISCORD_BOT_WEBHOOK_URL?.trim();
  if (hook) {
    try {
      const u = new URL(hook);
      return u.origin;
    } catch {
      /* fall through */
    }
  }
  return 'http://127.0.0.1:3000';
}

export function echoWebhookSecret(): string {
  return process.env.ECHO_DISCORD_BOT_WEBHOOK_SECRET?.trim() ?? '';
}

export function buildEchoWebhookHeaders(
  secret: string,
  rawBody: string,
  opts?: { deliveryId?: string; sign?: boolean },
): Record<string, string> {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'x-echo-discord-bot-secret': secret,
  };
  const deliveryId = opts?.deliveryId ?? randomUUID();
  headers['x-echo-delivery-id'] = deliveryId;
  /** Always sign when a secret exists; dev API skips verification, production requires it. */
  const shouldSign = opts?.sign ?? Boolean(secret);
  if (shouldSign) {
    const { ts, signature } = signEchoWebhookBody(secret, rawBody);
    headers['x-echo-signature-ts'] = ts;
    headers['x-echo-signature'] = signature;
  }
  return headers;
}

export async function getEchoWebhookJson<T>(
  path: string,
  relay: string,
): Promise<T | null> {
  const secret = echoWebhookSecret();
  if (!secret) return null;
  const url = `${echoApiBaseUrl()}${path.startsWith('/') ? path : `/${path}`}`;
  try {
    const res = await fetchEchoWebhook(url, {
      method: 'GET',
      headers: { 'x-echo-discord-bot-secret': secret },
    });
    if (!res.ok) {
      console.warn(
        JSON.stringify({
          level: 'warn',
          relay,
          msg: 'echo_webhook_get_failed',
          path,
          status: res.status,
        }),
      );
      return null;
    }
    return (await res.json()) as T;
  } catch (e) {
    console.warn(
      JSON.stringify({
        level: 'warn',
        relay,
        msg: 'echo_webhook_get_error',
        path,
        error: e instanceof Error ? e.message : String(e),
      }),
    );
    return null;
  }
}

export async function postEchoWebhookJson(
  path: string,
  body: unknown,
  relay: string,
): Promise<Response | null> {
  const secret = echoWebhookSecret();
  if (!secret) return null;
  const url = `${echoApiBaseUrl()}${path.startsWith('/') ? path : `/${path}`}`;
  const rawBody = JSON.stringify(body ?? {});
  const headers = buildEchoWebhookHeaders(secret, rawBody);

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetchEchoWebhook(url, {
        method: 'POST',
        headers,
        body: rawBody,
      });
      noteWebhookPostResult(relay, res.status);
      if (res.ok || res.status === 204) return res;
      if (res.status === 429 && attempt < 3) {
        await sleep(
          parseRetryAfterMs(res.headers.get('retry-after'), 2_000, 500, 30_000),
        );
        continue;
      }
      if (!res.ok) {
        const t = await res.text().catch(() => '');
        console.warn(
          JSON.stringify({
            level: 'warn',
            relay,
            msg: 'echo_webhook_post_failed',
            path,
            status: res.status,
            body: t.slice(0, 200),
          }),
        );
      }
      return res;
    } catch (e) {
      noteWebhookPostResult(relay, 0);
      if (attempt >= 3) {
        console.warn(
          JSON.stringify({
            level: 'warn',
            relay,
            msg: 'echo_webhook_post_error',
            path,
            error: e instanceof Error ? e.message : String(e),
          }),
        );
        return null;
      }
      await sleep(400 * attempt);
    }
  }
  return null;
}

/** Probe signed POST auth against export-ready (empty guild id rejected after auth passes). */
export async function verifyEchoWebhookPostAuth(): Promise<{
  ok: boolean;
  status: number;
  detail: string;
}> {
  const secret = echoWebhookSecret();
  if (!secret) {
    return {
      ok: false,
      status: 0,
      detail: 'ECHO_DISCORD_BOT_WEBHOOK_SECRET unset',
    };
  }
  const path = '/api/v1/hooks/discord-bot/export-ready';
  const rawBody = JSON.stringify({ discordGuildId: '' });
  const url = `${echoApiBaseUrl()}${path}`;
  try {
    const res = await fetchEchoWebhook(url, {
      method: 'POST',
      headers: buildEchoWebhookHeaders(secret, rawBody),
      body: rawBody,
    });
    if (res.status === 401) {
      return { ok: false, status: 401, detail: 'Invalid webhook signature' };
    }
    if (res.status === 400) {
      return {
        ok: true,
        status: 400,
        detail: 'Auth OK (body validation reached)',
      };
    }
    return { ok: res.ok, status: res.status, detail: `HTTP ${res.status}` };
  } catch (e) {
    return {
      ok: false,
      status: 0,
      detail: e instanceof Error ? e.message : String(e),
    };
  }
}

export function noteAllowlistRefresh(ok: boolean, channelCount: number): void {
  noteBridgeAllowlistRefresh(ok, channelCount);
}
