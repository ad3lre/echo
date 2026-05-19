<script setup lang="ts">
import { computed, inject, type ComputedRef } from 'vue';
import type { MessageWithAuthor } from '@shared/types';
import {
  parseMessageContent,
  type IdTokenResolvers,
} from '@/composables/useMarkdown';
import {
  applyMagicTimeToPlaintext,
  buildMagicTimeParseCacheExtra,
  replaceMagicTimePlaceholdersInHtml,
} from '@/features/chat/viewModel/magicTimeMarkdown';
import {
  loadTimeLanguagePreferences,
  timeLanguagePrefsEpoch,
} from '@/features/settings/timeLanguagePreferences';
import { safeImageUrl } from '@/utils/safeImageUrl';
import LimitedGifImg from '@/components/LimitedGifImg.vue';
import PausedGifAvatar from '@/components/PausedGifAvatar.vue';
import { formatTimestamp } from '@/utils/formatTimestamp';

const props = defineProps<{
  message: MessageWithAuthor & { channelId?: string; channelName?: string };
}>();

const idTokenResolvers = inject<
  ComputedRef<IdTokenResolvers | undefined> | undefined
>('idTokenResolvers', undefined);
const parseIdResolvers = computed(() => idTokenResolvers?.value);

const renderedMessageHtml = computed(() => {
  void timeLanguagePrefsEpoch.value;
  const content = props.message.content ?? '';
  const mentions = props.message.mentions;
  const res = parseIdResolvers.value;
  const prefs = loadTimeLanguagePreferences();
  const sender =
    typeof props.message.author?.timeZone === 'string'
      ? props.message.author.timeZone.trim()
      : '';
  const ts = props.message.timestamp;
  if (!sender || !ts) {
    return parseMessageContent(content, mentions, res);
  }
  if (prefs.timeZone === sender) {
    return parseMessageContent(content, mentions, res);
  }
  const ctx = {
    messageTimestampIso: ts,
    senderTimeZone: sender,
    viewerTimeZone: prefs.timeZone,
    viewerLocale: prefs.locale,
  };
  const { text: z, slots } = applyMagicTimeToPlaintext(content, ctx);
  let html = parseMessageContent(z, mentions, res, 0, {
    parseCacheExtra: buildMagicTimeParseCacheExtra(ctx),
  });
  html = replaceMagicTimePlaceholdersInHtml(html, slots);
  return html;
});

const emit = defineEmits<{
  goToMessage: [channelId: string, messageId: string];
}>();

function handleClick() {
  const chId = props.message.channelId;
  const msgId = props.message.id;
  if (chId && msgId) emit('goToMessage', chId, msgId);
}

function isLikelyGifUrl(url: string | undefined): boolean {
  if (!url) return false;
  const u = url.toLowerCase();
  return u.includes('giphy') || u.includes('.gif') || u.includes('media.giphy');
}

const hasImage = computed(
  () => !!(props.message.imageUrl || props.message.gif),
);
const isGif = computed(
  () => props.message.gif || isLikelyGifUrl(props.message.imageUrl),
);
const firstRenderableSticker = computed(() =>
  props.message.stickers?.find((sticker) => sticker.format !== 'lottie'),
);
const hasVideo = computed(() => !!props.message.videoUrl);
const hasAudio = computed(() => !!props.message.audioUrl);
const hasSticker = computed(() => (props.message.stickers?.length ?? 0) > 0);
const hasDocs = computed(
  () =>
    (props.message.attachments?.length ?? 0) > 0 &&
    props.message.attachments?.some((a) => {
      const m = (a.mimeType ?? '').toLowerCase();
      return (
        m.startsWith('application/') ||
        m.includes('pdf') ||
        m.includes('document')
      );
    }),
);

const timestampLabel = computed(() => formatTimestamp(props.message.timestamp));
</script>

<template>
  <button
    type="button"
    class="flex w-full items-start gap-2 py-2 px-4 hover:bg-glass-1 rounded text-sm text-left cursor-pointer"
    @click="handleClick"
  >
    <div class="relative mt-0.5 h-6 w-6 shrink-0 overflow-hidden rounded-full">
      <PausedGifAvatar
        :src="safeImageUrl(message.author.avatar)"
        :alt="message.author.name"
        :session-key="message.authorId"
        img-class="rounded-full object-cover"
      />
    </div>
    <div class="min-w-0 flex-1 flex gap-2">
      <div class="min-w-0 flex-1">
        <div class="flex flex-wrap items-baseline gap-1.5">
          <span class="font-semibold text-foreground">{{
            message.author.name
          }}</span>
          <span class="text-xs text-muted">{{ timestampLabel }}</span>
        </div>
        <div
          v-spoiler-reveal
          class="message-preview mt-0.5 text-muted line-clamp-2 break-words"
          v-html="renderedMessageHtml"
        />
        <!-- Media type badges when no image preview -->
        <div
          v-if="!hasImage && !hasSticker && (hasVideo || hasAudio || hasDocs)"
          class="mt-1 flex flex-wrap gap-1"
        >
          <span
            v-if="hasVideo"
            class="text-[10px] px-1.5 py-0.5 rounded bg-glass-2 text-muted"
            >video</span
          >
          <span
            v-if="hasAudio"
            class="text-[10px] px-1.5 py-0.5 rounded bg-glass-2 text-muted"
            >audio</span
          >
          <span
            v-if="hasDocs"
            class="text-[10px] px-1.5 py-0.5 rounded bg-glass-2 text-muted"
            >doc</span
          >
        </div>
        <div
          v-else-if="!hasImage && hasSticker"
          class="mt-1 flex flex-wrap gap-1"
        >
          <span class="text-[10px] px-1.5 py-0.5 rounded bg-glass-2 text-muted"
            >sticker</span
          >
        </div>
      </div>
      <!-- Media thumbnail -->
      <div
        v-if="hasImage || firstRenderableSticker"
        class="w-12 h-12 shrink-0 rounded overflow-hidden bg-scrim-2 flex items-center justify-center"
      >
        <img
          v-if="firstRenderableSticker && !hasImage"
          :src="safeImageUrl(firstRenderableSticker.url)"
          :alt="firstRenderableSticker.name"
          class="w-full h-full object-contain"
        />
        <LimitedGifImg
          v-else-if="isGif"
          :src="safeImageUrl(message.imageUrl)"
          :session-key="`${message.id ?? ''}-${message.imageUrl}`"
          :alt="message.content || 'GIF'"
          wrapper-class="flex h-full w-full items-center justify-center"
          img-class="max-h-full max-w-full object-contain"
          :respect-reduced-motion="true"
        />
        <img
          v-else
          :src="safeImageUrl(message.imageUrl)"
          :alt="message.content || 'Image'"
          class="max-h-full max-w-full object-contain"
        />
      </div>
    </div>
  </button>
</template>

<style scoped>
.message-preview :deep(.emoji) {
  height: 1em;
  width: 1em;
  display: inline;
}
</style>
