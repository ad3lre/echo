function echoApiPath(rawUrl: string): string {
  return rawUrl.split('?')[0] ?? '';
}

/**
 * PUT /api/v1/echo/channels/:channelId/read-state — high-frequency cursor persistence.
 * Exempt from the tight global mutation bucket; uses a dedicated per-route limit instead.
 */
export function isEchoReadStateWriteRequest(
  method: string,
  rawUrl: string,
): boolean {
  if (method !== 'PUT') return false;
  const path = echoApiPath(rawUrl);
  return /^\/api\/v1\/echo\/channels\/[^/]+\/read-state$/.test(path);
}

/**
 * GET /api/v1/echo/* uses a dedicated higher bucket (see registerRoutes echo scope).
 * Global rate limit skips these so Echo reads are not double-counted.
 */
export function isEchoApiReadRequest(method: string, rawUrl: string): boolean {
  if (method !== 'GET') return false;
  const path = echoApiPath(rawUrl);
  return path === '/api/v1/echo' || path.startsWith('/api/v1/echo/');
}

/** Requests that should not consume the global 150/min mutation budget. */
export function isAuthSessionReadRequest(
  method: string,
  rawUrl: string,
): boolean {
  if (method !== 'GET') return false;
  const path = echoApiPath(rawUrl);
  return path === '/api/v1/auth/me';
}

/** Public instance policy — fetched on every client boot; must not share the mutation bucket. */
export function isInstancePolicyReadRequest(
  method: string,
  rawUrl: string,
): boolean {
  if (method !== 'GET') return false;
  const path = echoApiPath(rawUrl);
  return path === '/api/v1/system/instance-policy';
}

/** Requests that should not consume the global 150/min mutation budget. */
export function isEchoApiGlobalRateLimitExempt(
  method: string,
  rawUrl: string,
): boolean {
  return (
    isEchoApiReadRequest(method, rawUrl) ||
    isEchoReadStateWriteRequest(method, rawUrl) ||
    isAuthSessionReadRequest(method, rawUrl) ||
    isInstancePolicyReadRequest(method, rawUrl)
  );
}
