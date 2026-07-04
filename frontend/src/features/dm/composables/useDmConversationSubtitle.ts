import { computed, unref, type MaybeRefOrGetter, toValue } from 'vue';
import { storeToRefs } from 'pinia';
import { getChannelIndex } from '@/features/chat/domain/channelMessageIndex';
import type { RawMessage } from '@/features/chat/chatMessageTypes';
import type { DmPanelInboxEntry } from '@/features/dm/buildDmPanelUserList';
import {
  resolveDmConversationSubtitle,
  resolveDmInboxEntrySubtitle,
  type DmConversationSubtitle,
} from '@/features/dm/resolveDmConversationSubtitle';
import { useChannelTypingStore } from '@/stores/channelTyping';
import { useDmInboxOrderCacheStore } from '@/stores/dmInboxOrderCache';
import { useEchoWorkspace } from '@/composables/useEchoWorkspace';

type SubtitleDeps = {
  currentUserId: MaybeRefOrGetter<string>;
  echoPeerByChannelId: MaybeRefOrGetter<ReadonlyMap<string, string>>;
  messages?: MaybeRefOrGetter<Record<string, RawMessage[]>>;
  resolveAuthorName?: (userId: string) => string;
};

export function useDmConversationSubtitle(deps: SubtitleDeps) {
  const typingStore = useChannelTypingStore();
  const dmInboxOrderCacheStore = useDmInboxOrderCacheStore();
  const { typersByChannel } = storeToRefs(typingStore);
  const workspace = useEchoWorkspace();

  const messagesSource = computed(
    () => toValue(deps.messages) ?? workspace.messages.value,
  );

  function getMessages(channelId: string): readonly RawMessage[] | undefined {
    return getChannelIndex(channelId, messagesSource.value[channelId] ?? [])
      .sorted.value;
  }

  function sharedInput() {
    return {
      selfId: toValue(deps.currentUserId),
      echoPeerByChannelId: toValue(deps.echoPeerByChannelId),
      getMessages,
      typersFor: (channelId: string) =>
        typingStore.typersFor(channelId, toValue(deps.currentUserId)),
      resolveAuthorName: deps.resolveAuthorName,
      fallbackPreviewByKey: dmInboxOrderCacheStore.initialPreviewByKey,
    };
  }

  function inboxEntrySubtitle(
    entry: DmPanelInboxEntry,
  ): DmConversationSubtitle {
    void typersByChannel.value;
    void messagesSource.value;
    return resolveDmInboxEntrySubtitle(entry, sharedInput());
  }

  function peerUserSubtitle(peerUserId: string): DmConversationSubtitle {
    void typersByChannel.value;
    void messagesSource.value;
    return resolveDmConversationSubtitle({
      kind: 'user',
      peerUserId,
      ...sharedInput(),
    });
  }

  return {
    inboxEntrySubtitle,
    peerUserSubtitle,
  };
}

/** Read echo DM peer map from left-chrome injection when available. */
export function echoPeerMapFromInject(
  injected: {
    echoPeerByChannelId?: MaybeRefOrGetter<
      ReadonlyMap<string, string> | Map<string, string> | undefined
    >;
  } | null,
): ReadonlyMap<string, string> {
  const raw = injected?.echoPeerByChannelId;
  if (!raw) return new Map();
  const map = unref(raw);
  return map instanceof Map ? map : new Map();
}
