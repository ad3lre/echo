function env(name: string): string | undefined {
  const v = process.env[name];
  if (v == null) return undefined;
  const t = v.trim();
  return t ? t : undefined;
}

export const sidecarConfig = {
  port: Number(env('VOICE_SIDECAR_PORT') ?? '3050'),
  host: env('VOICE_SIDECAR_HOST') ?? '127.0.0.1',
  metricsPath: env('VOICE_SIDECAR_METRICS_PATH') ?? '/metrics',
  healthPath: env('VOICE_SIDECAR_HEALTH_PATH') ?? '/health',
  /** Same secret the backend uses to sign forwarded LiveKit webhook payloads. */
  echoForwardWebhookSecret: env('LIVEKIT_API_SECRET'),
} as const;
