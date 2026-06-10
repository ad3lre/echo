import { createHmac } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { normalizeEnvValue } from './envParsing';
import { repoRoot } from './loadEnv';

/**
 * Local-only default for `POST/GET …/hooks/discord-bot/*` auth. Must match
 * `scripts/dev-discord-bot.mjs` when that script injects env. Never used when
 * `NODE_ENV=production` (set a real `ECHO_DISCORD_BOT_WEBHOOK_SECRET` in prod).
 */
export const DEV_DISCORD_BOT_WEBHOOK_SECRET =
  'echo-dev-local-discord-bot-webhook';

export const MIN_PRODUCTION_SECRET_LENGTH = 32;

const KNOWN_WEAK_PRODUCTION_SECRETS = new Set([
  'dev-insecure-secret',
  DEV_DISCORD_BOT_WEBHOOK_SECRET,
  'change-me',
  'changeme',
  'password',
  'secret',
  'test',
]);

export class ConfigFatalError extends Error {
  readonly kind = 'ConfigFatalError' as const;
}

export function configStderr(message: string): void {
  process.stderr.write(`${message}\n`);
}

export function exitBadConfig(message: string): never {
  configStderr(`[echo-config] ${message}`);
  throw new ConfigFatalError(message);
}

export function isStrongProductionSecret(
  raw: string | null | undefined,
): boolean {
  const value = normalizeEnvValue(raw ?? undefined);
  if (value.length < MIN_PRODUCTION_SECRET_LENGTH) return false;
  if (/^(.)\1+$/.test(value)) return false;
  return !KNOWN_WEAK_PRODUCTION_SECRETS.has(value.toLowerCase());
}

export function requireStrongProductionSecret(
  label: string,
  raw: string | null | undefined,
): void {
  if (isStrongProductionSecret(raw)) return;
  configStderr(
    `${label} must be set to a strong random value in production (at least ${MIN_PRODUCTION_SECRET_LENGTH} characters, not a built-in default, and not a repeated character).`,
  );
  if (label === 'JWT_SECRET') {
    const value = normalizeEnvValue(raw ?? undefined);
    const len = value.length;
    const rootEnvPath = repoRoot ? path.join(repoRoot, '.env') : null;
    const backendEnvPath = repoRoot
      ? path.join(repoRoot, 'backend', '.env')
      : null;
    const lanPath = repoRoot ? path.join(repoRoot, '.env.lan') : null;
    const hasLan = Boolean(lanPath && fs.existsSync(lanPath));
    const shortHint =
      len > 0 && len < MIN_PRODUCTION_SECRET_LENGTH
        ? ` Value is too short (${len} chars after trim; need at least ${MIN_PRODUCTION_SECRET_LENGTH}). Regenerate, e.g. node -e "process.stdout.write(require('crypto').randomBytes(32).toString('base64url'))".`
        : len === 0
          ? ' Value is empty after trim — check .env for stray quotes/whitespace, blank lines in .env.lan, or an empty export in systemd/PM2.'
          : '';
    configStderr(
      `[echo-config] ${label} check: repoRoot=${repoRoot ?? '(not found — .env files skipped)'}, cwd=${process.cwd()}, normalized length=${len}, root .env exists=${Boolean(rootEnvPath && fs.existsSync(rootEnvPath))}, backend .env exists=${Boolean(backendEnvPath && fs.existsSync(backendEnvPath))}, .env.lan exists=${hasLan}.${shortHint}`,
    );
  }
  throw new ConfigFatalError(`${label} must be set to a strong random value`);
}

export function resolveEchoGuestBindingSecret(
  prod: boolean,
  jwtSecret: string,
  requireExplicitSecretInProd: boolean,
): string {
  const raw = process.env.ECHO_GUEST_BINDING_SECRET?.trim() ?? '';
  if (raw) return raw;
  if (!prod || !requireExplicitSecretInProd) {
    return createHmac('sha256', jwtSecret)
      .update('echo_guest_binding_derived_v1')
      .digest('hex');
  }
  return '';
}
