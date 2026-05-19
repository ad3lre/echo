type PresenceScopeInput = {
  authUserId?: string;
  workspaceUserIds: readonly string[];
  friendIds: readonly string[];
  globalAuthorIds: ReadonlySet<string>;
  selectedServerId?: string | null;
  serverMemberIdsByServer: Readonly<
    Record<string, readonly string[] | undefined>
  >;
  workspaceMembersByServer?: Readonly<
    Record<string, readonly { userId: string }[] | undefined>
  >;
};

/**
 * Pure candidate-set selection for presence refresh.
 */
export function collectPresenceCandidateUserIds(
  input: PresenceScopeInput,
): string[] {
  const ids = new Set<string>();

  for (const id of input.workspaceUserIds) {
    if (id) ids.add(id);
  }
  for (const id of input.friendIds) {
    if (id) ids.add(id);
  }
  for (const id of input.globalAuthorIds) {
    if (id) ids.add(id);
  }

  const sid = input.selectedServerId?.trim();
  if (sid && sid !== 'echo') {
    const fromMemberIds = input.serverMemberIdsByServer[sid] ?? [];
    if (fromMemberIds.length > 0) {
      for (const id of fromMemberIds) {
        if (id) ids.add(id);
      }
    } else {
      const fallbackRoster = input.workspaceMembersByServer?.[sid] ?? [];
      for (const row of fallbackRoster) {
        if (row?.userId) ids.add(row.userId);
      }
    }
  }

  if (input.authUserId) ids.delete(input.authUserId);
  return [...ids];
}
