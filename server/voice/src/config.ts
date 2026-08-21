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

export const sidecarConfig = {
  port: parsePort(env('VOICE_SIDECAR_PORT'), 3050),
  host: env('VOICE_SIDECAR_HOST') ?? '127.0.0.1',
  metricsPath: normalizeRoutePath(
    env('VOICE_SIDECAR_METRICS_PATH'),
    '/metrics',
  ),
  healthPath: normalizeRoutePath(env('VOICE_SIDECAR_HEALTH_PATH'), '/health'),
  /** Same secret the backend uses to sign forwarded LiveKit webhook payloads. */
  echoForwardWebhookSecret: env('LIVEKIT_API_SECRET'),
} as const;
