type ForumPostChannelLike = {
  parentChannelId?: unknown;
  parent_channel_id?: unknown;
  forumPostTagIds?: unknown;
  forum_post_tag_ids?: unknown;
  forumPostPinned?: unknown;
  forum_post_pinned?: unknown;
  forumPostLocked?: unknown;
  forum_post_locked?: unknown;
  forumPostArchivedAt?: unknown;
  forum_post_archived_at?: unknown;
  forumPostCreatorUserId?: unknown;
  forum_post_creator_user_id?: unknown;
};

function toForumPostChannelLike(ch: unknown): ForumPostChannelLike | null {
  if (ch === null || typeof ch !== 'object') return null;
  return ch as ForumPostChannelLike;
}

function trimmedStringOrNull(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function getParentChannelIdOrNull(ch: unknown): string | null {
  const channel = toForumPostChannelLike(ch);
  if (!channel) return null;
  return (
    trimmedStringOrNull(channel.parentChannelId) ??
    trimmedStringOrNull(channel.parent_channel_id)
  );
}

export function hasForumPostMetadata(ch: unknown): boolean {
  const channel = toForumPostChannelLike(ch);
  if (!channel) return false;
  if (
    Array.isArray(channel.forumPostTagIds) ||
    Array.isArray(channel.forum_post_tag_ids)
  )
    return true;
  if (channel.forumPostPinned === true || channel.forum_post_pinned === true)
    return true;
  if (channel.forumPostLocked === true || channel.forum_post_locked === true)
    return true;
  const archived =
    trimmedStringOrNull(channel.forumPostArchivedAt) ??
    trimmedStringOrNull(channel.forum_post_archived_at);
  if (archived) return true;
  if (
    trimmedStringOrNull(channel.forumPostCreatorUserId) ||
    trimmedStringOrNull(channel.forum_post_creator_user_id)
  ) {
    return true;
  }
  return false;
}

export function isForumPostChannel(ch: unknown): boolean {
  if (!ch) return false;
  if (getParentChannelIdOrNull(ch)) return true;
  if (hasForumPostMetadata(ch)) return true;
  return false;
}

export function isForumPostPinned(ch: unknown): boolean {
  const channel = toForumPostChannelLike(ch);
  return (
    channel?.forumPostPinned === true || channel?.forum_post_pinned === true
  );
}

export function isForumPostArchived(ch: unknown): boolean {
  const channel = toForumPostChannelLike(ch);
  if (!channel) return false;
  const archived =
    trimmedStringOrNull(channel.forumPostArchivedAt) ??
    trimmedStringOrNull(channel.forum_post_archived_at);
  return !!archived;
}
