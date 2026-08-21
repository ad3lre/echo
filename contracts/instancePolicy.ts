import {
  MAX_REGISTER_USERNAME_LENGTH,
  MIN_REGISTER_USERNAME_LENGTH,
} from './usernamePolicy';

/** Fastify `@fastify/rate-limit` time window string. */
export type RateLimitTimeWindow = '1 minute' | '15 minutes' | '1 hour';

export type HttpRateLimitBucket = {
  max: number;
  timeWindow: RateLimitTimeWindow;
};

export type VoiceRegionLabel = {
  id: string;
  name: string;
  /** When true, clients may treat this as the recommended region. */
  optimal?: boolean;
};

export type InstancePolicyGeneral = {
  instanceName: string;
  instanceDescription: string;
  publicUrls: {
    app: string;
    api: string;
    marketing: string;
  };
};

export type InstancePolicyRegistration = {
  disabled: boolean;
  requireEmailVerification: boolean;
  username: {
    minLength: number;
    maxLength: number;
  };
  password: {
    minLength: number;
  };
  hwidCap: {
    enabled: boolean;
    maxAccountsPerKeyIp: number;
  };
};

export type InstancePolicyGuest = {
  enabled: boolean;
  maxTotalMessages: number;
  directory: {
    poolSize: number;
  };
  serverSampleCount: number;
  mint: {
    maxPerIpPerHour: number;
    captchaAfterN: number;
  };
  captcha: {
    failBlockThreshold: number;
    failBlockHours: number;
  };
  abuseComboBlockMinutes: number;
  turnstile: {
    siteKey: string;
  };
};

export type InstancePolicySocketLimits = {
  messagesPerMinute: number;
  burst: {
    max: number;
    windowMs: number;
  };
  maxEventsPerSecond: number;
  idempotencyMinutes: number;
};

export type InstancePolicyHttpRouteLimits = {
  auth: {
    register: HttpRateLimitBucket;
    login: HttpRateLimitBucket;
    loginStrict: HttpRateLimitBucket;
    guestMint: HttpRateLimitBucket;
    verifyEmail: HttpRateLimitBucket;
    forgotPassword: HttpRateLimitBucket;
    resetPassword: HttpRateLimitBucket;
    mfaLogin: HttpRateLimitBucket;
    mfaLoginStrict: HttpRateLimitBucket;
  };
  mutations: {
    discordImportBind: HttpRateLimitBucket;
    discordImportRunFull: HttpRateLimitBucket;
    discordImportChannel: HttpRateLimitBucket;
    discordImportRefresh: HttpRateLimitBucket;
    e2eeDeviceMutation: HttpRateLimitBucket;
    emojiUsage: HttpRateLimitBucket;
    discordBridgePut: HttpRateLimitBucket;
    passkeyCeremony: HttpRateLimitBucket;
    authProfilePatch: HttpRateLimitBucket;
    messagePatch: HttpRateLimitBucket;
    mlsWrite: HttpRateLimitBucket;
    mlsRead: HttpRateLimitBucket;
    readStateWrite: HttpRateLimitBucket;
  };
};

export type InstancePolicyHttpLimits = {
  global: {
    maxPerMinute: number;
  };
  echoApi: {
    maxPerMinute: number;
  };
  authSessionRead: {
    maxPerMinute: number;
  };
  routes: InstancePolicyHttpRouteLimits;
  absolute: {
    register: {
      enabled: boolean;
      max: number;
      windowMs: number;
    };
    messages: {
      enabled: boolean;
      max: number;
      windowMs: number;
    };
  };
};

export type InstancePolicyUpstreamLimits = {
  serper: {
    perMinute: number;
    maxPerDayPerIp: number;
    globalMaxPerDay: number;
    globalMaxPerMonth: number;
  };
  honcho: {
    perMinute: number;
  };
  discordImport: {
    maxMetadataStartsPerUserPerDay: number;
  };
};

export type InstancePolicyRegions = {
  voice: {
    default: string;
    available: VoiceRegionLabel[];
  };
};

/** Full merged instance policy (operational knobs only). */
export type InstancePolicy = {
  general: InstancePolicyGeneral;
  registration: InstancePolicyRegistration;
  guest: InstancePolicyGuest;
  limits: {
    socket: InstancePolicySocketLimits;
    http: InstancePolicyHttpLimits;
    upstream: InstancePolicyUpstreamLimits;
  };
  regions: InstancePolicyRegions;
};

export type InstancePolicyPublic = {
  general: Pick<
    InstancePolicyGeneral,
    'instanceName' | 'instanceDescription' | 'publicUrls'
  >;
  registration: Pick<InstancePolicyRegistration, 'disabled'>;
  guest: Pick<
    InstancePolicyGuest,
    'enabled' | 'maxTotalMessages' | 'serverSampleCount'
  > & {
    turnstileSiteKey: string;
  };
  regions: InstancePolicyRegions;
};

export const DEFAULT_INSTANCE_POLICY: InstancePolicy = {
  general: {
    instanceName: 'Echo Instance',
    instanceDescription: 'A self-hosted Echo communications instance',
    publicUrls: {
      app: 'http://localhost:8080',
      api: 'http://localhost:3000',
      marketing: 'https://app-echo.net',
    },
  },
  registration: {
    disabled: false,
    requireEmailVerification: true,
    username: {
      minLength: MIN_REGISTER_USERNAME_LENGTH,
      maxLength: MAX_REGISTER_USERNAME_LENGTH,
    },
    password: {
      minLength: 8,
    },
    hwidCap: {
      enabled: false,
      maxAccountsPerKeyIp: 3,
    },
  },
  guest: {
    enabled: false,
    maxTotalMessages: 300,
    directory: {
      poolSize: 15,
    },
    serverSampleCount: 3,
    mint: {
      maxPerIpPerHour: 12,
      captchaAfterN: 0,
    },
    captcha: {
      failBlockThreshold: 5,
      failBlockHours: 24,
    },
    abuseComboBlockMinutes: 30,
    turnstile: {
      siteKey: '',
    },
  },
  limits: {
    socket: {
      messagesPerMinute: 60,
      burst: {
        max: 20,
        windowMs: 2000,
      },
      maxEventsPerSecond: 80,
      idempotencyMinutes: 10,
    },
    http: {
      global: {
        maxPerMinute: 150,
      },
      echoApi: {
        maxPerMinute: 500,
      },
      authSessionRead: {
        maxPerMinute: 300,
      },
      routes: {
        auth: {
          register: { max: 25, timeWindow: '1 hour' },
          login: { max: 80, timeWindow: '15 minutes' },
          loginStrict: { max: 20, timeWindow: '1 hour' },
          guestMint: { max: 20, timeWindow: '15 minutes' },
          verifyEmail: { max: 20, timeWindow: '15 minutes' },
          forgotPassword: { max: 3, timeWindow: '1 hour' },
          resetPassword: { max: 15, timeWindow: '1 hour' },
          mfaLogin: { max: 60, timeWindow: '15 minutes' },
          mfaLoginStrict: { max: 20, timeWindow: '1 hour' },
        },
        mutations: {
          discordImportBind: { max: 10, timeWindow: '1 hour' },
          discordImportRunFull: { max: 3, timeWindow: '1 hour' },
          discordImportChannel: { max: 20, timeWindow: '1 hour' },
          discordImportRefresh: { max: 3, timeWindow: '1 hour' },
          e2eeDeviceMutation: { max: 30, timeWindow: '15 minutes' },
          emojiUsage: { max: 120, timeWindow: '15 minutes' },
          discordBridgePut: { max: 30, timeWindow: '15 minutes' },
          passkeyCeremony: { max: 12, timeWindow: '15 minutes' },
          authProfilePatch: { max: 30, timeWindow: '15 minutes' },
          messagePatch: { max: 60, timeWindow: '1 minute' },
          mlsWrite: { max: 60, timeWindow: '1 minute' },
          mlsRead: { max: 120, timeWindow: '1 minute' },
          readStateWrite: { max: 600, timeWindow: '1 minute' },
        },
      },
      absolute: {
        register: {
          enabled: false,
          max: 25,
          windowMs: 3_600_000,
        },
        messages: {
          enabled: false,
          max: 200,
          windowMs: 60_000,
        },
      },
    },
    upstream: {
      serper: {
        perMinute: 10,
        maxPerDayPerIp: 180,
        globalMaxPerDay: 500,
        globalMaxPerMonth: 10_000,
      },
      honcho: {
        perMinute: 20,
      },
      discordImport: {
        maxMetadataStartsPerUserPerDay: 0,
      },
    },
  },
  regions: {
    voice: {
      default: 'auto',
      available: [],
    },
  },
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Deep-merge partial policy onto defaults (arrays replaced, objects merged). */
export function deepMergeInstancePolicy(
  base: InstancePolicy,
  partial: unknown,
): InstancePolicy {
  if (!isPlainObject(partial)) return base;
  return deepMergeObjects(
    base as unknown as Record<string, unknown>,
    partial,
  ) as unknown as InstancePolicy;
}

function deepMergeObjects(
  base: Record<string, unknown>,
  partial: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(partial)) {
    if (value === undefined) continue;
    const existing = out[key];
    if (isPlainObject(existing) && isPlainObject(value)) {
      out[key] = deepMergeObjects(existing, value);
    } else {
      out[key] = value;
    }
  }
  return out;
}

export function toInstancePolicyPublic(
  policy: InstancePolicy,
): InstancePolicyPublic {
  return {
    general: {
      instanceName: policy.general.instanceName,
      instanceDescription: policy.general.instanceDescription,
      publicUrls: { ...policy.general.publicUrls },
    },
    registration: {
      disabled: policy.registration.disabled,
    },
    guest: {
      enabled: policy.guest.enabled,
      maxTotalMessages: policy.guest.maxTotalMessages,
      serverSampleCount: policy.guest.serverSampleCount,
      turnstileSiteKey: policy.guest.turnstile.siteKey,
    },
    regions: {
      voice: {
        default: policy.regions.voice.default,
        available: policy.regions.voice.available.map((r) => ({ ...r })),
      },
    },
  };
}
