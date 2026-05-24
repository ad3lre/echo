import assert from 'node:assert/strict';
import path from 'node:path';

class ExitError extends Error {
  code: number;
  constructor(code: number) {
    super(`process.exit(${code})`);
    this.code = code;
  }
}

function setEnv(next: Record<string, string | undefined>): () => void {
  const prev: Record<string, string | undefined> = {};
  for (const k of Object.keys(next)) {
    prev[k] = process.env[k];
    const v = next[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  return () => {
    for (const k of Object.keys(next)) {
      const v = prev[k];
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  };
}

function withExitIntercept<T>(
  fn: () => T,
): { ok: true; value: T } | { ok: false; exit: ExitError } {
  const origExit = process.exit;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (process as any).exit = ((code?: number) => {
    throw new ExitError(typeof code === 'number' ? code : 0);
  }) as unknown as typeof process.exit;
  try {
    return { ok: true, value: fn() };
  } catch (e) {
    if (e instanceof ExitError) return { ok: false, exit: e };
    throw e;
  } finally {
    process.exit = origExit;
  }
}

function clearModule(id: string) {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const resolved = require.resolve(id);
  // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
  delete require.cache[resolved];
}

function clearRequireCacheBySubstring(substrings: string[]) {
  for (const k of Object.keys(require.cache)) {
    if (substrings.some((s) => k.includes(s))) {
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
      delete require.cache[k];
    }
  }
}

function clearConfigAndDependents() {
  clearModule('../config');
  clearRequireCacheBySubstring([
    `${path.sep}backend${path.sep}src${path.sep}config.`,
  ]);
}

/** Minimal env so production config evaluation passes all gates (no DB connect at import). */
function baseProductionEnv(): Record<string, string> {
  return {
    ECHO_CONFIG_TEST_ISOLATION: '1',
    NODE_ENV: 'production',
    ECHO_BACKEND_STORAGE: 'postgres',
    DATABASE_URL: 'postgresql://echo:echo@127.0.0.1:5432/echo',
    JWT_SECRET: 'jwt-0123456789abcdef0123456789abcdef01234567',
    // Local uploads default on when S3 is unset; token must be strong and != JWT_SECRET.
    LOCAL_UPLOAD_TOKEN_SECRET: 'local-upload-0123456789abcdef0123456789abcdef',
    ECHO_GUEST_BINDING_SECRET: 'guest-binding-0123456789abcdef0123456789abcdef',
    ECHO_2FA_ENCRYPTION_KEY:
      '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    REDIS_URL: 'redis://127.0.0.1:6379',
    CORS_ORIGIN: 'https://app.example.com',
    ECHO_METRICS_SCRAPE_TOKEN: 'metrics-0123456789abcdef0123456789abcdef',
    ECHO_MEDIA_URL_REQUIRE_HTTPS: 'true',
    USE_MOCK_DB: '',
    ECHO_AUTH_STORE: '',
    // Repo `.env` may enable LiveKit; empty values prevent dotenv from filling these keys.
    LIVEKIT_API_KEY: '',
    LIVEKIT_API_SECRET: '',
    LIVEKIT_PUBLIC_URL: '',
  };
}

async function run(): Promise<void> {
  const okBase = { ...baseProductionEnv() };
  {
    const restore = setEnv(okBase);
    clearConfigAndDependents();
    const out = withExitIntercept(() => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      require('../config');
    });
    restore();
    clearConfigAndDependents();
    assert.equal(out.ok, true, 'expected production base env to load config');
  }

  const assertProdGateFails = (
    overrides: Record<string, string | undefined>,
    label: string,
  ) => {
    const restore = setEnv({ ...okBase, ...overrides });
    clearConfigAndDependents();
    const out = withExitIntercept(() => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      require('../config');
    });
    restore();
    clearConfigAndDependents();
    assert.equal(out.ok, false, `expected exit for ${label}`);
    assert.equal(out.ok ? 0 : out.exit.code, 1);
  };

  assertProdGateFails({ CORS_ORIGIN: '' }, 'empty CORS_ORIGIN');
  assertProdGateFails({ CORS_ORIGIN: '   ' }, 'whitespace-only CORS_ORIGIN');
  assertProdGateFails({ CORS_ORIGIN: '*' }, 'CORS_ORIGIN=*');
  assertProdGateFails({ JWT_SECRET: '' }, 'empty JWT_SECRET');
  assertProdGateFails({ JWT_SECRET: '   ' }, 'whitespace-only JWT_SECRET');
  assertProdGateFails({ JWT_SECRET: 'dev-insecure-secret' }, 'dev JWT_SECRET');
  assertProdGateFails({ JWT_SECRET: 'short' }, 'short JWT_SECRET');
  assertProdGateFails(
    { JWT_SECRET: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' },
    'repeated-character JWT_SECRET',
  );
  assertProdGateFails({ ECHO_METRICS_SCRAPE_TOKEN: '' }, 'empty metrics token');
  assertProdGateFails(
    { ECHO_METRICS_SCRAPE_TOKEN: '   ' },
    'blank metrics token',
  );
  assertProdGateFails(
    { ECHO_METRICS_SCRAPE_TOKEN: 'short' },
    'short metrics token',
  );
  assertProdGateFails(
    {
      ECHO_AGENT_NETWORK_DIAG_ENABLED: 'true',
      ECHO_AGENT_NETWORK_DIAG_TOKEN: '',
    },
    'agent network diag enabled with empty token',
  );
  assertProdGateFails(
    {
      ECHO_AGENT_NETWORK_DIAG_ENABLED: 'true',
      ECHO_AGENT_NETWORK_DIAG_TOKEN: 'short',
    },
    'agent network diag enabled with short token',
  );
  assertProdGateFails(
    {
      ECHO_MEDIA_URL_REQUIRE_HTTPS: 'false',
      ECHO_MEDIA_URL_ALLOWED_HOSTS: '',
    },
    'no media URL hardening',
  );
  assertProdGateFails(
    {
      REDIS_URL: '',
      ECHO_REQUIRE_REDIS_IN_PRODUCTION: undefined,
    },
    'missing REDIS_URL with default require-redis',
  );
  assertProdGateFails(
    { ECHO_GUEST_BINDING_SECRET: '' },
    'empty guest binding secret',
  );
  assertProdGateFails(
    { ECHO_GUEST_BINDING_SECRET: '   ' },
    'whitespace-only guest binding secret',
  );
  assertProdGateFails(
    { ECHO_GUEST_BINDING_SECRET: 'short' },
    'short guest binding secret',
  );

  {
    const restore = setEnv({
      ...okBase,
      ECHO_METRICS_SCRAPE_TOKEN: '',
      ECHO_REQUIRE_METRICS_SCRAPE_TOKEN_IN_PRODUCTION: 'false',
    });
    clearConfigAndDependents();
    const out = withExitIntercept(() => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      require('../config');
    });
    restore();
    clearConfigAndDependents();
    assert.equal(
      out.ok,
      true,
      'single-process opt-out should allow missing metrics scrape token',
    );
  }

  {
    const restore = setEnv({
      ...okBase,
      ECHO_MEDIA_URL_REQUIRE_HTTPS: 'false',
      ECHO_MEDIA_URL_ALLOWED_HOSTS: '',
      ECHO_REQUIRE_MEDIA_URL_HARDENING_IN_PRODUCTION: 'false',
    });
    clearConfigAndDependents();
    const out = withExitIntercept(() => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      require('../config');
    });
    restore();
    clearConfigAndDependents();
    assert.equal(
      out.ok,
      true,
      'single-process opt-out should allow missing media URL hardening',
    );
  }

  {
    assertProdGateFails(
      {
        REDIS_URL: '',
        ECHO_REQUIRE_REDIS_IN_PRODUCTION: 'false',
      },
      'missing REDIS_URL with local uploads enabled',
    );

    const restore = setEnv({
      ...okBase,
      REDIS_URL: '',
      ECHO_REQUIRE_REDIS_IN_PRODUCTION: 'false',
      ECHO_LOCAL_UPLOADS: 'false',
    });
    clearConfigAndDependents();
    const out = withExitIntercept(() => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      require('../config');
    });
    restore();
    clearConfigAndDependents();
    assert.equal(
      out.ok,
      true,
      'single-process opt-out should allow missing REDIS_URL',
    );
  }

  {
    const restore = setEnv({
      ...okBase,
      ECHO_GUEST_BINDING_SECRET: '',
      ECHO_REQUIRE_GUEST_BINDING_SECRET_IN_PRODUCTION: 'false',
    });
    clearConfigAndDependents();
    const out = withExitIntercept(() => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      require('../config');
    });
    restore();
    clearConfigAndDependents();
    assert.equal(
      out.ok,
      true,
      'single-process opt-out should allow missing guest binding secret (derived from JWT_SECRET)',
    );
  }

  console.log('productionConfigGates: ok');
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
