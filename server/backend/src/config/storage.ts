import * as path from 'path';
import { normalizeEnvValue } from './envParsing';
import { configStderr, exitBadConfig } from './secrets';
import { repoRoot } from './loadEnv';

export type BackendStorageMode = 'memory' | 'postgres';

export function envS3UploadConfigured(): boolean {
  return !!(
    process.env.ECHO_S3_BUCKET?.trim() &&
    process.env.ECHO_S3_REGION?.trim() &&
    process.env.ECHO_S3_ACCESS_KEY?.trim() &&
    process.env.ECHO_S3_SECRET_KEY?.trim()
  );
}

/** Disk-backed uploads when S3 env is unset, or when `ECHO_LOCAL_UPLOAD_DIR` is set explicitly (Watch Together). */
export function resolveEchoLocalUploadDir(): string | null {
  if (process.env.ECHO_LOCAL_UPLOADS?.trim().toLowerCase() === 'false') {
    return null;
  }
  const raw = process.env.ECHO_LOCAL_UPLOAD_DIR?.trim();
  if (raw) return path.resolve(raw);
  if (envS3UploadConfigured()) return null;
  const backendRoot = repoRoot
    ? path.join(repoRoot, 'server', 'backend')
    : process.cwd();
  return path.join(backendRoot, 'data', 'echo-local-uploads');
}

export function resolveBackendStorageMode(isProduction: boolean): {
  backendStorageMode: BackendStorageMode;
  databaseUrl: string | null;
} {
  const storageRaw = normalizeEnvValue(
    process.env.ECHO_BACKEND_STORAGE,
  ).toLowerCase();
  const dbUrlRaw = normalizeEnvValue(process.env.DATABASE_URL);
  const useMockDbRaw = normalizeEnvValue(process.env.USE_MOCK_DB);
  const authStoreRaw = normalizeEnvValue(
    process.env.ECHO_AUTH_STORE,
  ).toLowerCase();

  const hasDbUrl = dbUrlRaw.length > 0;
  const hasUseMockDb = useMockDbRaw.length > 0;
  const hasAuthStore = authStoreRaw.length > 0;

  if (hasAuthStore) {
    exitBadConfig(
      'ECHO_AUTH_STORE is deprecated and must not be used. Set ECHO_BACKEND_STORAGE=memory|postgres and remove ECHO_AUTH_STORE.',
    );
  }

  if (storageRaw.length === 0) {
    if (isProduction) {
      exitBadConfig(
        'ECHO_BACKEND_STORAGE is required in production (set to postgres).',
      );
    }
    if (hasDbUrl) {
      exitBadConfig(
        'DATABASE_URL is set but ECHO_BACKEND_STORAGE is not. Refusing to guess. Set ECHO_BACKEND_STORAGE=postgres (or remove DATABASE_URL).',
      );
    }
    if (hasUseMockDb && useMockDbRaw.toLowerCase() === 'false') {
      exitBadConfig(
        'USE_MOCK_DB=false without ECHO_BACKEND_STORAGE is ambiguous and no longer supported. Set ECHO_BACKEND_STORAGE=postgres and DATABASE_URL.',
      );
    }
    if (hasUseMockDb && useMockDbRaw.toLowerCase() !== 'false') {
      configStderr(
        '[echo-config] ECHO_BACKEND_STORAGE is not set; using legacy USE_MOCK_DB to run in memory mode. Set ECHO_BACKEND_STORAGE=memory to be explicit.',
      );
    } else {
      configStderr(
        '[echo-config] ECHO_BACKEND_STORAGE is not set; defaulting backend storage to memory (dev-only). Set ECHO_BACKEND_STORAGE=memory|postgres to be explicit.',
      );
    }
    return { backendStorageMode: 'memory', databaseUrl: null };
  }

  if (storageRaw !== 'memory' && storageRaw !== 'postgres') {
    exitBadConfig(
      `Invalid ECHO_BACKEND_STORAGE=${JSON.stringify(storageRaw)} (expected "memory" or "postgres").`,
    );
  }

  if (storageRaw === 'postgres') {
    if (!hasDbUrl) {
      exitBadConfig('ECHO_BACKEND_STORAGE=postgres requires DATABASE_URL.');
    }
    if (hasUseMockDb && useMockDbRaw.toLowerCase() !== 'false') {
      exitBadConfig(
        'ECHO_BACKEND_STORAGE=postgres conflicts with USE_MOCK_DB=true.',
      );
    }
    return { backendStorageMode: 'postgres', databaseUrl: dbUrlRaw };
  }

  if (hasDbUrl) {
    exitBadConfig(
      'ECHO_BACKEND_STORAGE=memory conflicts with DATABASE_URL. Remove DATABASE_URL or set ECHO_BACKEND_STORAGE=postgres.',
    );
  }
  if (hasUseMockDb && useMockDbRaw.toLowerCase() === 'false') {
    exitBadConfig(
      'ECHO_BACKEND_STORAGE=memory conflicts with USE_MOCK_DB=false.',
    );
  }
  return { backendStorageMode: 'memory', databaseUrl: null };
}
