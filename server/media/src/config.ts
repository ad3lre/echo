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

export const mediaCdnConfig = {
  port: parsePort(env('ECHO_MEDIA_CDN_PORT'), 3010),
  host: env('ECHO_MEDIA_CDN_HOST') ?? '127.0.0.1',
  metricsPath: normalizeRoutePath(
    env('ECHO_MEDIA_CDN_METRICS_PATH'),
    '/metrics',
  ),
  healthPath: normalizeRoutePath(env('ECHO_MEDIA_CDN_HEALTH_PATH'), '/healthz'),
  signingSecret:
    env('ECHO_MEDIA_CDN_SIGNING_SECRET') ??
    env('LOCAL_UPLOAD_TOKEN_SECRET') ??
    '',
  s3Bucket: env('ECHO_S3_BUCKET') ?? null,
  s3Region: env('ECHO_S3_REGION') ?? null,
  s3AccessKey: env('ECHO_S3_ACCESS_KEY') ?? null,
  s3SecretKey: env('ECHO_S3_SECRET_KEY') ?? null,
  s3Endpoint: env('ECHO_S3_ENDPOINT') ?? null,
  localUploadDir: env('ECHO_LOCAL_UPLOAD_DIR') ?? null,
} as const;

export function isMediaCdnS3Configured(): boolean {
  return !!(
    mediaCdnConfig.s3Bucket &&
    mediaCdnConfig.s3Region &&
    mediaCdnConfig.s3AccessKey &&
    mediaCdnConfig.s3SecretKey
  );
}
