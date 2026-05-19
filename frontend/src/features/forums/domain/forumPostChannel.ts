export function getParentChannelIdOrNull(ch: any): string | null {
  const parent =
    (typeof ch?.parentChannelId === 'string' && ch.parentChannelId.trim()) ||
    (typeof ch?.parent_channel_id === 'string' && ch.parent_channel_id.trim());
  return parent ? parent : null;
}

export function hasForumPostMetadata(ch: any): boolean {
  if (
    Array.isArray(ch?.forumPostTagIds) ||
    Array.isArray(ch?.forum_post_tag_ids)
  )
    return true;
  if (ch?.forumPostPinned === true || ch?.forum_post_pinned === true)
    return true;
  if (ch?.forumPostLocked === true || ch?.forum_post_locked === true)
    return true;
  const archived =
    (typeof ch?.forumPostArchivedAt === 'string' &&
      ch.forumPostArchivedAt.trim()) ||
    (typeof ch?.forum_post_archived_at === 'string' &&
      ch.forum_post_archived_at.trim());
  if (archived) return true;
  if (
    (typeof ch?.forumPostCreatorUserId === 'string' &&
      ch.forumPostCreatorUserId.trim()) ||
    (typeof ch?.forum_post_creator_user_id === 'string' &&
      ch.forum_post_creator_user_id.trim())
  ) {
    return true;
  }
  return false;
}

export function isForumPostChannel(ch: any): boolean {
  if (!ch) return false;
  if (getParentChannelIdOrNull(ch)) return true;
  if (hasForumPostMetadata(ch)) return true;
  return false;
}

export function isForumPostPinned(ch: any): boolean {
  return ch?.forumPostPinned === true || ch?.forum_post_pinned === true;
}

export function isForumPostArchived(ch: any): boolean {
  const archived =
    (typeof ch?.forumPostArchivedAt === 'string' &&
      ch.forumPostArchivedAt.trim()) ||
    (typeof ch?.forum_post_archived_at === 'string' &&
      ch?.forum_post_archived_at.trim());
  return !!archived;
}
