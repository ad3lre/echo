/** Normalize message / author argument for moderation helpers. */
export function normalizeModerateMessageAuthorTarget(
  message: { authorId?: string; userId?: string } | string,
): string {
  return typeof message === 'string'
    ? message
    : (message.authorId ?? message.userId ?? '');
}
