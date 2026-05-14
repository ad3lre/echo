/**
 * Default-deny guest mutations on Echo REST: only explicitly allowlisted route patterns.
 * `routeUrl` is Fastify's route path (e.g. `/channels/:channelId/messages/:messageId`).
 */
const GUEST_ALLOWED_MUTATIONS: ReadonlyArray<{
  method: string;
  pattern: string;
}> = [
  { method: 'POST', pattern: '/presence' },
  { method: 'POST', pattern: '/dm/open' },
  { method: 'PATCH', pattern: '/channels/:channelId/messages/:messageId' },
  { method: 'DELETE', pattern: '/channels/:channelId/messages/:messageId' },
  /**
   * Guest onboarding / profile branding uses the same upload pipeline as members.
   * `requireAuth` + `resolveEchoUploadStorageKey` still enforce purpose/RBAC per request.
   */
  { method: 'POST', pattern: '/uploads/dedupe/match' },
  { method: 'POST', pattern: '/uploads/presign' },
  { method: 'PUT', pattern: '/uploads/local/put' },
  { method: 'POST', pattern: '/uploads/dedupe/register' },
];

function patternMatch(routeUrl: string, pattern: string): boolean {
  const a = routeUrl.split('/').filter(Boolean);
  const b = pattern.split('/').filter(Boolean);
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const pi = b[i]!;
    if (pi.startsWith(':')) continue;
    if (a[i] !== pi) return false;
  }
  return true;
}

export function isGuestEchoMutationAllowed(
  method: string,
  routeUrl: string | undefined,
): boolean {
  if (!routeUrl) return false;
  const m = method.toUpperCase();
  return GUEST_ALLOWED_MUTATIONS.some(
    (x) => x.method === m && patternMatch(routeUrl, x.pattern),
  );
}
