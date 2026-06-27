import type { InstancePolicy } from '../../../../shared/instancePolicy';
import {
  envBool,
  envFloat,
  envInt,
  envSet,
  envStr,
  setNested,
} from './envOverrideHelpers';

export function applyGeneralEnvOverrides(root: Record<string, unknown>): void {
  const appUrl = envStr('ECHO_APP_PUBLIC_URL');
  const apiUrl = envStr('ECHO_API_PUBLIC_URL');
  const marketingUrl = envStr('ECHO_MARKETING_PUBLIC_URL');
  if (appUrl) setNested(root, ['general', 'publicUrls', 'app'], appUrl);
  if (apiUrl) setNested(root, ['general', 'publicUrls', 'api'], apiUrl);
  if (marketingUrl) {
    setNested(root, ['general', 'publicUrls', 'marketing'], marketingUrl);
  }
}

export function applyRegistrationEnvOverrides(
  root: Record<string, unknown>,
): void {
  const registrationDisabled = envBool('ECHO_REGISTRATION_DISABLED');
  if (registrationDisabled !== undefined) {
    setNested(root, ['registration', 'disabled'], registrationDisabled);
  }
  const requireEmailVerification = envBool('ECHO_REQUIRE_EMAIL_VERIFICATION');
  if (requireEmailVerification !== undefined) {
    setNested(
      root,
      ['registration', 'requireEmailVerification'],
      requireEmailVerification,
    );
  }
  const hwidCap = envBool('ECHO_AUTH_HWID_ACCOUNT_CAP');
  if (hwidCap !== undefined) {
    setNested(root, ['registration', 'hwidCap', 'enabled'], hwidCap);
  }
  const hwidMax = envInt('ECHO_AUTH_HWID_MAX_ACCOUNTS_PER_KEY_IP');
  if (hwidMax !== undefined) {
    setNested(
      root,
      ['registration', 'hwidCap', 'maxAccountsPerKeyIp'],
      hwidMax,
    );
  }
}

export function applyGuestEnvOverrides(root: Record<string, unknown>): void {
  const guestEnabled = envBool('ECHO_GUEST_ACCOUNTS_ENABLED');
  if (guestEnabled !== undefined) {
    setNested(root, ['guest', 'enabled'], guestEnabled);
  }
  const guestMaxMsgs = envInt('ECHO_GUEST_MAX_TOTAL_MESSAGES');
  if (guestMaxMsgs !== undefined) {
    setNested(root, ['guest', 'maxTotalMessages'], guestMaxMsgs);
  }
  const guestPool = envInt('ECHO_GUEST_DIRECTORY_POOL_SIZE');
  if (guestPool !== undefined) {
    setNested(root, ['guest', 'directory', 'poolSize'], guestPool);
  }
  const guestSample = envInt('ECHO_GUEST_SERVER_SAMPLE_COUNT');
  if (guestSample !== undefined) {
    setNested(root, ['guest', 'serverSampleCount'], guestSample);
  }
  const guestMintHour = envInt('ECHO_GUEST_MINT_MAX_PER_IP_HOUR');
  if (guestMintHour !== undefined) {
    setNested(root, ['guest', 'mint', 'maxPerIpPerHour'], guestMintHour);
  }
  const guestCaptchaAfter = envInt('ECHO_GUEST_MINT_CAPTCHA_AFTER_N');
  if (guestCaptchaAfter !== undefined) {
    setNested(root, ['guest', 'mint', 'captchaAfterN'], guestCaptchaAfter);
  }
  const guestFailThreshold = envInt('ECHO_GUEST_CAPTCHA_FAIL_BLOCK_THRESHOLD');
  if (guestFailThreshold !== undefined) {
    setNested(
      root,
      ['guest', 'captcha', 'failBlockThreshold'],
      guestFailThreshold,
    );
  }
  const guestFailHours = envFloat('ECHO_GUEST_CAPTCHA_FAIL_BLOCK_HOURS');
  if (guestFailHours !== undefined) {
    setNested(root, ['guest', 'captcha', 'failBlockHours'], guestFailHours);
  }
  const guestComboMin = envInt('ECHO_GUEST_ABUSE_COMBO_BLOCK_MINUTES');
  if (guestComboMin !== undefined) {
    setNested(root, ['guest', 'abuseComboBlockMinutes'], guestComboMin);
  }
  const turnstileSite = envStr('ECHO_TURNSTILE_SITE_KEY');
  if (turnstileSite !== undefined) {
    setNested(root, ['guest', 'turnstile', 'siteKey'], turnstileSite);
  }
}

export function applyLimitsEnvOverrides(
  root: Record<string, unknown>,
  isProduction: boolean,
): void {
  const socketPerMin = envInt('ECHO_SOCKET_MSG_PER_MINUTE');
  if (socketPerMin !== undefined) {
    setNested(root, ['limits', 'socket', 'messagesPerMinute'], socketPerMin);
  }
  const socketBurstMax = envInt('ECHO_SOCKET_BURST_MAX');
  if (socketBurstMax !== undefined) {
    setNested(root, ['limits', 'socket', 'burst', 'max'], socketBurstMax);
  }
  const socketBurstMs = envInt('ECHO_SOCKET_BURST_WINDOW_MS');
  if (socketBurstMs !== undefined) {
    setNested(root, ['limits', 'socket', 'burst', 'windowMs'], socketBurstMs);
  }
  const socketEvents = envInt('ECHO_SOCKET_MAX_EVENTS_PER_SEC');
  if (socketEvents !== undefined) {
    setNested(root, ['limits', 'socket', 'maxEventsPerSecond'], socketEvents);
  }
  const idempotencyMin = envInt('ECHO_MESSAGE_IDEMPOTENCY_MINUTES');
  if (idempotencyMin !== undefined) {
    setNested(root, ['limits', 'socket', 'idempotencyMinutes'], idempotencyMin);
  }

  const serperPerMin = envInt('SERPER_RATE_LIMIT_PER_MINUTE');
  if (serperPerMin !== undefined) {
    setNested(
      root,
      ['limits', 'upstream', 'serper', 'perMinute'],
      serperPerMin,
    );
  }
  const serperDayIp = envInt('SERPER_UPSTREAM_MAX_PER_DAY_PER_IP');
  if (serperDayIp !== undefined) {
    setNested(
      root,
      ['limits', 'upstream', 'serper', 'maxPerDayPerIp'],
      serperDayIp,
    );
  }
  const serperGlobalDay = envInt('SERPER_GLOBAL_MAX_PER_DAY');
  if (serperGlobalDay !== undefined) {
    setNested(
      root,
      ['limits', 'upstream', 'serper', 'globalMaxPerDay'],
      serperGlobalDay,
    );
  }
  const serperGlobalMonth = envInt('SERPER_GLOBAL_MAX_PER_MONTH');
  if (serperGlobalMonth !== undefined) {
    setNested(
      root,
      ['limits', 'upstream', 'serper', 'globalMaxPerMonth'],
      serperGlobalMonth,
    );
  }
  const honchoPerMin = envInt('HONCHO_RATE_LIMIT_PER_MINUTE');
  if (honchoPerMin !== undefined) {
    setNested(
      root,
      ['limits', 'upstream', 'honcho', 'perMinute'],
      honchoPerMin,
    );
  }
  const discordImportDay = envInt('ECHO_DISCORD_IMPORT_MAX_PER_USER_PER_DAY');
  if (discordImportDay !== undefined) {
    setNested(
      root,
      ['limits', 'upstream', 'discordImport', 'maxMetadataStartsPerUserPerDay'],
      discordImportDay,
    );
  } else if (
    isProduction &&
    !envSet('ECHO_DISCORD_IMPORT_MAX_PER_USER_PER_DAY')
  ) {
    void 0;
  }

  const mfaLoginMax = envInt('ECHO_MFA_LOGIN_MAX_PER_IP_PER_15MIN');
  if (mfaLoginMax !== undefined) {
    setNested(
      root,
      ['limits', 'http', 'routes', 'auth', 'mfaLogin', 'max'],
      mfaLoginMax,
    );
  }
}

/**
 * Env overrides for instance policy fields. Only keys present in the environment
 * are returned (env wins over file defaults).
 */
export function buildInstancePolicyEnvOverrides(
  isProduction: boolean,
): Partial<InstancePolicy> {
  const root: Record<string, unknown> = {};
  applyGeneralEnvOverrides(root);
  applyRegistrationEnvOverrides(root);
  applyGuestEnvOverrides(root);
  applyLimitsEnvOverrides(root, isProduction);
  return root as Partial<InstancePolicy>;
}
