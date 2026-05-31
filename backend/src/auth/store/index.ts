import { getPgPool } from '../../db/pg';
import { config } from '../../config';
import { PostgresAuthStore } from './postgres/PostgresAuthStore';
import { MemoryAuthStore } from './memory/MemoryAuthStore';
import type { AuthStore } from './types';

export * from './types';
export * from './helpers';

const AUTH_STORE_KEY = Symbol.for('echo.authStore.instance');

export function getAuthStore(): AuthStore {
  const g = globalThis as typeof globalThis & {
    [AUTH_STORE_KEY]?: AuthStore | null;
  };
  if (g[AUTH_STORE_KEY]) return g[AUTH_STORE_KEY]!;

  let instance: AuthStore;
  if (config.backendStorageMode === 'postgres') {
    const pool = getPgPool();
    if (!pool) {
      throw new Error(
        'Postgres auth store selected but Postgres pool is unavailable. Check ECHO_BACKEND_STORAGE and DATABASE_URL.',
      );
    } else {
      instance = new PostgresAuthStore(pool);
    }
  } else {
    instance = new MemoryAuthStore();
  }

  g[AUTH_STORE_KEY] = instance;
  return instance;
}

/** @internal Test isolation for standalone scripts with dynamic imports. */
export function __resetAuthStoreForTests(): void {
  const g = globalThis as typeof globalThis & {
    [AUTH_STORE_KEY]?: AuthStore | null;
  };
  g[AUTH_STORE_KEY] = null;
}
