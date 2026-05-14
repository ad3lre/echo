/**
 * Short stable label when a peer user row is not in `workspace.users` yet.
 * Avoids showing the literal "Unknown" while profiles hydrate.
 */
export function peerDisplayNamePlaceholder(userId: string): string {
  const id = userId.trim();
  if (!id) return 'Member';
  if (id.length <= 12) return id;
  return `${id.slice(0, 6)}…${id.slice(-4)}`;
}
