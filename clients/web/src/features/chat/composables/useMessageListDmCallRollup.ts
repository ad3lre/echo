import { computed, ref, watch, type ComputedRef, type Ref } from 'vue';
import type { MessageWithAuthor } from '@shared/types';
import {
  DM_CALL_LOG_HISTORY_VISIBLE_CAP,
  buildDmCallLogPresentation,
  dmCallRollupRevealKey,
  isDmCallLocalLogEntity,
  parseDmCallRollupMessageId,
} from '@/features/chat/domain/dmCallLogHistoryCollapse';
import { messageWindowAuthority } from '@/features/chat/domain/messageWindowAuthority';

export type UseMessageListDmCallRollupOptions = {
  channelId: () => string | undefined;
  messages: () => Map<string, MessageWithAuthor & { channelName?: string }>;
};

type RollupState = {
  revealKeys: Ref<Set<string>>;
  canonicalOrderedIds: ComputedRef<readonly string[]>;
  options: UseMessageListDmCallRollupOptions;
};

function addRevealKey(state: RollupState, key: string): void {
  if (state.revealKeys.value.has(key)) return;
  const next = new Set(state.revealKeys.value);
  next.add(key);
  state.revealKeys.value = next;
}

function revealDmCallRunContainingMessageIfCollapsed(
  state: RollupState,
  messageId: string,
): void {
  const cid = state.options.channelId()?.trim();
  if (!cid) return;
  const raw = state.canonicalOrderedIds.value;
  const entities = messageWindowAuthority.entitiesById.value;
  const ix = raw.indexOf(messageId);
  if (ix < 0) return;
  const ent = entities.get(messageId);
  if (!isDmCallLocalLogEntity(ent)) return;
  let a = ix;
  while (a > 0 && isDmCallLocalLogEntity(entities.get(raw[a - 1]!))) {
    a -= 1;
  }
  let b = ix + 1;
  while (b < raw.length && isDmCallLocalLogEntity(entities.get(raw[b]!))) {
    b += 1;
  }
  const run = raw.slice(a, b);
  if (run.length <= DM_CALL_LOG_HISTORY_VISIBLE_CAP) return;
  addRevealKey(state, dmCallRollupRevealKey(cid, run[0]!));
}

function handleExpandDmCallRollFromBubble(
  state: RollupState,
  messageId: string,
): void {
  const parsed = parseDmCallRollupMessageId(messageId);
  if (!parsed) return;
  addRevealKey(
    state,
    dmCallRollupRevealKey(parsed.channelId, parsed.firstHiddenMessageId),
  );
}

/**
 * DM call-log folding for the rendered id list. Does not own scroll or
 * virtualizer measurement.
 */
export function useMessageListDmCallRollup(
  options: UseMessageListDmCallRollupOptions,
) {
  const canonicalOrderedIds = computed(
    () => messageWindowAuthority.orderedIds.value,
  );
  const revealKeys = ref(new Set<string>());
  const state: RollupState = {
    revealKeys,
    canonicalOrderedIds,
    options,
  };

  watch(
    () => options.channelId()?.trim() ?? '',
    () => {
      revealKeys.value = new Set();
    },
  );

  const dmCallPresentation = computed(() =>
    buildDmCallLogPresentation(
      canonicalOrderedIds.value,
      messageWindowAuthority.entitiesById.value,
      options.messages(),
      options.channelId()?.trim(),
      revealKeys.value,
    ),
  );

  return {
    canonicalOrderedIds,
    displayOrderedIds: computed(
      () => dmCallPresentation.value.displayOrderedIds,
    ),
    mergedEntitiesForList: computed(
      () => dmCallPresentation.value.mergedEntities,
    ),
    mergedMessagesForList: computed(
      () => dmCallPresentation.value.mergedMessages,
    ),
    revealDmCallRunContainingMessageIfCollapsed: (messageId: string) =>
      revealDmCallRunContainingMessageIfCollapsed(state, messageId),
    handleExpandDmCallRollFromBubble: (messageId: string) =>
      handleExpandDmCallRollFromBubble(state, messageId),
  };
}
