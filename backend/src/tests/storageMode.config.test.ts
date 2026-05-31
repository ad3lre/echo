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

function resetProcessWideAuthAndSessionStores(): void {
  const g = globalThis as typeof globalThis & Record<symbol, unknown>;
  g[Symbol.for('echo.authStore.instance')] = null;
  const rt = g[Symbol.for('echo.serverSession.runtime')] as
    | {
        redisClient: { quit?: () => Promise<void> } | null;
        memSessions: Map<unknown, unknown>;
        memUserIndex: Map<unknown, unknown>;
      }
    | undefined;
  if (rt) {
    rt.memSessions.clear();
    rt.memUserIndex.clear();
    if (rt.redisClient) {
      void rt.redisClient.quit?.();
      rt.redisClient = null;
    }
  }
}

function clearBackendSingletonsForRestart() {
  resetProcessWideAuthAndSessionStores();
  // Config is evaluated at import-time. Clearing simulates a fresh process.
  // On Windows + ts-node, module IDs can vary, so clear by both resolve() and substring.
  clearModule('../config');
  clearModule('../db/pg');
  clearModule('../auth/store');
  clearModule('../auth/serverSession');
  clearModule('../domain/echoStore/bootstrap');
  clearRequireCacheBySubstring([
    `${path.sep}backend${path.sep}src${path.sep}config.`,
    `${path.sep}backend${path.sep}src${path.sep}db${path.sep}pg.`,
    `${path.sep}backend${path.sep}src${path.sep}auth${path.sep}store${path.sep}`,
    `${path.sep}backend${path.sep}src${path.sep}auth${path.sep}serverSession.`,
    `${path.sep}backend${path.sep}src${path.sep}domain${path.sep}echoStore${path.sep}bootstrap.`,
  ]);
}

async function run(): Promise<void> {
  const prevIsolation = process.env.ECHO_CONFIG_TEST_ISOLATION;
  process.env.ECHO_CONFIG_TEST_ISOLATION = '1';
  try {
    // --- strict ambiguity cases ---
    {
      const restore = setEnv({
        NODE_ENV: 'production',
        // Use empty strings (not undefined) so dotenv cannot repopulate from a local .env.
        ECHO_BACKEND_STORAGE: '',
        DATABASE_URL: '',
        USE_MOCK_DB: '',
        ECHO_AUTH_STORE: '',
      });
      clearBackendSingletonsForRestart();
      const out = withExitIntercept(() => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        require('../config');
      });
      restore();
      assert.equal(out.ok, false);
      assert.equal(out.ok ? 0 : out.exit.code, 1);
    }

    {
      const restore = setEnv({
        NODE_ENV: 'development',
        ECHO_BACKEND_STORAGE: 'postgres',
        DATABASE_URL: '',
        USE_MOCK_DB: '',
        ECHO_AUTH_STORE: '',
      });
      clearBackendSingletonsForRestart();
      const out = withExitIntercept(() => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        require('../config');
      });
      restore();
      assert.equal(out.ok, false);
    }

    {
      const restore = setEnv({
        NODE_ENV: 'development',
        ECHO_BACKEND_STORAGE: 'memory',
        DATABASE_URL: 'postgresql://example.invalid/db',
        USE_MOCK_DB: '',
        ECHO_AUTH_STORE: '',
      });
      clearBackendSingletonsForRestart();
      const out = withExitIntercept(() => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        require('../config');
      });
      restore();
      assert.equal(out.ok, false);
    }

    {
      const restore = setEnv({
        NODE_ENV: 'development',
        ECHO_BACKEND_STORAGE: 'postgres',
        DATABASE_URL: 'postgresql://example.invalid/db',
        USE_MOCK_DB: 'true',
        ECHO_AUTH_STORE: '',
      });
      clearBackendSingletonsForRestart();
      const out = withExitIntercept(() => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        require('../config');
      });
      restore();
      assert.equal(out.ok, false);
    }

    // --- restart regression: memory loses state ---
    {
      const restore = setEnv({
        NODE_ENV: 'development',
        ECHO_BACKEND_STORAGE: 'memory',
        DATABASE_URL: '',
        USE_MOCK_DB: '',
        ECHO_AUTH_STORE: '',
      });
      clearBackendSingletonsForRestart();
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { getAuthStore } = require('../auth/store');
      const store1 = getAuthStore().store;
      const username = `restart_mem_${Date.now().toString(36)}`;
      await store1.createUser({
        username,
        password: 'password123',
        email: `${username}@echo.test`,
        displayName: 'Restart Mem',
      });
      assert.ok(await store1.getUserByUsername(username));

      // Simulate a restart: clear singletons + reload auth store.
      clearBackendSingletonsForRestart();
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { getAuthStore: getAuthStore2 } = require('../auth/store');
      const store2 = getAuthStore2().store;
      const after = await store2.getUserByUsername(username);
      assert.equal(after, null);
      restore();
    }

    // --- restart regression: postgres retains state (skips if no test DB url) ---
    {
      const dbUrl = process.env.PG_TEST_URL;
      if (!dbUrl) {
        console.log(
          'storageMode.config.test: skip postgres restart (no PG_TEST_URL)',
        );
      } else {
        const restore = setEnv({
          NODE_ENV: 'development',
          ECHO_BACKEND_STORAGE: 'postgres',
          DATABASE_URL: dbUrl,
          USE_MOCK_DB: 'false',
          ECHO_AUTH_STORE: '',
        });
        clearBackendSingletonsForRestart();

        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { getPgPool, closePgPool } = require('../db/pg');
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { ensureAppSchema } = require('../db/ensureAppSchema');
        const pool = getPgPool();
        assert.ok(pool, 'expected pg pool');
        await ensureAppSchema(pool);

        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { getAuthStore } = require('../auth/store');
        const store1 = getAuthStore().store;
        const username = `restart_pg_${Date.now().toString(36)}`;
        await store1.createUser({
          username,
          password: 'password123',
          email: `${username}@echo.test`,
          displayName: 'Restart Pg',
        });

        await closePgPool();
        clearBackendSingletonsForRestart();

        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { getPgPool: getPgPool2 } = require('../db/pg');
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { getAuthStore: getAuthStore2 } = require('../auth/store');
        const pool2 = getPgPool2();
        assert.ok(pool2, 'expected pg pool after restart');
        const store2 = getAuthStore2().store;
        const after = await store2.getUserByUsername(username);
        assert.ok(after, 'expected user to persist in postgres across restart');

        restore();
      }
    }
  } finally {
    if (prevIsolation === undefined)
      delete process.env.ECHO_CONFIG_TEST_ISOLATION;
    else process.env.ECHO_CONFIG_TEST_ISOLATION = prevIsolation;
  }
}

run()
  .then(() => {
    console.log('storageMode.config tests passed');
  })
  .catch((err) => {
    console.error('storageMode.config tests failed', err);
    process.exit(1);
  });
