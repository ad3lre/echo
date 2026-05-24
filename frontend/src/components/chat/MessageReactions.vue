<script setup lang="ts">
import { ref, inject, onBeforeUnmount, type ComputedRef } from 'vue';
import type { MessageWithAuthor } from '@shared/types';
import { renderSingleEmojiHtml } from '@/utils/customEmojiDisplay';
import { isEchoEmojiTokenResolveMiss } from '@/composables/useGlobalEmojiTokenResolver';
import MessageReactionsRow from '@/features/chat/components/MessageReactionsRow.vue';
import MessageReactionEmojiPopover from './MessageReactionEmojiPopover.vue';
import MessageReactionHoverCard from './MessageReactionHoverCard.vue';

const props = defineProps<{
  message: MessageWithAuthor;
  serverId?: string;
  channelId?: string;
  currentUserId?: string;
  currentUserDisplayName?: string;
  resolveReactorDisplay?: (userId: string) => string;
  resolveReactorAvatar?: (userId: string) => string | undefined;
  onReact?: (emoji: string) => void;
}>();

const reactionPopoverOpen = ref(false);
const reactionTriggerRect = ref<DOMRect | null>(null);
const poppingEmojiKey = ref<string | null>(null);
const hoverReaction = ref<{
  emoji: string;
  count: number;
  userIds: string[];
} | null>(null);
const hoverTriggerRect = ref<DOMRect | null>(null);
const hoverCardOpen = ref(false);
let hoverOpenTimer: ReturnType<typeof setTimeout> | null = null;
let hoverCloseTimer: ReturnType<typeof setTimeout> | null = null;

const customEmojiUrlById = inject<ComputedRef<Map<string, string>> | undefined>(
  'customEmojiUrlById',
  undefined,
);

const ensureCustomEmojiId = inject<((id: string) => void) | undefined>(
  'ensureCustomEmojiId',
  undefined,
);

function parseSingleEmojiForReactions(emoji: string): string {
  return renderSingleEmojiHtml(emoji, {
    cachedById: customEmojiUrlById?.value,
    echoResolveMissed: isEchoEmojiTokenResolveMiss,
    ensureEmojiId: ensureCustomEmojiId,
    allowDiscordCdnGuess: true,
  });
}

function handleReactionClick(emoji: string) {
  props.onReact?.(emoji);
}

function openReactionPopoverFromPill(e: MouseEvent) {
  const target = e.currentTarget as HTMLElement | null;
  if (target) {
    reactionTriggerRect.value = target.getBoundingClientRect();
  }
  reactionPopoverOpen.value = true;
}

function handleReact(emoji: string) {
  props.onReact?.(emoji);
  reactionPopoverOpen.value = false;
}

function clearHoverTimers() {
  if (hoverOpenTimer) {
    clearTimeout(hoverOpenTimer);
    hoverOpenTimer = null;
  }
  if (hoverCloseTimer) {
    clearTimeout(hoverCloseTimer);
    hoverCloseTimer = null;
  }
}

function onReactionHoverStart(
  reaction: { emoji: string; count: number; userIds: string[] },
  anchorEl: HTMLElement,
) {
  clearHoverTimers();
  hoverReaction.value = reaction;
  hoverTriggerRect.value = anchorEl.getBoundingClientRect();
  hoverOpenTimer = setTimeout(() => {
    hoverOpenTimer = null;
    hoverCardOpen.value = true;
  }, 90);
}

function onReactionHoverEnd() {
  if (reactionPopoverOpen.value) return;
  if (hoverOpenTimer) {
    clearTimeout(hoverOpenTimer);
    hoverOpenTimer = null;
  }
  hoverCloseTimer = setTimeout(() => {
    hoverCloseTimer = null;
    hoverCardOpen.value = false;
  }, 120);
}

function onHoverCardEnter() {
  if (hoverCloseTimer) {
    clearTimeout(hoverCloseTimer);
    hoverCloseTimer = null;
  }
}

function onHoverCardLeave() {
  onReactionHoverEnd();
}

onBeforeUnmount(() => {
  clearHoverTimers();
});

defineExpose({
  reactionPopoverOpen,
  openReactionPopover: (rect: DOMRect | null) => {
    reactionTriggerRect.value = rect;
    reactionPopoverOpen.value = true;
  },
  setPoppingEmoji: (key: string | null) => {
    poppingEmojiKey.value = key;
  },
});
</script>

<template>
  <div class="message-reactions">
    <MessageReactionsRow
      v-if="message.reactions"
      :reactions="message.reactions"
      :message-id="message.id"
      :current-user-id="currentUserId"
      :popping-emoji-key="poppingEmojiKey"
      :parse-single-emoji="parseSingleEmojiForReactions"
      :on-reaction-click="handleReactionClick"
      :on-add-reaction="openReactionPopoverFromPill"
      :on-reaction-hover-start="onReactionHoverStart"
      :on-reaction-hover-end="onReactionHoverEnd"
    />
    <MessageReactionEmojiPopover
      v-model="reactionPopoverOpen"
      :trigger-rect="reactionTriggerRect"
      :server-id="serverId"
      :channel-id="channelId"
      @select="handleReact"
    />
    <MessageReactionHoverCard
      :open="hoverCardOpen && !reactionPopoverOpen"
      :reaction="hoverReaction"
      :trigger-rect="hoverTriggerRect"
      :parse-single-emoji-for-reactions="parseSingleEmojiForReactions"
      :resolve-reactor-display="resolveReactorDisplay"
      :resolve-reactor-avatar="resolveReactorAvatar"
      :current-user-id="currentUserId"
      :current-user-display-name="currentUserDisplayName"
      @card-mouseenter="onHoverCardEnter"
      @card-mouseleave="onHoverCardLeave"
    />
  </div>
</template>
