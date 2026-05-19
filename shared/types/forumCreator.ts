/**
 * Per-forum defaults: extra rights for users who created a post (child channel).
 * Stored on the parent forum row (`forum_creator_default_perms`); merged with
 * built-ins when null or partial.
 */
export type ForumCreatorDefaultPerms = {
  /** Pin, lock, archive, and edit post tags without guild MANAGE_CHANNELS on the post channel. */
  managePostFlags?: boolean;
  /** Delete the post channel (forum thread). */
  deleteOwnPost?: boolean;
  /** Delete other members’ messages inside their post (like scoped MANAGE_MESSAGES). */
  moderateMessagesInOwnPost?: boolean;
};

/** Applied when DB value is null or missing keys. */
export const FORUM_CREATOR_DEFAULT_PERMS_FALLBACK: Required<ForumCreatorDefaultPerms> =
  {
    managePostFlags: true,
    deleteOwnPost: true,
    moderateMessagesInOwnPost: false,
  };

export function normalizeForumCreatorDefaultPerms(
  raw: unknown,
): Required<ForumCreatorDefaultPerms> {
  const fb = FORUM_CREATOR_DEFAULT_PERMS_FALLBACK;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ...fb };
  }
  const o = raw as Record<string, unknown>;
  return {
    managePostFlags:
      typeof o.managePostFlags === 'boolean'
        ? o.managePostFlags
        : fb.managePostFlags,
    deleteOwnPost:
      typeof o.deleteOwnPost === 'boolean' ? o.deleteOwnPost : fb.deleteOwnPost,
    moderateMessagesInOwnPost:
      typeof o.moderateMessagesInOwnPost === 'boolean'
        ? o.moderateMessagesInOwnPost
        : fb.moderateMessagesInOwnPost,
  };
}
