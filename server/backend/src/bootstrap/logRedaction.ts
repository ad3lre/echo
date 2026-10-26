/** pino redaction + JWT masking for the Fastify logger (F-005). */
export const LOG_REDACT_CENSOR = '[REDACTED]';

export const LOG_REDACT_PATHS: string[] = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-echo-discord-bot-secret"]',
  'res.headers["set-cookie"]',
  '*.password',
  '*.token',
  '*.accessToken',
  '*.refreshToken',
  '*.idToken',
  '*.secret',
  '*.totp',
  '*.code',
];

const JWT_SHAPED = /\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]*/g;

/** Replace JWT-shaped substrings (three base64url segments starting eyJ). */
export function maskJwtsInString(value: string): string {
  return value.replace(JWT_SHAPED, LOG_REDACT_CENSOR);
}

/** pino `formatters.log` hook: masks JWT-shaped strings in top-level fields. */
export function maskJwtsInLogObject(
  obj: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    out[k] = typeof v === 'string' ? maskJwtsInString(v) : v;
  }
  return out;
}

export const loggerRedactionOptions = {
  redact: { paths: LOG_REDACT_PATHS, censor: LOG_REDACT_CENSOR },
  formatters: { log: maskJwtsInLogObject },
  hooks: {
    logMethod(
      this: unknown,
      args: unknown[],
      method: (...a: unknown[]) => void,
    ) {
      const masked = args.map((a) =>
        typeof a === 'string' ? maskJwtsInString(a) : a,
      );
      method.apply(this, masked);
    },
  },
};
