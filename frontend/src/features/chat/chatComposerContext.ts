import type { InjectionKey, Ref } from 'vue';

export type InsertUserMentionPayload = { userId: string; displayName: string };

/** Inserts a user mention at the active channel composer cursor (when ChatInput is mounted). */
export type InsertUserMentionFn = (payload: InsertUserMentionPayload) => void;

export const COMPOSER_INSERT_USER_MENTION_KEY: InjectionKey<
  Ref<InsertUserMentionFn | null>
> = Symbol('composerInsertUserMention');
