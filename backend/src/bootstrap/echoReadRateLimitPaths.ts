/**
 * GET /api/v1/echo/* uses a dedicated higher bucket (see registerRoutes echo scope).
 * Global rate limit skips these so Echo reads are not double-counted.
 */
export function isEchoApiReadRequest(method: string, rawUrl: string): boolean {
  if (method !== 'GET') return false;
  const path = rawUrl.split('?')[0] ?? '';
  return path === '/api/v1/echo' || path.startsWith('/api/v1/echo/');
}
