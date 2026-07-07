import { config as dotenvConfig, parse as dotenvParse } from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Find monorepo root (directory containing `backend/package.json`) when running from
 * backend/src, backend/dist/..., or nested paths.
 */
function resolveRepoRootFromDir(startDir: string): string | undefined {
  let dir: string = startDir;
  for (let i = 0; i < 12; i++) {
    const backendPkg = path.join(dir, 'backend', 'package.json');
    if (fs.existsSync(backendPkg)) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return undefined;
}

/**
 * dotenv does not override existing `process.env` keys. An empty export (e.g. `export JWT_SECRET=`
 * in shell, or `Environment=JWT_SECRET=` in systemd) therefore blocks values from `.env`. Fill only
 * keys that are unset or whitespace-only from the parsed file so real secrets in `.env` still apply.
 */
function fillEmptyProcessEnvFromDotenvFile(envPath: string): void {
  if (!fs.existsSync(envPath)) return;
  try {
    const parsed = dotenvParse(fs.readFileSync(envPath));
    for (const key of Object.keys(parsed)) {
      if ((process.env[key] ?? '').trim() !== '') continue;
      const fromFile = (parsed[key] ?? '').trim();
      if (fromFile === '') continue;
      process.env[key] = parsed[key] as string;
    }
  } catch {
    // Ignore unreadable .env; primary dotenv load already ran.
  }
}

/**
 * `.env.lan` uses `override: true`; a stray `JWT_SECRET=` there clears the real value from `.env`.
 * If the key is blank after LAN load, re-read it from root then backend files only (no other keys).
 */
function restoreJwtSecretFromFilesIfBlankAfterLan(
  rootEnv: string,
  backendEnv: string,
): void {
  if ((process.env.JWT_SECRET ?? '').trim() !== '') return;
  for (const envPath of [rootEnv, backendEnv]) {
    if (!fs.existsSync(envPath)) continue;
    try {
      const parsed = dotenvParse(fs.readFileSync(envPath));
      const fromFile = (parsed.JWT_SECRET ?? '').trim();
      if (fromFile === '') continue;
      process.env.JWT_SECRET = parsed.JWT_SECRET as string;
      return;
    } catch {
      // try next path
    }
  }
}

const SANDBOX_DEFAULT_DATABASE_URLS = new Set([
  'postgresql://echo:echo_dev@127.0.0.1:5432/echo',
  'postgresql://echo:echo_dev@localhost:5432/echo',
]);

function reconcileDatabaseUrlFromRootEnv(repo: string | undefined): void {
  if (!repo || process.env.ECHO_SKIP_ROOT_ENV_DATABASE_URL_RECONCILE === '1') {
    return;
  }
  if (process.env.ECHO_CONFIG_TEST_ISOLATION === '1') return;
  const rootEnv = path.join(repo, '.env');
  if (!fs.existsSync(rootEnv)) return;
  let parsed: Record<string, string>;
  try {
    parsed = dotenvParse(fs.readFileSync(rootEnv));
  } catch {
    return;
  }
  const fromFile = (parsed.DATABASE_URL ?? '').trim();
  if (!fromFile) return;
  const current = (process.env.DATABASE_URL ?? '').trim();
  const curNorm = current.replace(/\/$/, '');
  if (
    !current ||
    SANDBOX_DEFAULT_DATABASE_URLS.has(current) ||
    SANDBOX_DEFAULT_DATABASE_URLS.has(curNorm)
  ) {
    process.env.DATABASE_URL = fromFile;
  }
}

/** Monorepo root when discoverable from this module's location. */
export const repoRoot = resolveRepoRootFromDir(__dirname);

/**
 * Load env in order: repo root `.env` → `backend/.env` (fills keys not set by root) → `.env.lan` (overrides all).
 * Use `backend/.env` for vars you do not want in root `.env`; duplicate keys always follow root (unless `.env.lan` overrides).
 */
/** When `1`, skip loading repo `.env` files so config gate tests are deterministic (see `productionConfigGates.test.ts`). */
if (repoRoot && process.env.ECHO_CONFIG_TEST_ISOLATION !== '1') {
  if (process.env.ECHO_DEBUG_ENV_LOAD === '1') {
    const v = (process.env.JWT_SECRET ?? '').trim();
    process.stderr.write(
      `[echo-config] pre-dotenv JWT_SECRET length=${v.length} ${v.length > 0 ? '(non-empty)' : '(empty)'}\n`,
    );
  }
  const rootEnv = path.join(repoRoot, '.env');
  const backendEnv = path.join(repoRoot, 'backend', '.env');
  if (fs.existsSync(rootEnv)) {
    dotenvConfig({ path: rootEnv });
    fillEmptyProcessEnvFromDotenvFile(rootEnv);
  }
  if (fs.existsSync(backendEnv)) {
    dotenvConfig({ path: backendEnv, override: false });
    fillEmptyProcessEnvFromDotenvFile(backendEnv);
  }
  const lanPath = path.join(repoRoot, '.env.lan');
  if (fs.existsSync(lanPath)) {
    dotenvConfig({ path: lanPath, override: true });
    restoreJwtSecretFromFilesIfBlankAfterLan(rootEnv, backendEnv);
  }
  if (process.env.ECHO_DEBUG_ENV_LOAD === '1') {
    const v = (process.env.JWT_SECRET ?? '').trim();
    process.stderr.write(
      `[echo-config] post-dotenv JWT_SECRET length=${v.length} ${v.length > 0 ? '(non-empty)' : '(empty)'}\n`,
    );
  }
}

/**
 * Some dev shells / IDE sandboxes export a default `DATABASE_URL` (e.g. compose-style `echo_dev`).
 * `dotenv` does not override existing `process.env` keys, so that value can mask the real URL in
 * repo `.env` and break Postgres auth. Prefer root `.env` when the process value is empty or one
 * of those known defaults. Opt out with `ECHO_SKIP_ROOT_ENV_DATABASE_URL_RECONCILE=1`.
 */
reconcileDatabaseUrlFromRootEnv(repoRoot);

// Memory mock stack (Cypress E2E): repo `.env` must not leave DATABASE_URL set.
if (process.env.ECHO_BACKEND_STORAGE?.trim() === 'memory') {
  delete process.env.DATABASE_URL;
}
