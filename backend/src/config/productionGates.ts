/** Production-only startup gates extracted from `config.ts` for reviewability. */
export type EchoProductionConfigGateInput = {
  isProduction: boolean;
  backendStorageMode: 'memory' | 'postgres';
  jwtSecret: string;
  echoRequireGuestBindingSecretInProduction: boolean;
  echoGuestBindingSecret: string;
  databaseUrl: string | null;
  echoTelnyxApiKey: string | null;
  echoSmsOtpPepper: string | null;
  echo2faEncryptionKey: string | null;
  authLegacyBearer: boolean;
  authNativeBearer: boolean;
  echoRequireRedisInProduction: boolean;
  redisUrl: string | null;
  echoLocalUploadDir: string | null;
  localUploadTokenSecret: string;
  echoDiscordBotWebhookSecret: string | null;
  echoRequireMetricsScrapeTokenInProduction: boolean;
  echoMetricsScrapeToken: string | null;
  echoAgentNetworkDiagnosticsEnabled: boolean;
  echoAgentNetworkDiagnosticsToken: string | null;
  echoRequireMediaUrlHardeningInProduction: boolean;
  echoMediaUrlRequireHttps: boolean;
  echoMediaUrlAllowedHosts: readonly string[];
  liveKitEnabled: boolean;
  liveKitPublicUrl: string;
  voiceSidecarEnabled: boolean;
};

export type EchoProductionConfigGateDeps = {
  configStderr: (message: string) => void;
  exitProcess: (code: number) => never;
  requireStrongProductionSecret: (label: string, value: string) => void;
  isStrongProductionSecret: (value: string | null | undefined) => boolean;
  normalizeEnvValue: (raw: string | undefined) => string;
  minProductionSecretLength: number;
  devDiscordBotWebhookSecret: string;
};

export function assertEchoProductionConfigGates(
  config: EchoProductionConfigGateInput,
  deps: EchoProductionConfigGateDeps,
): void {
  if (!config.isProduction) return;

  if (config.backendStorageMode !== 'postgres') {
    deps.configStderr(
      'ECHO_BACKEND_STORAGE must be set to "postgres" when NODE_ENV=production. In-memory backend storage is not supported in production.',
    );
    deps.exitProcess(1);
  }
  deps.requireStrongProductionSecret('JWT_SECRET', config.jwtSecret);
  if (
    config.echoRequireGuestBindingSecretInProduction &&
    !deps.isStrongProductionSecret(config.echoGuestBindingSecret)
  ) {
    deps.configStderr(
      `ECHO_GUEST_BINDING_SECRET is required in production (at least ${deps.minProductionSecretLength} random characters, independent of JWT_SECRET) so guest binding cookies cannot be forged from JWT material alone. Set ECHO_REQUIRE_GUEST_BINDING_SECRET_IN_PRODUCTION=false only for deliberate single-process / local smoke stacks (binding key is then derived from JWT_SECRET).`,
    );
    deps.exitProcess(1);
  }
  const db = config.databaseUrl?.trim() ?? '';
  if (!db) {
    deps.configStderr(
      'DATABASE_URL is required when NODE_ENV=production. The server does not start without Postgres.',
    );
    deps.exitProcess(1);
  }
  if (config.echoTelnyxApiKey && !config.echoSmsOtpPepper?.trim()) {
    deps.configStderr(
      'ECHO_SMS_OTP_PEPPER is required in production when ECHO_TELNYX_API_KEY is set (SMS verification).',
    );
    deps.exitProcess(1);
  }
  if (db && !config.echo2faEncryptionKey?.trim()) {
    deps.configStderr(
      'ECHO_2FA_ENCRYPTION_KEY is required in production when DATABASE_URL is set (32-byte key as 64 hex chars or base64 encoding 32 raw bytes) for TOTP secret encryption at rest.',
    );
    deps.exitProcess(1);
  }
  if (config.authLegacyBearer) {
    deps.configStderr(
      'AUTH_LEGACY_BEARER must not be enabled in production. Bearer access JWTs cannot be revoked before expiry.',
    );
    deps.exitProcess(1);
  }
  if (config.echoRequireRedisInProduction && !config.redisUrl?.trim()) {
    deps.configStderr(
      'REDIS_URL is required in production for shared server-side sessions (default: ECHO_REQUIRE_REDIS_IN_PRODUCTION is on when NODE_ENV=production). Set REDIS_URL, or set ECHO_REQUIRE_REDIS_IN_PRODUCTION=false only for deliberate single-process deployments.',
    );
    deps.exitProcess(1);
  }
  if (config.echoLocalUploadDir && !config.redisUrl?.trim()) {
    deps.configStderr(
      'REDIS_URL is required in production when local uploads are enabled. One-time upload token replay protection requires shared Redis state across instances.',
    );
    deps.exitProcess(1);
  }
  if (
    config.echoLocalUploadDir &&
    (!deps.isStrongProductionSecret(config.localUploadTokenSecret) ||
      config.localUploadTokenSecret === config.jwtSecret)
  ) {
    deps.configStderr(
      `LOCAL_UPLOAD_TOKEN_SECRET is required in production when local uploads are enabled. Use at least ${deps.minProductionSecretLength} random characters independent of JWT_SECRET.`,
    );
    deps.exitProcess(1);
  }
  if (config.echoDiscordBotWebhookSecret === deps.devDiscordBotWebhookSecret) {
    deps.configStderr(
      'ECHO_DISCORD_BOT_WEBHOOK_SECRET must not use the built-in dev default in production. Set a unique secret or leave unset to disable the Discord bot hook.',
    );
    deps.exitProcess(1);
  }
  if (
    config.echoDiscordBotWebhookSecret &&
    !deps.isStrongProductionSecret(config.echoDiscordBotWebhookSecret)
  ) {
    deps.configStderr(
      `ECHO_DISCORD_BOT_WEBHOOK_SECRET must be at least ${deps.minProductionSecretLength} random characters in production, or left unset to disable the hook.`,
    );
    deps.exitProcess(1);
  }
  const corsOriginRaw = deps.normalizeEnvValue(process.env.CORS_ORIGIN);
  if (!corsOriginRaw || corsOriginRaw === '*') {
    deps.configStderr(
      'CORS_ORIGIN must be set in production to an explicit origin (comma-separated list allowed). Reflecting arbitrary origins is not permitted. Never use * with credentialed auth.',
    );
    deps.exitProcess(1);
  }
  if (
    config.echoRequireMetricsScrapeTokenInProduction &&
    !deps.isStrongProductionSecret(config.echoMetricsScrapeToken)
  ) {
    deps.configStderr(
      `ECHO_METRICS_SCRAPE_TOKEN is required in production so GET /api/v1/metrics is not world-readable. Set at least ${deps.minProductionSecretLength} random characters and scrape with Authorization: Bearer <token>, block the route at your reverse proxy, or set ECHO_REQUIRE_METRICS_SCRAPE_TOKEN_IN_PRODUCTION=false only for deliberate single-process / local smoke stacks.`,
    );
    deps.exitProcess(1);
  }
  if (
    config.echoAgentNetworkDiagnosticsEnabled &&
    !deps.isStrongProductionSecret(config.echoAgentNetworkDiagnosticsToken)
  ) {
    deps.configStderr(
      `ECHO_AGENT_NETWORK_DIAG_ENABLED is on in production but ECHO_AGENT_NETWORK_DIAG_TOKEN is missing or too weak. Set at least ${deps.minProductionSecretLength} random characters (Authorization: Bearer <token>) or disable the feature.`,
    );
    deps.exitProcess(1);
  }
  if (
    config.echoRequireMediaUrlHardeningInProduction &&
    !config.echoMediaUrlRequireHttps &&
    config.echoMediaUrlAllowedHosts.length === 0
  ) {
    deps.configStderr(
      'In production, set ECHO_MEDIA_URL_REQUIRE_HTTPS=true and/or a non-empty ECHO_MEDIA_URL_ALLOWED_HOSTS allowlist so message and branding HTTP(S) media URLs are constrained (see docs/operations/shipping-gate.md), or set ECHO_REQUIRE_MEDIA_URL_HARDENING_IN_PRODUCTION=false only for deliberate single-process / local smoke stacks.',
    );
    deps.exitProcess(1);
  }
  if (
    config.liveKitEnabled &&
    config.liveKitPublicUrl.toLowerCase().startsWith('ws://')
  ) {
    deps.configStderr(
      '[echo-config] LIVEKIT_PUBLIC_URL must use wss:// in production when LiveKit is enabled (ws:// is not acceptable for browser WebRTC). See docs/operations/livekit-production.md',
    );
    deps.exitProcess(1);
  }
  if (config.voiceSidecarEnabled) {
    deps.configStderr(
      '[echo-config] VOICE_SIDECAR_ENABLED must not be enabled in production (Layer 2 is paused).',
    );
    deps.exitProcess(1);
  }
}
