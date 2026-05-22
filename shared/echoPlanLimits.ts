/**
 * Echo subscription tiers — limits surfaced to clients and enforced on the API where implemented.
 * See `docs/plans/echo-plan-limits-status.md` for gaps (billing, voice, compression, daily caps, etc.).
 */

export type EchoPlanId = 'free' | 'plus' | 'black';

export const ECHO_PLAN_IDS: readonly EchoPlanId[] = ['free', 'plus', 'black'];

export function normalizeEchoPlanId(raw: unknown): EchoPlanId {
  const s = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  if (s === 'plus' || s === 'black') return s;
  return 'free';
}

/** Per-file upload cap by paid tier (free tier also uses phone bump below). */
export const ECHO_PLAN_UPLOAD_CAP_BYTES: Record<EchoPlanId, number> = {
  free: 30 * 1024 * 1024,
  plus: 2 * 1024 * 1024 * 1024,
  black: 8 * 1024 * 1024 * 1024,
};

/** Free Echo: higher single-file cap when phone is verified (20h playtime not tracked yet). */
export const ECHO_FREE_PHONE_VERIFIED_UPLOAD_CAP_BYTES = 250 * 1024 * 1024;

/** Max servers the user may be a member of (Echo / Echo+ / Echo Black product table). */
export const ECHO_PLAN_MAX_JOINED_SERVERS: Record<EchoPlanId, number | null> = {
  free: 200,
  plus: null,
  black: null,
};

export const ECHO_PLAN_GROUP_DM_MAX_MEMBERS: Record<EchoPlanId, number> = {
  free: 25,
  plus: 50,
  black: 250,
};

/** Distinct image searches per UTC day (Serper upstream; pagination shares one credit per query). */
export const ECHO_PLAN_IMAGE_SEARCHES_PER_DAY: Record<EchoPlanId, number> = {
  free: 10,
  plus: 250,
  black: 500,
};

/**
 * Below this, a `groupDmMaxMembers` value from the API/session is treated as invalid
 * (use `fallback`, usually the free-tier cap).
 */
export const ECHO_GROUP_DM_MAX_MEMBERS_MIN_VALID = 3;

/**
 * Normalize plan `groupDmMaxMembers` for UI and client guards. Non-finite or sub-minimum
 * values fall back so bad payloads cannot collapse the cap to a tiny number.
 */
export function resolveEchoGroupDmMaxMembers(
  raw: unknown,
  fallback: number = ECHO_PLAN_GROUP_DM_MAX_MEMBERS.free,
): number {
  if (
    typeof raw !== 'number' ||
    !Number.isFinite(raw) ||
    raw < ECHO_GROUP_DM_MAX_MEMBERS_MIN_VALID
  ) {
    return fallback;
  }
  return raw;
}

export type EchoThemeTier = 'starter' | 'premium' | 'ultimate';

export const ECHO_PLAN_THEME_TIER: Record<EchoPlanId, EchoThemeTier> = {
  free: 'starter',
  plus: 'premium',
  black: 'ultimate',
};

/** Largest single-file upload any tier may request (S3 presign validation). */
export const ECHO_UPLOAD_ABS_MAX_BYTES = ECHO_PLAN_UPLOAD_CAP_BYTES.black;

export type EchoPlanFeatureFlags = {
  lowCompression: boolean;
  rawCompression: boolean;
  trueCustomTheming: boolean;
};

export const ECHO_PLAN_FEATURE_FLAGS: Record<EchoPlanId, EchoPlanFeatureFlags> =
  {
    free: {
      lowCompression: false,
      rawCompression: false,
      trueCustomTheming: false,
    },
    plus: {
      lowCompression: true,
      rawCompression: false,
      trueCustomTheming: false,
    },
    black: {
      lowCompression: true,
      rawCompression: true,
      trueCustomTheming: true,
    },
  };

export type EchoPlanLimitsPublic = {
  plan: EchoPlanId;
  uploadMaxBytes: number;
  maxJoinedServers: number | null;
  joinedServerCount: number;
  groupDmMaxMembers: number;
  themeTier: EchoThemeTier;
  features: EchoPlanFeatureFlags;
  imageSearchesPerDay: number;
  /** Distinct image-search queries used today (UTC); pagination reuses one credit per query. */
  imageSearchesUsedToday: number;
};
