import { getPgPool } from '../../db/pg';
import { config } from '../../config';
import { PostgresAuthStore } from './postgres/PostgresAuthStore';
import { MemoryAuthStore } from './memory/MemoryAuthStore';
import type { AuthStore } from './types';

export * from './types';
export * from './helpers';

let instance: AuthStore | null = null;

export function getAuthStore(): AuthStore {
  if (instance) return instance;

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

  return instance;
}
