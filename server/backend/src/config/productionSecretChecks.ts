/** Production-only env secret hygiene checks (key names only in messages; never values). */

export const SECRET_CLASS_ENV_KEYS = [
  'JWT_SECRET',
  'ECHO_2FA_ENCRYPTION_KEY',
  'ECHO_AGENT_NETWORK_DIAG_TOKEN',
  'ECHO_METRICS_SCRAPE_TOKEN',
  'LOCAL_UPLOAD_TOKEN_SECRET',
  'ECHO_GUEST_BINDING_SECRET',
  'ECHO_MEDIA_CDN_SIGNING_SECRET',
  'GAME_SERVER_JWT_SECRET',
  'GAME_SERVER_FORWARD_SECRET',
  'ECHO_DISCORD_TOKEN_ENCRYPTION_KEY',
  'ECHO_SMS_OTP_PEPPER',
  'ECHO_DISCORD_BOT_WEBHOOK_SECRET',
  'LIVEKIT_API_SECRET',
  'ECHO_DEPLOY_NOTIFY_SECRET',
] as const;

/** Placeholder shipped in livekit.yaml / .env.example for local Compose only. */
export const DEV_LIVEKIT_API_KEY = 'devkey';
export const DEV_LIVEKIT_API_SECRET =
  'dev-only-livekit-secret-change-me-0000000000';
/** Legacy dev placeholder (previously committed); also rejected. */
const LEGACY_DEV_LIVEKIT_API_SECRET = 'devsecretdevsecretdevsecret1234';

type Env = Record<string, string | undefined>;

function clean(raw: string | undefined): string {
  return (raw ?? '').trim();
}

/** Returns groups of env KEY NAMES that share an identical non-empty value. */
export function findDuplicateSecretKeys(env: Env): string[][] {
  const byValue = new Map<string, string[]>();
  for (const key of SECRET_CLASS_ENV_KEYS) {
    const value = clean(env[key]);
    if (!value) continue;
    const list = byValue.get(value) ?? [];
    list.push(key);
    byValue.set(value, list);
  }
  return [...byValue.values()].filter((keys) => keys.length > 1);
}

/** Returns human-readable problems (no secret values) for LiveKit credentials. */
export function findDevLiveKitCredentialProblems(env: Env): string[] {
  const problems: string[] = [];
  const key = clean(env.LIVEKIT_API_KEY);
  const secret = clean(env.LIVEKIT_API_SECRET);
  if (key === DEV_LIVEKIT_API_KEY) {
    problems.push('LIVEKIT_API_KEY must not be the dev placeholder "devkey"');
  }
  if (
    secret &&
    (secret === DEV_LIVEKIT_API_SECRET ||
      secret === LEGACY_DEV_LIVEKIT_API_SECRET ||
      secret.toLowerCase().startsWith('dev'))
  ) {
    problems.push(
      'LIVEKIT_API_SECRET must not be a dev placeholder (known value or "dev…" prefix)',
    );
  }
  return problems;
}

/** Throws-style helper: returns an error message or null. */
export function productionSecretHygieneError(env: Env): string | null {
  const parts: string[] = [];
  for (const group of findDuplicateSecretKeys(env)) {
    parts.push(
      `secret env vars must be pairwise distinct; identical values: ${group.join(', ')}`,
    );
  }
  parts.push(...findDevLiveKitCredentialProblems(env));
  return parts.length ? parts.join('; ') : null;
}

/** Gate helper: logs the key-name-only message and exits(1) when hygiene fails. */
export function assertProductionSecretHygiene(
  env: Env,
  deps: {
    configStderr: (m: string) => void;
    exitProcess: (c: number) => never;
  },
): void {
  const msg = productionSecretHygieneError(env);
  if (msg) {
    deps.configStderr(msg);
    deps.exitProcess(1);
  }
}
