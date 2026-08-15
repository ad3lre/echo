import {
  assertEchoProductionConfigGates,
  type EchoProductionConfigGateInput,
} from './productionGates';
import { normalizeEnvValue } from './envParsing';
import {
  configStderr,
  ConfigFatalError,
  DEV_DISCORD_BOT_WEBHOOK_SECRET,
  exitBadConfig,
  isStrongProductionSecret,
  MIN_PRODUCTION_SECRET_LENGTH,
  requireStrongProductionSecret,
} from './secrets';

/** Subset of AppConfig fields used by post-build validation. */
export type ConfigValidationInput = {
  port: number;
  bcryptSaltRounds: number;
  refreshTokenTtlDays: number;
  snowflakeWorkerId: number;
  snowflakeDatacenterId: number;
  isProduction: boolean;
  backendStorageMode: 'memory' | 'postgres';
  jwtSecret: string;
  corsOrigin: string | string[] | true;
  echoAppPublicUrl: string;
  echoApiPublicUrl: string;
  echoMarketingPublicUrl: string;
  trustProxy: boolean;
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
  echoSmtpHost: string | null;
  echoRequireMediaUrlHardeningInProduction: boolean;
  echoMediaUrlRequireHttps: boolean;
  echoMediaUrlAllowedHosts: readonly string[];
  liveKitEnabled: boolean;
  liveKitPublicUrl: string;
  voiceSidecarEnabled: boolean;
  echoVideoHlsWorker: 'embedded' | 'standalone';
  echoAllowEmbeddedVideoHls: boolean;
};

export type ValidateConfigDeps = {
  configStderr: (message: string) => void;
  exitProcess: (code: number) => never;
  exitBadConfig: (message: string) => never;
  requireStrongProductionSecret: (
    label: string,
    raw: string | null | undefined,
  ) => void;
  isStrongProductionSecret: (raw: string | null | undefined) => boolean;
  normalizeEnvValue: (raw: string | undefined) => string;
  minProductionSecretLength: number;
  devDiscordBotWebhookSecret: string;
};

function collectConfiguredOrigins(
  corsOrigin: string | string[] | true,
): Set<string> {
  if (corsOrigin === true) return new Set();
  if (typeof corsOrigin === 'string') return new Set([corsOrigin]);
  return new Set(corsOrigin);
}

function validateDeployPublicUrlOrigins(
  config: ConfigValidationInput,
  deps: ValidateConfigDeps,
): void {
  const allowed = collectConfiguredOrigins(config.corsOrigin);
  if (allowed.size === 0) return;
  const urls = [
    ['ECHO_APP_PUBLIC_URL', config.echoAppPublicUrl],
    ['ECHO_API_PUBLIC_URL', config.echoApiPublicUrl],
    ['ECHO_MARKETING_PUBLIC_URL', config.echoMarketingPublicUrl],
  ] as const;
  for (const [label, raw] of urls) {
    const trimmed = deps.normalizeEnvValue(raw);
    if (!trimmed) {
      deps.exitBadConfig(`${label} must be set to a valid absolute URL.`);
    }
    let origin: string;
    try {
      origin = new URL(trimmed).origin;
    } catch {
      deps.exitBadConfig(`${label} must be a valid absolute URL.`);
      return;
    }
    if (!allowed.has(origin)) {
      deps.exitBadConfig(
        `${label} origin ${origin} must be included in CORS_ORIGIN allowlist to prevent open-redirect style OAuth and email flows.`,
      );
    }
  }
}

/**
 * Post-build config validation: numeric bounds, production gates, deploy URL alignment, trust proxy.
 */
export function validateConfig(
  config: ConfigValidationInput,
  deps: ValidateConfigDeps,
): void {
  if (
    !Number.isInteger(config.port) ||
    config.port < 1 ||
    config.port > 65_535
  ) {
    deps.configStderr(
      `Invalid PORT specified: ${process.env.PORT}. Use an integer between 1 and 65535.`,
    );
    deps.exitProcess(1);
  }

  if (
    isNaN(config.bcryptSaltRounds) ||
    config.bcryptSaltRounds < 4 ||
    config.bcryptSaltRounds > 15
  ) {
    deps.configStderr(
      `Invalid BCRYPT_SALT_ROUNDS specified: ${process.env.BCRYPT_SALT_ROUNDS}. Use an integer between 4 and 15.`,
    );
    deps.exitProcess(1);
  }

  if (isNaN(config.refreshTokenTtlDays) || config.refreshTokenTtlDays < 1) {
    deps.configStderr(
      `Invalid REFRESH_TOKEN_TTL_DAYS specified: ${process.env.REFRESH_TOKEN_TTL_DAYS}. Use an integer >= 1.`,
    );
    deps.exitProcess(1);
  }

  if (
    config.snowflakeWorkerId < 0 ||
    config.snowflakeWorkerId > 31 ||
    config.snowflakeDatacenterId < 0 ||
    config.snowflakeDatacenterId > 31
  ) {
    deps.configStderr(
      'Invalid SNOWFLAKE_WORKER_ID or SNOWFLAKE_DATACENTER_ID: each must be an integer 0–31.',
    );
    deps.exitProcess(1);
  }

  if (config.isProduction) {
    const productionGateInput: EchoProductionConfigGateInput = {
      isProduction: config.isProduction,
      backendStorageMode: config.backendStorageMode,
      jwtSecret: config.jwtSecret,
      echoRequireGuestBindingSecretInProduction:
        config.echoRequireGuestBindingSecretInProduction,
      echoGuestBindingSecret: config.echoGuestBindingSecret,
      databaseUrl: config.databaseUrl,
      echoTelnyxApiKey: config.echoTelnyxApiKey,
      echoSmsOtpPepper: config.echoSmsOtpPepper,
      echo2faEncryptionKey: config.echo2faEncryptionKey,
      authLegacyBearer: config.authLegacyBearer,
      authNativeBearer: config.authNativeBearer,
      echoRequireRedisInProduction: config.echoRequireRedisInProduction,
      redisUrl: config.redisUrl,
      echoLocalUploadDir: config.echoLocalUploadDir,
      localUploadTokenSecret: config.localUploadTokenSecret,
      echoDiscordBotWebhookSecret: config.echoDiscordBotWebhookSecret,
      echoRequireMetricsScrapeTokenInProduction:
        config.echoRequireMetricsScrapeTokenInProduction,
      echoMetricsScrapeToken: config.echoMetricsScrapeToken,
      echoAgentNetworkDiagnosticsEnabled:
        config.echoAgentNetworkDiagnosticsEnabled,
      echoAgentNetworkDiagnosticsToken: config.echoAgentNetworkDiagnosticsToken,
      echoSmtpHost: config.echoSmtpHost,
      echoRequireMediaUrlHardeningInProduction:
        config.echoRequireMediaUrlHardeningInProduction,
      echoMediaUrlRequireHttps: config.echoMediaUrlRequireHttps,
      echoMediaUrlAllowedHosts: config.echoMediaUrlAllowedHosts,
      liveKitEnabled: config.liveKitEnabled,
      liveKitPublicUrl: config.liveKitPublicUrl,
      voiceSidecarEnabled: config.voiceSidecarEnabled,
      echoVideoHlsWorker: config.echoVideoHlsWorker,
      echoAllowEmbeddedVideoHls: config.echoAllowEmbeddedVideoHls,
    };
    assertEchoProductionConfigGates(productionGateInput, {
      configStderr: deps.configStderr,
      exitProcess: deps.exitProcess,
      requireStrongProductionSecret: deps.requireStrongProductionSecret,
      isStrongProductionSecret: deps.isStrongProductionSecret,
      normalizeEnvValue: deps.normalizeEnvValue,
      minProductionSecretLength: deps.minProductionSecretLength,
      devDiscordBotWebhookSecret: deps.devDiscordBotWebhookSecret,
    });
  }

  if (
    !config.isProduction &&
    config.backendStorageMode === 'postgres' &&
    !deps.isStrongProductionSecret(config.jwtSecret)
  ) {
    deps.configStderr(
      `JWT_SECRET must be a strong random value when ECHO_BACKEND_STORAGE=postgres outside pure in-memory dev (at least ${deps.minProductionSecretLength} characters; built-in defaults like dev-insecure-secret are not permitted).`,
    );
    deps.exitProcess(1);
  }

  if (config.isProduction || config.backendStorageMode === 'postgres') {
    validateDeployPublicUrlOrigins(config, deps);
  }

  if (config.isProduction && !config.trustProxy) {
    deps.configStderr(
      'ECHO_TRUST_PROXY must be true in production when the API sits behind a reverse proxy so rate limits and audit digests use the real client IP.',
    );
    deps.exitProcess(1);
  }
}

export const defaultValidateConfigDeps: ValidateConfigDeps = {
  configStderr,
  exitProcess: (code) => {
    throw new ConfigFatalError(`config validation failed (exit ${code})`);
  },
  exitBadConfig,
  requireStrongProductionSecret,
  isStrongProductionSecret,
  normalizeEnvValue,
  minProductionSecretLength: MIN_PRODUCTION_SECRET_LENGTH,
  devDiscordBotWebhookSecret: DEV_DISCORD_BOT_WEBHOOK_SECRET,
};
