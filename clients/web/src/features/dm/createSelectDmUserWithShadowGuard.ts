type WorkspaceUserLike = {
  id: string;
} & Record<string, unknown>;

/**
 * Block opening a DM thread for Discord shadow users (cannot be messaged directly).
 */
export function createSelectDmUserWithShadowGuard(opts: {
  users: () => readonly WorkspaceUserLike[];
  onSelectDmUser: (userId: string) => Promise<string | null>;
}) {
  return function selectDmUser(userId: string): Promise<string | null> {
    const user = opts.users().find((u) => u.id === userId);
    if (user && 'isDiscordShadow' in user && user.isDiscordShadow) {
      return Promise.resolve(null);
    }
    return opts.onSelectDmUser(userId);
  };
}
