/**
 * Chat notification sound: current user’s role id set for mention routing.
 */
export function createChatSoundMemberRoleIdsGetter(opts: {
  currentUserId: { readonly value: string | undefined };
  echoMemberRoleIdsByUser: () => Readonly<
    Record<string, readonly string[] | undefined>
  >;
}) {
  return (): Set<string> | undefined => {
    const uid = opts.currentUserId.value;
    return uid ? new Set(opts.echoMemberRoleIdsByUser()[uid] ?? []) : undefined;
  };
}
