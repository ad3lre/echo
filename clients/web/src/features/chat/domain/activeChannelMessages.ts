/**
 * View projection: derives `MessageWithAuthor[]` from canonical `messages` + `users` refs.
 * No merge of competing sources — see view-purity-checklist.md.
 */
import { computed, type Ref } from 'vue';
import type { MessageWithAuthor } from '@shared/types';
import type {
  RawMessage,
  UserForAuthor,
} from '@/features/chat/chatMessageTypes';
import { messageReadFacade } from '@/features/chat/domain/messageReadFacade';
import {
  buildMessageWithAuthor,
  channelActiveMessagesFingerprint,
  messageWithAuthorCacheKey,
} from './messageWithAuthor';

export function createActiveChannelMessagesViewModel(
  activeChannelId: Ref<string>,
  users: Ref<UserForAuthor[]>,
  presenceByUserId?: Ref<Record<string, string>>,
) {
  const EMPTY_LIST: MessageWithAuthor[] = [];
  let lastOrderedFingerprint: string | null = null;
  let lastOrderedOut: MessageWithAuthor[] | null = null;

  const userById = computed(() => {
    const m = new Map<string, UserForAuthor>();
    for (const u of users.value) {
      m.set(u.id, u);
    }
    return m;
  });

  /**
   * Per-RawMessage memoisation via a stable string key (author + presence + body fingerprint).
   * Survives replacement of the users array / presence map when per-message inputs are unchanged,
   * avoiding O(n) reallocations on unrelated workspace churn.
   */
  const cache = new WeakMap<
    RawMessage,
    { key: string; out: MessageWithAuthor }
  >();

  const activeChannelMessagesMap = computed(() => {
    const channelId = activeChannelId.value;
    const lookup = userById.value;
    const overlay = presenceByUserId?.value ?? {};

    const map = new Map<string, MessageWithAuthor>();
    if (!channelId || channelId !== messageReadFacade.getActiveChannelId()) {
      return map;
    }

    const orderedIds = messageReadFacade.activeOrderedIds.value;
    const entitiesById = messageReadFacade.activeEntitiesById.value;

    for (const id of orderedIds) {
      const msg = entitiesById.get(id);
      if (!msg) continue;

      const user = lookup.get(msg.authorId);
      const key = messageWithAuthorCacheKey(msg, user, overlay[msg.authorId]);
      const hit = cache.get(msg);
      if (hit && hit.key === key) {
        map.set(id, hit.out);
      } else {
        const out = buildMessageWithAuthor(msg, lookup, overlay);
        cache.set(msg, { key, out });
        map.set(id, out);
      }
    }

    return map;
  });

  /** Ordered list for search and legacy call sites; same order as `activeOrderedIds`. */
  const activeChannelMessages = computed(() => {
    const channelId = activeChannelId.value;
    if (!channelId || channelId !== messageReadFacade.getActiveChannelId()) {
      lastOrderedFingerprint = null;
      lastOrderedOut = null;
      return EMPTY_LIST;
    }

    const orderedIds = messageReadFacade.activeOrderedIds.value;
    const entitiesById = messageReadFacade.activeEntitiesById.value;
    // We pass `0` for revision since we no longer rely directly on the index's revision here.
    // orderedIds and entitiesById are sufficient to detect changes.
    const fp = channelActiveMessagesFingerprint(
      channelId,
      0,
      orderedIds,
      entitiesById as Map<string, RawMessage>,
      userById.value,
      presenceByUserId?.value ?? {},
    );
    if (fp === lastOrderedFingerprint && lastOrderedOut) {
      return lastOrderedOut;
    }

    const map = activeChannelMessagesMap.value;
    if (orderedIds.length === 0) {
      lastOrderedFingerprint = fp;
      lastOrderedOut = EMPTY_LIST;
      return EMPTY_LIST;
    }

    const out: MessageWithAuthor[] = [];
    for (const id of orderedIds) {
      const m = map.get(id);
      if (m) out.push(m);
    }
    lastOrderedFingerprint = fp;
    lastOrderedOut = out;
    return out;
  });

  return { activeChannelMessagesMap, activeChannelMessages };
}

export type ActiveChannelMessagesViewModel = ReturnType<
  typeof createActiveChannelMessagesViewModel
>;
