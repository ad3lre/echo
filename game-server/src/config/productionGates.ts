const MIN_PRODUCTION_SECRET_LENGTH = 32;

const KNOWN_WEAK_SECRETS = new Set([
  'dev-insecure-secret',
  'change-me',
  'changeme',
  'password',
  'secret',
  'test',
]);

function normalizeEnv(raw: string | undefined): string {
  return (raw ?? '').trim();
}

function isStrongSecret(raw: string | undefined): boolean {
  const value = normalizeEnv(raw);
  if (value.length < MIN_PRODUCTION_SECRET_LENGTH) return false;
  if (/^(.)\1+$/.test(value)) return false;
  return !KNOWN_WEAK_SECRETS.has(value.toLowerCase());
}

function fail(message: string): never {
  process.stderr.write(`[game-server-config] ${message}\n`);
  process.exit(1);
}

/** Fail fast when production env leaves insecure game-server defaults in place. */
export function assertGameServerProductionConfig(opts: {
  gameTokenSecret: string;
  echoForwardSecret: string;
  corsOrigin: string[] | true;
}): void {
  if (process.env.NODE_ENV !== 'production') return;

  if (!isStrongSecret(opts.gameTokenSecret)) {
    fail(
      'GAME_SERVER_JWT_SECRET (or JWT_SECRET) must be a strong random value in production.',
    );
  }
  if (!isStrongSecret(opts.echoForwardSecret)) {
    fail(
      'GAME_SERVER_FORWARD_SECRET (or JWT_SECRET) must be a strong random value in production.',
    );
  }
  if (opts.corsOrigin === true) {
    fail(
      'Set GAME_SERVER_CORS_ORIGIN to an explicit comma-separated allowlist in production.',
    );
  }
  if (!opts.corsOrigin.length) {
    fail('GAME_SERVER_CORS_ORIGIN must not be empty in production.');
  }
}
