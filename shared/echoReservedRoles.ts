/** Server roles that are fixed at the bottom of the hierarchy and cannot be reordered. */
export const PINNED_BOTTOM_ECHO_ROLE_NAMES = [
  '@members',
  '@global',
  /** @deprecated legacy name; treated like @members for ordering guards */
  '@everyone',
] as const;

export type PinnedBottomEchoRoleName =
  (typeof PINNED_BOTTOM_ECHO_ROLE_NAMES)[number];

export function isPinnedBottomEchoRoleName(name: string): boolean {
  return name === '@members' || name === '@global' || name === '@everyone';
}

export function isPinnedBottomEchoRole(role: { name: string }): boolean {
  return isPinnedBottomEchoRoleName(role.name);
}

/** Bottom-to-top tail order: @members above @global. */
export function pinnedBottomEchoRoleSortKey(name: string): number {
  if (name === '@global') return 2;
  if (name === '@members' || name === '@everyone') return 1;
  return 0;
}
