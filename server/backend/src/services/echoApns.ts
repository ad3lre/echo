import http2 from 'node:http2';
import jwt from 'jsonwebtoken';
import type pg from 'pg';
import { config } from '../config';
import {
  deleteIosDeviceTokenById,
  listIosDeviceTokensForUser,
  type IosDeviceTokenRow,
} from '../domain/iosDeviceTokenRepo';

export type EchoApnsPayload = {
  title: string;
  body: string;
  url?: string;
  channelId?: string;
  tag?: string;
  badge?: number;
};

let cachedAuthToken: { value: string; expiresAtMs: number } | null = null;

export function isEchoApnsConfigured(): boolean {
  return Boolean(
    config.apnsKeyId &&
    config.apnsTeamId &&
    config.apnsKeyP8 &&
    config.apnsBundleId,
  );
}

function apnsHost(environment: IosDeviceTokenRow['environment']): string {
  return environment === 'production'
    ? 'api.push.apple.com'
    : 'api.sandbox.push.apple.com';
}

function apnsAuthToken(): string | null {
  const key = config.apnsKeyP8;
  const keyId = config.apnsKeyId;
  const teamId = config.apnsTeamId;
  if (!key || !keyId || !teamId) return null;

  const now = Date.now();
  if (cachedAuthToken && cachedAuthToken.expiresAtMs > now + 60_000) {
    return cachedAuthToken.value;
  }

  const value = jwt.sign({}, key, {
    algorithm: 'ES256',
    keyid: keyId,
    issuer: teamId,
    expiresIn: '50m',
  });
  cachedAuthToken = { value, expiresAtMs: now + 50 * 60 * 1000 };
  return value;
}

function buildApnsBody(payload: EchoApnsPayload): string {
  return JSON.stringify({
    aps: {
      alert: { title: payload.title, body: payload.body },
      sound: 'default',
      'thread-id': payload.tag ?? payload.channelId ?? 'echo',
      ...(typeof payload.badge === 'number'
        ? { badge: Math.max(0, Math.min(9999, Math.floor(payload.badge))) }
        : {}),
    },
    url: payload.url,
    channelId: payload.channelId,
  });
}

async function sendApnsToToken(
  row: IosDeviceTokenRow,
  auth: string,
  body: string,
): Promise<'ok' | 'gone' | 'failed'> {
  const host = apnsHost(row.environment);
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result: 'ok' | 'gone' | 'failed') => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    const client = http2.connect(`https://${host}`);
    const timeout = setTimeout(() => {
      client.destroy();
      finish('failed');
    }, 10_000);
    const finishAndClear = (result: 'ok' | 'gone' | 'failed') => {
      clearTimeout(timeout);
      finish(result);
    };
    client.on('error', () => {
      client.close();
      finishAndClear('failed');
    });

    const req = client.request({
      ':method': 'POST',
      ':path': `/3/device/${row.deviceToken}`,
      authorization: `bearer ${auth}`,
      'apns-topic': row.bundleId || config.apnsBundleId,
      'apns-push-type': 'alert',
      'apns-priority': '10',
    });

    let status = 0;
    let responseBody = '';
    req.setEncoding('utf8');
    req.on('response', (headers) => {
      status = Number(headers[':status'] ?? 0);
    });
    req.on('data', (chunk: string) => {
      responseBody += chunk;
    });
    req.on('end', () => {
      client.close();
      if (status === 200) return finishAndClear('ok');
      let reason = '';
      try {
        reason = String(JSON.parse(responseBody)?.reason ?? '');
      } catch {
        /* APNs may return an empty/non-JSON error body. */
      }
      if (
        status === 410 ||
        reason === 'BadDeviceToken' ||
        reason === 'DeviceTokenNotForTopic' ||
        reason === 'Unregistered'
      ) {
        return finishAndClear('gone');
      }
      return finishAndClear('failed');
    });
    req.on('error', () => {
      client.close();
      finishAndClear('failed');
    });
    req.end(body);
  });
}

/**
 * Best-effort APNs fan-out for one user. Removes tokens Apple reports as invalid (410).
 */
export async function sendEchoApnsToUser(
  pool: pg.Pool,
  userId: string,
  payload: EchoApnsPayload,
): Promise<number> {
  if (!isEchoApnsConfigured()) return 0;
  const auth = apnsAuthToken();
  if (!auth) return 0;

  let rows: IosDeviceTokenRow[];
  try {
    rows = await listIosDeviceTokensForUser(pool, userId);
  } catch {
    return 0;
  }
  if (!rows.length) return 0;

  const body = buildApnsBody(payload);
  let sent = 0;
  await Promise.all(
    rows.map(async (row) => {
      const result = await sendApnsToToken(row, auth, body);
      if (result === 'ok') sent += 1;
      if (result === 'gone') {
        try {
          await deleteIosDeviceTokenById(pool, row.id);
        } catch {
          /* best-effort */
        }
      }
    }),
  );
  return sent;
}
