import type {
  HttpRateLimitBucket,
  InstancePolicy,
  RateLimitTimeWindow,
} from '../../../../shared/instancePolicy';
import {
  MAX_REGISTER_USERNAME_LENGTH,
  MIN_REGISTER_USERNAME_LENGTH,
} from '../../../../shared/usernamePolicy';

const RATE_WINDOWS = new Set<RateLimitTimeWindow>([
  '1 minute',
  '15 minutes',
  '1 hour',
]);

export class InstancePolicyValidationError extends Error {
  readonly issues: string[];

  constructor(issues: string[]) {
    super(
      issues.length === 1
        ? `Invalid instance policy: ${issues[0]}`
        : `Invalid instance policy (${issues.length} issues):\n- ${issues.join('\n- ')}`,
    );
    this.name = 'InstancePolicyValidationError';
    this.issues = issues;
  }
}

function pushIf(condition: boolean, issues: string[], message: string): void {
  if (condition) issues.push(message);
}

function validateRateBucket(
  label: string,
  bucket: HttpRateLimitBucket,
  issues: string[],
): void {
  pushIf(
    !Number.isFinite(bucket.max) || bucket.max < 1,
    issues,
    `${label}.max must be >= 1`,
  );
  pushIf(
    !RATE_WINDOWS.has(bucket.timeWindow),
    issues,
    `${label}.timeWindow must be one of: ${[...RATE_WINDOWS].join(', ')}`,
  );
}

function validateRouteBuckets(
  routes: InstancePolicy['limits']['http']['routes'],
  issues: string[],
): void {
  for (const [group, buckets] of Object.entries(routes) as [
    string,
    Record<string, HttpRateLimitBucket>,
  ][]) {
    for (const [name, bucket] of Object.entries(buckets)) {
      validateRateBucket(`limits.http.routes.${group}.${name}`, bucket, issues);
    }
  }
}

function validateVoiceRegions(
  regions: InstancePolicy['regions']['voice'],
  issues: string[],
): void {
  const ids = new Set<string>();
  for (const region of regions.available) {
    pushIf(
      !region.id.trim(),
      issues,
      'regions.voice.available[].id is required',
    );
    pushIf(
      !region.name.trim(),
      issues,
      'regions.voice.available[].name is required',
    );
    if (region.id.trim()) {
      pushIf(
        ids.has(region.id),
        issues,
        `duplicate voice region id: ${region.id}`,
      );
      ids.add(region.id);
    }
  }
  if (
    regions.default !== 'auto' &&
    regions.available.length > 0 &&
    !ids.has(regions.default)
  ) {
    issues.push(
      `regions.voice.default "${regions.default}" is not listed in available[]`,
    );
  }
}

export type ValidateInstancePolicyContext = {
  isProduction: boolean;
  turnstileSecretConfigured: boolean;
};

export function validateInstancePolicy(
  policy: InstancePolicy,
  ctx: ValidateInstancePolicyContext = {
    isProduction: false,
    turnstileSecretConfigured: false,
  },
): void {
  const issues: string[] = [];

  pushIf(
    !policy.general.instanceName.trim(),
    issues,
    'general.instanceName is required',
  );

  pushIf(
    policy.registration.username.minLength < 1 ||
      policy.registration.username.maxLength <
        policy.registration.username.minLength,
    issues,
    'registration.username minLength/maxLength are invalid',
  );
  pushIf(
    policy.registration.username.minLength < MIN_REGISTER_USERNAME_LENGTH ||
      policy.registration.username.maxLength > MAX_REGISTER_USERNAME_LENGTH,
    issues,
    `registration.username length must stay within ${MIN_REGISTER_USERNAME_LENGTH}–${MAX_REGISTER_USERNAME_LENGTH}`,
  );
  pushIf(
    policy.registration.password.minLength < 6,
    issues,
    'registration.password.minLength must be >= 6',
  );
  pushIf(
    policy.registration.hwidCap.maxAccountsPerKeyIp < 1 ||
      policy.registration.hwidCap.maxAccountsPerKeyIp > 50,
    issues,
    'registration.hwidCap.maxAccountsPerKeyIp must be 1–50',
  );

  pushIf(
    policy.guest.maxTotalMessages < 10,
    issues,
    'guest.maxTotalMessages must be >= 10',
  );
  pushIf(
    policy.guest.directory.poolSize < 3 || policy.guest.directory.poolSize > 50,
    issues,
    'guest.directory.poolSize must be 3–50',
  );
  pushIf(
    policy.guest.serverSampleCount < 1 || policy.guest.serverSampleCount > 10,
    issues,
    'guest.serverSampleCount must be 1–10',
  );
  pushIf(
    policy.guest.serverSampleCount > policy.guest.directory.poolSize,
    issues,
    'guest.serverSampleCount must be <= guest.directory.poolSize',
  );
  pushIf(
    policy.guest.mint.maxPerIpPerHour < 1 ||
      policy.guest.mint.maxPerIpPerHour > 200,
    issues,
    'guest.mint.maxPerIpPerHour must be 1–200',
  );
  pushIf(
    policy.guest.mint.captchaAfterN > 0 &&
      !ctx.turnstileSecretConfigured &&
      !policy.guest.turnstile.siteKey.trim(),
    issues,
    'guest.mint.captchaAfterN > 0 requires ECHO_TURNSTILE_SECRET_KEY or guest.turnstile.siteKey',
  );

  pushIf(
    policy.limits.socket.messagesPerMinute < 1,
    issues,
    'limits.socket.messagesPerMinute must be >= 1',
  );
  pushIf(
    policy.limits.socket.burst.max < 1,
    issues,
    'limits.socket.burst.max must be >= 1',
  );
  pushIf(
    policy.limits.socket.burst.windowMs < 100,
    issues,
    'limits.socket.burst.windowMs must be >= 100',
  );
  pushIf(
    policy.limits.socket.maxEventsPerSecond < 1,
    issues,
    'limits.socket.maxEventsPerSecond must be >= 1',
  );
  pushIf(
    policy.limits.socket.idempotencyMinutes < 1,
    issues,
    'limits.socket.idempotencyMinutes must be >= 1',
  );

  pushIf(
    policy.limits.http.global.maxPerMinute < 1,
    issues,
    'limits.http.global.maxPerMinute must be >= 1',
  );
  pushIf(
    policy.limits.http.echoApi.maxPerMinute < 1,
    issues,
    'limits.http.echoApi.maxPerMinute must be >= 1',
  );
  validateRouteBuckets(policy.limits.http.routes, issues);

  pushIf(
    policy.limits.upstream.serper.perMinute < 0,
    issues,
    'limits.upstream.serper.perMinute must be >= 0',
  );
  pushIf(
    policy.limits.upstream.discordImport.maxMetadataStartsPerUserPerDay < 0,
    issues,
    'limits.upstream.discordImport.maxMetadataStartsPerUserPerDay must be >= 0',
  );

  validateVoiceRegions(policy.regions.voice, issues);

  if (issues.length > 0) {
    throw new InstancePolicyValidationError(issues);
  }
}
