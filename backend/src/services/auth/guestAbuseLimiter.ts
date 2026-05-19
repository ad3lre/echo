import { config } from '../../config';

const MS_HOUR = 60 * 60 * 1000;
const MS_DAY = 24 * MS_HOUR;

/** Timestamps of successful guest mints per IP (rolling windows). */
const mintTimestampsByIp = new Map<string, number[]>();
/** Successful mints in last 24h per IP (for captcha threshold). */
const mintTimestamps24hByIp = new Map<string, number[]>();
/** Hard block guest mints from IP until unix ms. */
const guestMintBlockUntilByIp = new Map<string, number>();
/** Failed Turnstile verifications per IP (abuse signal). */
const failedCaptchaCountByIp = new Map<string, number>();
/** Block guest message sends for (ip, guestUserId) until unix ms. */
const guestWriteComboBlockUntil = new Map<string, number>();

function pruneTimestamps(
  arr: number[],
  now: number,
  windowMs: number,
): number[] {
  const cutoff = now - windowMs;
  return arr.filter((t) => t > cutoff);
}

function comboKey(ip: string, guestId: string): string {
  return `${ip}|${guestId}`;
}

export type GuestMintGate =
  | { ok: true; requireCaptcha: boolean }
  | { ok: false; reason: 'GUEST_MINT_LIMIT' | 'GUEST_MINT_BLOCKED' };

/**
 * Call before creating a new guest (not cookie resume).
 */
export function evaluateGuestMint(ip: string, now = Date.now()): GuestMintGate {
  const blockUntil = guestMintBlockUntilByIp.get(ip) ?? 0;
  if (blockUntil > now) {
    return { ok: false, reason: 'GUEST_MINT_BLOCKED' };
  }

  const hourList = pruneTimestamps(
    mintTimestampsByIp.get(ip) ?? [],
    now,
    MS_HOUR,
  );
  if (hourList.length >= config.guestMintMaxPerIpPerHour) {
    return { ok: false, reason: 'GUEST_MINT_LIMIT' };
  }

  const dayList = pruneTimestamps(
    mintTimestamps24hByIp.get(ip) ?? [],
    now,
    MS_DAY,
  );
  const requireCaptcha =
    config.turnstileSecretKey.trim().length > 0 &&
    config.guestMintCaptchaAfterN > 0 &&
    dayList.length >= config.guestMintCaptchaAfterN;

  return { ok: true, requireCaptcha };
}

export function recordGuestMintSuccess(ip: string, now = Date.now()): void {
  const h = pruneTimestamps(mintTimestampsByIp.get(ip) ?? [], now, MS_HOUR);
  h.push(now);
  mintTimestampsByIp.set(ip, h);

  const d = pruneTimestamps(mintTimestamps24hByIp.get(ip) ?? [], now, MS_DAY);
  d.push(now);
  mintTimestamps24hByIp.set(ip, d);
}

export function recordFailedGuestCaptcha(ip: string, now = Date.now()): void {
  const n = (failedCaptchaCountByIp.get(ip) ?? 0) + 1;
  failedCaptchaCountByIp.set(ip, n);
  if (n >= config.guestCaptchaFailBlockThreshold) {
    guestMintBlockUntilByIp.set(
      ip,
      now + config.guestCaptchaFailBlockDurationMs,
    );
  }
}

export function blockGuestWritesForIpGuest(
  ip: string,
  guestUserId: string,
  now = Date.now(),
): void {
  guestWriteComboBlockUntil.set(
    comboKey(ip, guestUserId),
    now + config.guestAbuseComboBlockMs,
  );
}

export function isGuestWriteComboBlocked(
  ip: string,
  guestUserId: string,
  now = Date.now(),
): boolean {
  return (guestWriteComboBlockUntil.get(comboKey(ip, guestUserId)) ?? 0) > now;
}

/** Test helper: reset in-memory state. */
export function __resetGuestAbuseLimiterForTests(): void {
  mintTimestampsByIp.clear();
  mintTimestamps24hByIp.clear();
  guestMintBlockUntilByIp.clear();
  failedCaptchaCountByIp.clear();
  guestWriteComboBlockUntil.clear();
}
