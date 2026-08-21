import type { Pool } from 'pg';
import { config } from '../config';

const HOUR_MS = 60 * 60 * 1000;
const ipSendTimestamps = new Map<string, number[]>();

function pruneIpWindow(ip: string, now: number): number[] {
  const windowStart = now - HOUR_MS;
  const arr = (ipSendTimestamps.get(ip) ?? []).filter((t) => t > windowStart);
  ipSendTimestamps.set(ip, arr);
  return arr;
}

export function countSmsSendsFromIpLastHour(ip: string): number {
  return pruneIpWindow(ip, Date.now()).length;
}

export function recordSmsSendFromIp(ip: string): void {
  const now = Date.now();
  const arr = pruneIpWindow(ip, now);
  arr.push(now);
  ipSendTimestamps.set(ip, arr);
}

export async function countSmsChallengesUserLast24h(
  pool: Pool,
  userId: string,
): Promise<number> {
  const r = await pool.query(
    `
    SELECT COUNT(*)::int AS c FROM auth_phone_otp_challenges
    WHERE user_id = $1 AND created_at > NOW() - INTERVAL '24 hours'
    `,
    [userId],
  );
  return Number(r.rows?.[0]?.c ?? 0);
}

export async function countSmsChallengesPhoneLast24h(
  pool: Pool,
  phoneE164: string,
): Promise<number> {
  const r = await pool.query(
    `
    SELECT COUNT(*)::int AS c FROM auth_phone_otp_challenges
    WHERE phone_e164 = $1 AND created_at > NOW() - INTERVAL '24 hours'
    `,
    [phoneE164],
  );
  return Number(r.rows?.[0]?.c ?? 0);
}

export function assertSmsSendAllowedByIp(ip: string): void {
  if (countSmsSendsFromIpLastHour(ip) >= config.echoSmsSendPerIpPerHour) {
    throw new Error('SMS_SEND_RATE_IP');
  }
}

export async function assertSmsSendAllowedByUserAndPhone(
  pool: Pool,
  userId: string,
  phoneE164: string,
): Promise<void> {
  const [u, p] = await Promise.all([
    countSmsChallengesUserLast24h(pool, userId),
    countSmsChallengesPhoneLast24h(pool, phoneE164),
  ]);
  if (u >= config.echoSmsSendPerUserPerDay) {
    throw new Error('SMS_SEND_CAP_USER');
  }
  if (p >= config.echoSmsSendPerPhonePerDay) {
    throw new Error('SMS_SEND_CAP_PHONE');
  }
}
