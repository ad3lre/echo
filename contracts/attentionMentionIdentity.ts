import type { MentionEntity } from './types';

export function userMentionTargetsViewer(
  mention: MentionEntity,
  viewer: { userId?: string; username?: string; displayName?: string },
): boolean {
  const target = mention.userId?.trim() || mention.id?.trim();
  if (target) return target === viewer.userId?.trim();
  const label = mention.label.trim().toLowerCase();
  return (
    Boolean(label) &&
    [viewer.username, viewer.displayName].some(
      (name) => name?.trim().toLowerCase() === label,
    )
  );
}
