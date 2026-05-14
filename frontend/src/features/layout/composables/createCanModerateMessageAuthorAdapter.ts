import { normalizeModerateMessageAuthorTarget } from '@/features/layout/normalizeModerateMessageAuthorTarget';

export function createCanModerateMessageAuthorAdapter(
  canModerateMessageAuthor: (authorId: string) => boolean,
) {
  return (message: { authorId?: string; userId?: string } | string) =>
    canModerateMessageAuthor(normalizeModerateMessageAuthorTarget(message));
}
