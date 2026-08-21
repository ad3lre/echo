import { config } from '../config';

/**
 * Hyper-detailed VC / LiveKit trace logs for debugging end-to-end behavior.
 *
 * Enable with **`ECHO_VC_VERBOSE_LOG=true`** (or `1` / `yes`). In **`NODE_ENV !== 'production'`**
 * verbose tracing defaults **on** unless **`ECHO_VC_VERBOSE_LOG=false`** explicitly.
 *
 * Every line is grep-friendly: **`[Echo:VC:TRACE]`** + structured JSON fields.
 * Never logs tokens or API secrets — use `tokenChars` / `jwtParts` only.
 */
export function vcTrace(
  log: { info: (obj: object, msg?: string) => void } | undefined,
  msg: string,
  meta: Record<string, unknown> = {},
): void {
  if (!config.echoVcVerboseLogging) return;
  const payload = {
    ...meta,
    vcTrace: true,
    vcTraceAt: new Date().toISOString(),
  };
  const text = `[Echo:VC:TRACE] ${msg}`;
  if (log) {
    log.info(payload, text);
  }
}

/** Safe JWT size for logs (never log the token string). */
export function jwtMetaForLog(jwt: string): {
  jwtParts: number;
  tokenChars: number;
} {
  const parts = jwt.split('.');
  return { jwtParts: parts.length, tokenChars: jwt.length };
}
