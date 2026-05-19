/** Keeps `friendIdsByUserId[me]` in sync with the loaded `friendIds` list for the signed-in user. */
export function patchFriendIdsByUserIdMap(
  prev: Record<string, string[]>,
  meId: string | null | undefined,
  friendIds: readonly string[],
): Record<string, string[]> {
  if (!meId?.trim()) return {};
  return {
    ...prev,
    [meId.trim()]: [...friendIds],
  };
}
