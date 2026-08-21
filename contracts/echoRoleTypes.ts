export const ECHO_ROLE_TYPES = ['mixed', 'authority', 'visual'] as const;

export type EchoRoleType = (typeof ECHO_ROLE_TYPES)[number];

export function normalizeEchoRoleType(raw: unknown): EchoRoleType {
  if (typeof raw !== 'string') return 'mixed';
  const s = raw.trim().toLowerCase();
  if (s === 'authority' || s === 'visual') return s;
  return 'mixed';
}
