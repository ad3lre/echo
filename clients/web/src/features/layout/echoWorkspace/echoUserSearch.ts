export type EchoUserSearchFields = {
  name: string;
  username?: string;
};

/** Case-insensitive partial match on display name and Echo username. */
export function echoUserMatchesSearchQuery(
  user: EchoUserSearchFields,
  query: string,
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  if (user.name.toLowerCase().includes(q)) return true;
  const username = user.username?.trim();
  if (username && username.toLowerCase().includes(q)) return true;
  return false;
}
