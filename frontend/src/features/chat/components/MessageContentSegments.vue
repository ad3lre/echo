<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue';
import type { Embed, MentionEntity } from '@shared/types';
import type { IdTokenResolvers } from '@/composables/useMarkdown';
import {
  buildRenderedEchoMessageSegments,
  echoMessageSegmentRowKey,
  type EchoRenderedMessageRow,
  type MagicTimeRenderContext,
} from '@/features/chat/viewModel/messageContentSegments';
import { markdownKatexReadyVersion } from '@/composables/markdownKatex';
import { normalizeExternalUrlForOpen } from '@/platform/desktopBridge';
import ChatInviteEmbed from './ChatInviteEmbed.vue';
import MessageJumpEmbed from './MessageJumpEmbed.vue';
import MessageImageSlot from './MessageImageSlot.vue';
import MessageButtonRow from './MessageButtonRow.vue';
import MessageLinkHoverPreview from './MessageLinkHoverPreview.vue';

const props = defineProps<{
  content: string;
  mentions?: MentionEntity[];
  parseIdResolvers?: IdTokenResolvers;
  embeds?: Embed[];
  contentJson?: unknown;
  onJumpToMessage?: (channelId: string, messageId: string) => void;
  magicTime?: MagicTimeRenderContext | null;
  canFillImageSlots?: boolean;
  onFillImageSlot?: (slotId: string) => void;
}>();

const renderedRows = computed(() => {
  // Re-render once KaTeX (and its CSS) finish lazy-loading.
  void markdownKatexReadyVersion.value;
  return buildRenderedEchoMessageSegments(
    props.content,
    props.embeds,
    props.mentions,
    props.parseIdResolvers,
    props.magicTime,
    props.contentJson,
  );
});

const activeLink = ref<{
  href: string;
  anchorRect: DOMRect;
  embed?: Embed;
} | null>(null);
let hideTimer: ReturnType<typeof setTimeout> | null = null;

const linkPreviewEmbeds = computed(() =>
  (props.embeds ?? []).filter((e) => e.url?.trim() && !e.echoJump),
);

function clearHideTimer() {
  if (hideTimer === null) return;
  clearTimeout(hideTimer);
  hideTimer = null;
}

function scheduleHideLinkPreview(delay = 140) {
  clearHideTimer();
  hideTimer = setTimeout(() => {
    activeLink.value = null;
    hideTimer = null;
  }, delay);
}

function findPreviewEmbed(href: string): Embed | undefined {
  const normalized = normalizeExternalUrlForOpen(href);
  if (!normalized) return undefined;
  return linkPreviewEmbeds.value.find((embed) => {
    const raw = embed.url?.trim();
    if (!raw) return false;
    return normalizeExternalUrlForOpen(raw) === normalized;
  });
}

function anchorFromEventTarget(
  target: EventTarget | null,
): HTMLAnchorElement | null {
  if (!(target instanceof Element)) return null;
  const anchor = target.closest('a[href^="http://"], a[href^="https://"]');
  return anchor instanceof HTMLAnchorElement ? anchor : null;
}

function showLinkPreview(anchor: HTMLAnchorElement) {
  const href = normalizeExternalUrlForOpen(anchor.href);
  if (!href) return;
  clearHideTimer();
  activeLink.value = {
    href,
    anchorRect: anchor.getBoundingClientRect(),
    embed: findPreviewEmbed(href),
  };
}

function onSegmentPointerOver(event: PointerEvent) {
  if (event.pointerType === 'touch') return;
  const anchor = anchorFromEventTarget(event.target);
  if (!anchor) return;
  const related = event.relatedTarget;
  if (related instanceof Node && anchor.contains(related)) return;
  showLinkPreview(anchor);
}

function onSegmentPointerOut(event: PointerEvent) {
  const anchor = anchorFromEventTarget(event.target);
  if (!anchor) return;
  const related = event.relatedTarget;
  if (related instanceof Node && anchor.contains(related)) return;
  scheduleHideLinkPreview();
}

function onSegmentFocusIn(event: FocusEvent) {
  const anchor = anchorFromEventTarget(event.target);
  if (anchor) showLinkPreview(anchor);
}

function onSegmentFocusOut() {
  scheduleHideLinkPreview();
}

onBeforeUnmount(() => {
  clearHideTimer();
});

function embedMarginClass(i: number): string {
  if (i === 0) return '';
  return 'mt-2';
}

function rowKey(row: EchoRenderedMessageRow, i: number): string {
  return echoMessageSegmentRowKey(row, i);
}
</script>

<template>
  <template v-for="(row, i) in renderedRows" :key="rowKey(row, i)">
    <!-- Use a div (not span): block-level markdown (e.g. || multi-line || → div.spoiler) is invalid inside span and browsers break the tree, which breaks spoiler click targeting. -->
    <div
      v-if="row.type === 'text' && row.text"
      class="message-content-segment min-w-0"
      v-html="row.html"
      @pointerover="onSegmentPointerOver"
      @pointerout="onSegmentPointerOut"
      @focusin="onSegmentFocusIn"
      @focusout="onSegmentFocusOut"
    />
    <ChatInviteEmbed
      v-else-if="row.type === 'invite'"
      :href="row.url"
      :class="embedMarginClass(i)"
    />
    <MessageJumpEmbed
      v-else-if="row.type === 'jump'"
      :embed="row.embed"
      :on-jump="onJumpToMessage"
      :class="embedMarginClass(i)"
    />
    <MessageImageSlot
      v-else-if="row.type === 'imageSlot'"
      :slot-id="row.slotId"
      :aspect-w="row.aspectW"
      :aspect-h="row.aspectH"
      :image-url="row.imageUrl"
      :storage-key="row.storageKey ?? undefined"
      :width="row.width"
      :height="row.height"
      :can-fill="canFillImageSlots"
      :class="embedMarginClass(i)"
      @fill="(slotId) => onFillImageSlot?.(slotId)"
    />
    <MessageButtonRow
      v-else-if="row.type === 'buttonRow'"
      :buttons="row.buttons"
      :class="embedMarginClass(i)"
    />
  </template>
  <Teleport to="body">
    <MessageLinkHoverPreview
      v-if="activeLink"
      :href="activeLink.href"
      :embed="activeLink.embed"
      :anchor-rect="activeLink.anchorRect"
      @pointerenter="clearHideTimer"
      @pointerleave="() => scheduleHideLinkPreview()"
    />
  </Teleport>
</template>
