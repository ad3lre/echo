import { assertGameServerProductionConfig } from './config/productionGates';

function env(name: string): string | undefined {
  const v = process.env[name];
  if (v == null) return undefined;
  const t = v.trim();
  return t ? t : undefined;
}

export function parsePort(raw: string | undefined, fallback: number): number {
  if (raw === undefined) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(65_535, Math.max(1, Math.floor(n)));
}

export function normalizeRoutePath(
  raw: string | undefined,
  fallback: string,
): string {
  if (!raw) return fallback;
  return raw.startsWith('/') ? raw : `/${raw}`;
}

/**
 * Socket.IO CORS origin. Comma-separated allowlist via `GAME_SERVER_CORS_ORIGIN`;
 * when unset we reflect the request origin (dev-friendly, same posture as the
 * backend's `corsOrigin: true`). Lock this down via env in production.
 */
function resolveCorsOrigin(): string[] | true {
  const raw = env('GAME_SERVER_CORS_ORIGIN');
  if (!raw) return true;
  const list = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return list.length ? list : true;
}

export const gameServerConfig = {
  port: parsePort(env('GAME_SERVER_PORT'), 3060),
  host: env('GAME_SERVER_HOST') ?? '127.0.0.1',
  metricsPath: normalizeRoutePath(env('GAME_SERVER_METRICS_PATH'), '/metrics'),
  healthPath: normalizeRoutePath(env('GAME_SERVER_HEALTH_PATH'), '/health'),
  corsOrigin: resolveCorsOrigin(),
  /**
   * Verifies client game tokens minted by the backend. Dedicated override, else
   * the backend's `JWT_SECRET` (so a single dev secret works out of the box).
   * `dev-insecure-secret` mirrors the backend fallback — never used in prod.
   */
  gameTokenSecret:
    env('GAME_SERVER_JWT_SECRET') ?? env('JWT_SECRET') ?? 'dev-insecure-secret',
  /** Verifies HMAC-signed forwarded calls from the backend (membership/result hooks). */
  echoForwardSecret:
    env('GAME_SERVER_FORWARD_SECRET') ??
    env('JWT_SECRET') ??
    'dev-insecure-secret',
  natsUrl: env('NATS_URL') ?? null,
  /** Echo backend base URL for tunneled game S2C relay (HMAC POST). */
  echoRelayBaseUrl:
    env('ECHO_GAME_RELAY_BASE_URL')?.replace(/\/$/, '') ||
    'http://127.0.0.1:3000',
  /** Dispose an instance this long after its last member leaves. */
  idleDisposeMs: parsePort(env('GAME_SERVER_IDLE_DISPOSE_MS'), 60_000),
} as const;

assertGameServerProductionConfig({
  gameTokenSecret: gameServerConfig.gameTokenSecret,
  echoForwardSecret: gameServerConfig.echoForwardSecret,
  corsOrigin: gameServerConfig.corsOrigin,
});
