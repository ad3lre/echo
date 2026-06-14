<script setup lang="ts">
import { ref, computed, nextTick, provide } from 'vue';
import type { MessageWithAuthor } from '@shared/types';
import type { MentionEntity, PollData, ReplyTo } from '@shared/types';
import MessageList from '@/features/chat/components/MessageList.vue';
import ChatInput from '@/features/chat/components/ChatInput.vue';
import { icons } from '@/assets/icons';
import {
  createPermissiveChatPermissions,
  provideChatPermissions,
} from '@/composables/useChatPermissions';
import { selectPresence } from '@/services/domain/presence';
import PausedGifAvatar from '@/components/PausedGifAvatar.vue';
import { safeImageUrl } from '@/utils/safeImageUrl';
import { openExternal } from '@/platform/desktopBridge';

/** Override AppLayout role-preview channel permissions — request replies are not the active server channel. */
provideChatPermissions(createPermissiveChatPermissions());

export interface DmMessage {
  id?: string;
  authorId: string;
  timestamp: string;
  content: string;
}

const props = defineProps<{
  users: { id: string; name: string; pfp: string; status: string }[];
  currentUserId: string;
  currentUserName?: string;
  messageRequests: {
    id: string;
    channelId: string;
    fromUserId: string;
    preview: string;
  }[];
  messages: Record<string, DmMessage[]>;
  /** Request id selected in sidebar (shows this conversation in main area). */
  selectedRequestId: string | null;
  sendMessage?: (
    channelId: string,
    content: string,
    mentions?: MentionEntity[],
    imageUrl?: string,
    poll?: PollData,
    gif?: boolean,
    replyTo?: ReplyTo,
    imageSpoiler?: boolean,
    videoUrl?: string,
    attachments?: import('@shared/types').MessageAttachmentPayload[],
  ) => void;
}>();

const emit = defineEmits<{
  /** Accept friend request then open DM (Echo mode). */
  'accept-request': [requestId: string];
  'select-dm': [userId: string];
  'ignore-request': [requestId: string];
  'back-to-messages': [];
}>();

const selectedRequestWithUser = computed(() => {
  if (!props.selectedRequestId) return null;
  const req = props.messageRequests.find(
    (r) => r.id === props.selectedRequestId,
  );
  if (!req) return null;
  const user = props.users.find((u) => u.id === req.fromUserId);
  return user ? { ...req, user } : null;
});

const requestMessages = computed(() => {
  const req = selectedRequestWithUser.value;
  if (!req) return [];
  return props.messages[req.channelId] ?? [];
});

/** Same shape as normal chat so MessageList + MessageBubble render correctly */
const activeChannelMessages = computed(
  (): (MessageWithAuthor & { channelName?: string })[] => {
    const req = selectedRequestWithUser.value;
    if (!req) return [];
    return requestMessages.value.map((msg) => {
      const user = props.users.find((u) => u.id === msg.authorId);
      const author = user
        ? {
            id: user.id,
            name: user.name,
            avatar: user.pfp,
            status: selectPresence({
              rowStatus: user.status,
              diagnosticsKey: `message-request:${user.id}`,
            }).status as MessageWithAuthor['author']['status'],
          }
        : { id: msg.authorId, name: 'Unknown', avatar: '' };
      return {
        id: msg.id,
        authorId: msg.authorId,
        timestamp: msg.timestamp,
        content: msg.content,
        author,
      };
    });
  },
);

const activeChannelMessagesMap = computed(
  (): Map<string, MessageWithAuthor & { channelName?: string }> => {
    const m = new Map<string, MessageWithAuthor & { channelName?: string }>();
    for (const row of activeChannelMessages.value) {
      if (row.id) m.set(row.id, row);
    }
    return m;
  },
);

const requestChannelId = computed(
  () => selectedRequestWithUser.value?.channelId ?? '',
);

const messageListRef = ref<InstanceType<typeof MessageList> | null>(null);
const markdownPreviewState = ref<{ html: string; expanded: boolean }>({
  html: '',
  expanded: false,
});
provide('markdownPreviewState', markdownPreviewState);
provide('keepLatestMessageVisible', (smooth = false) => {
  nextTick(() => {
    messageListRef.value?.scrollToBottom(smooth);
  });
});
/** MessageList/MessageBubble expect this; ChatView is not an ancestor here. */
provide('openImageViewer', (url: string) => {
  if (!url?.trim()) return;
  void openExternal(safeImageUrl(url));
});
</script>

<template>
  <div
    class="message-requests-view flex h-full flex-col overflow-hidden bg-surface"
  >
    <div
      v-if="!selectedRequestWithUser"
      class="flex flex-1 items-center justify-center px-6"
    >
      <div
        class="max-w-lg rounded-3xl border border-border bg-glass-tint px-6 py-8 text-center"
      >
        <div
          class="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted"
        >
          Message requests
        </div>
        <p class="mt-3 text-sm text-muted">
          Select a request from the sidebar to review the conversation, reply if
          needed, then accept, ignore, or report it.
        </p>
      </div>
    </div>

    <template v-else>
      <div
        class="request-view-header flex h-14 shrink-0 items-center justify-between gap-4 border-b border-border bg-glass-tint px-4 backdrop-blur-xl"
      >
        <div class="flex min-w-0 items-center gap-3">
          <div class="relative h-8 w-8 shrink-0 overflow-hidden rounded-full">
            <PausedGifAvatar
              :src="safeImageUrl(selectedRequestWithUser.user.pfp)"
              :alt="selectedRequestWithUser.user.name"
              :session-key="selectedRequestWithUser.user.id"
              img-class="rounded-full object-cover"
            />
          </div>
          <div class="min-w-0">
            <span
              class="block truncate text-sm font-semibold text-foreground"
              >{{ selectedRequestWithUser.user.name }}</span
            >
            <span class="block truncate text-xs text-muted"
              >Message request</span
            >
          </div>
        </div>
        <div class="flex shrink-0 items-center gap-2">
          <button
            type="button"
            class="mr-back-pill hidden sm:inline-flex items-center gap-1.5 rounded-full bg-glass-tint px-3 py-1 text-[11px] font-medium text-muted backdrop-blur-xl saturate-125 hover:text-foreground"
            @click="emit('back-to-messages')"
          >
            <img
              :src="icons.message"
              alt=""
              class="h-3.5 w-3.5 filter invert opacity-60"
            />
            <span>Back to messages</span>
          </button>
          <button
            type="button"
            class="rounded-lg bg-green-600/80 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-green-600"
            @click="emit('accept-request', selectedRequestWithUser.id)"
          >
            Accept
          </button>
          <button
            type="button"
            class="rounded-lg bg-glass-tint px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-glass-tint"
            @click="emit('ignore-request', selectedRequestWithUser.id)"
          >
            Ignore
          </button>
        </div>
      </div>

      <div class="border-b border-border bg-glass-tint px-4 py-3">
        <div class="flex flex-wrap items-center gap-2">
          <span
            class="rounded-full bg-glass-tint px-2.5 py-1 text-[11px] font-medium text-muted"
          >
            Not friends yet
          </span>
          <span
            class="rounded-full bg-accent/15 px-2.5 py-1 text-[11px] font-medium text-accent"
          >
            You can reply before accepting
          </span>
        </div>
        <p class="mt-2 max-w-2xl text-sm text-muted">
          Review the conversation first. Accept moves this thread into your
          normal direct messages, while Ignore removes the request from your
          queue.
        </p>
      </div>

      <!-- Same message list UI as normal chat -->
      <MessageList
        ref="messageListRef"
        class="flex-1 min-h-0"
        :messages="activeChannelMessagesMap"
        :compact-top="true"
        :show-unread-separator="false"
        :current-user-id="currentUserId"
        :current-user-name="currentUserName"
      />
      <!-- Reply to the message request (sends into this DM) -->
      <ChatInput
        v-if="requestChannelId && sendMessage"
        class="flex-shrink-0"
        :channel-name="selectedRequestWithUser.user.name"
        :channel-id="requestChannelId"
        :users="users"
        :channels="[]"
        :send-message="sendMessage"
      />
    </template>
  </div>
</template>
