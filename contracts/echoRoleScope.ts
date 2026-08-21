export const ECHO_ROLE_SCOPES = ['category', 'global'] as const;

export type EchoRoleScope = (typeof ECHO_ROLE_SCOPES)[number];

export function normalizeEchoRoleScope(raw: unknown): EchoRoleScope {
  return raw === 'global' ? 'global' : 'category';
}
