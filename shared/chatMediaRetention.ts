import { normalizeEchoPlanId, type EchoPlanId } from './echoPlanLimits';

/** Size tier boundaries for base abandonment periods. */
export const CHAT_MEDIA_RETENTION_TIER_10_MB = 10 * 1024 * 1024;
export const CHAT_MEDIA_RETENTION_TIER_100_MB = 100 * 1024 * 1024;

/** Echo+ permanent threshold and extended decay above it. */
export const CHAT_MEDIA_RETENTION_PLUS_PERMANENT_BYTES = 15 * 1024 * 1024;

/** Echo Black permanent threshold; above it timers pause while subscribed. */
export const CHAT_MEDIA_RETENTION_BLACK_PERMANENT_BYTES = 100 * 1024 * 1024;

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MS_PER_YEAR = 365.25 * MS_PER_DAY;

/** Base abandonment periods by size (before plan multipliers). */
export const CHAT_MEDIA_RETENTION_BASE_MS = {
  upTo10Mb: 6 * MS_PER_YEAR,
  upTo100Mb: 3 * MS_PER_YEAR,
  above100Mb: MS_PER_YEAR,
} as const;

export const CHAT_MEDIA_RETENTION_PLUS_DECAY_MULTIPLIER = 1.25;
export const CHAT_MEDIA_RETENTION_BLACK_DECAY_MULTIPLIER = 1.3;

export type ChatUploadRetentionSourceType = 'user' | 'webhook' | 'import';

export type ChatUploadRetentionPolicy = {
  permanent: boolean;
  timerPaused: boolean;
  abandonMs: number | null;
};

export type ComputeAbandonMsOpts = {
  /** Abuse escape hatch: revoked permanent row uses paid-tier multipliers only. */
  revokedPermanent?: boolean;
  /** Black unpause / post-downgrade: apply ×1.30 even when not >100 MB. */
  blackUnpaused?: boolean;
};

function baseAbandonMs(byteLength: number): number {
  if (!Number.isFinite(byteLength) || byteLength < 1) {
    return CHAT_MEDIA_RETENTION_BASE_MS.upTo10Mb;
  }
  if (byteLength <= CHAT_MEDIA_RETENTION_TIER_10_MB) {
    return CHAT_MEDIA_RETENTION_BASE_MS.upTo10Mb;
  }
  if (byteLength <= CHAT_MEDIA_RETENTION_TIER_100_MB) {
    return CHAT_MEDIA_RETENTION_BASE_MS.upTo100Mb;
  }
  return CHAT_MEDIA_RETENTION_BASE_MS.above100Mb;
}

function planDecayMultiplier(
  plan: EchoPlanId,
  byteLength: number,
  opts: ComputeAbandonMsOpts,
): number {
  if (opts.revokedPermanent) {
    if (plan === 'plus') return CHAT_MEDIA_RETENTION_PLUS_DECAY_MULTIPLIER;
    if (plan === 'black') return CHAT_MEDIA_RETENTION_BLACK_DECAY_MULTIPLIER;
    return 1;
  }
  if (opts.blackUnpaused && plan === 'black') {
    return CHAT_MEDIA_RETENTION_BLACK_DECAY_MULTIPLIER;
  }
  if (
    plan === 'plus' &&
    byteLength > CHAT_MEDIA_RETENTION_PLUS_PERMANENT_BYTES
  ) {
    return CHAT_MEDIA_RETENTION_PLUS_DECAY_MULTIPLIER;
  }
  return 1;
}

/**
 * Abandonment window in milliseconds from a reference time (last view or upload).
 */
export function computeAbandonMs(
  byteLength: number,
  planSnapshot: EchoPlanId,
  opts: ComputeAbandonMsOpts = {},
): number {
  const plan = normalizeEchoPlanId(planSnapshot);
  const base = baseAbandonMs(byteLength);
  const mult = planDecayMultiplier(plan, byteLength, opts);
  return Math.floor(base * mult);
}

/**
 * Registration-time policy from uploader plan snapshot and object size.
 */
export function resolveChatUploadRetentionPolicy(
  byteLength: number,
  planSnapshot: EchoPlanId,
  sourceType: ChatUploadRetentionSourceType,
): ChatUploadRetentionPolicy {
  const plan = normalizeEchoPlanId(planSnapshot);
  const effectivePlan = sourceType === 'webhook' ? ('free' as const) : plan;

  if (
    effectivePlan === 'plus' &&
    byteLength <= CHAT_MEDIA_RETENTION_PLUS_PERMANENT_BYTES
  ) {
    return { permanent: true, timerPaused: false, abandonMs: null };
  }
  if (
    effectivePlan === 'black' &&
    byteLength <= CHAT_MEDIA_RETENTION_BLACK_PERMANENT_BYTES
  ) {
    return { permanent: true, timerPaused: false, abandonMs: null };
  }
  if (
    effectivePlan === 'black' &&
    byteLength > CHAT_MEDIA_RETENTION_BLACK_PERMANENT_BYTES
  ) {
    return { permanent: false, timerPaused: true, abandonMs: null };
  }

  const abandonMs = computeAbandonMs(byteLength, effectivePlan);
  return { permanent: false, timerPaused: false, abandonMs };
}

const CHAT_MEDIA_PREFIXES = [
  'echo/channels/',
  'echo/webhook-inbound/',
] as const;

const NON_CHAT_ECHO_PREFIXES = [
  'echo/avatars/',
  'echo/banners/',
  'echo/server-icons/',
  'echo/server-banners/',
  'echo/emoji/',
  'echo/server-event-covers/',
  'echo/bug-reports/',
  'echo/server-application-attachments/',
] as const;

/**
 * True for user-sent chat media storage keys (not branding, emoji, etc.).
 * Includes legacy `echo/{serverId}/{userId}/…` guild paths.
 */
export function isEchoChatUserMediaStorageKey(storageKey: string): boolean {
  const key = storageKey.trim();
  if (!key || key.includes('..')) return false;
  if (NON_CHAT_ECHO_PREFIXES.some((p) => key.startsWith(p))) return false;
  if (CHAT_MEDIA_PREFIXES.some((p) => key.startsWith(p))) return true;
  // Legacy guild chat: echo/{serverId}/{userId}/file — not echo/avatars etc.
  if (!key.startsWith('echo/')) return false;
  const parts = key.split('/');
  if (parts.length < 4) return false;
  const second = parts[1] ?? '';
  if (!second || NON_CHAT_ECHO_PREFIXES.some((p) => key.startsWith(p))) {
    return false;
  }
  return true;
}
