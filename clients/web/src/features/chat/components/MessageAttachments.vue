<script setup lang="ts">
import { computed, ref } from 'vue';
import type {
  MessageWithAuthor,
  MessageAttachmentPayload,
} from '@shared/types';
import { openExternal } from '@/platform/desktopBridge';
import { safeImageUrl } from '@/features/layout/display/safeImageUrl';
import { isLikelyGifImageUrl } from '@/features/chat/isGifImageUrl';
import { mediaAspectStyleFromDims } from '@/features/chat/composables/chatMediaAspect';
import GifImage from './GifImage.vue';
import MessageAudioAttachment from './MessageAudioAttachment.vue';
import MessageMediaCollage from './MessageMediaCollage.vue';
import type { CollageSourceItem } from '@/features/chat/domain/messageMediaCollage';
import MessageChatVideo from './MessageChatVideo.vue';
import MessageDocumentAttachment from './MessageDocumentAttachment.vue';
import MessageStickerBitmap from './MessageStickerBitmap.vue';

const props = defineProps<{
  message: MessageWithAuthor;
  attachments?: MessageAttachmentPayload[];
  openImageViewer?: (url: string) => void;
  openDocumentViewer?: (att: MessageAttachmentPayload) => void;
}>();

function onDocumentOpen(att: MessageAttachmentPayload) {
  if (props.openDocumentViewer) {
    props.openDocumentViewer(att);
    return;
  }
  const u = att.url?.trim();
  if (u) void openExternal(u);
}

const mediaRevealed = ref(false);

/**
 * Still images AND GIFs in this message are grouped into one fixed 16:9 collage
 * box, interleaved in attachment order. GIF cells keep their paused-first-frame
 * / hover-to-play behavior (handled inside the collage cell).
 */
const mediaCollageItems = computed<CollageSourceItem[]>(() =>
  (props.attachments ?? [])
    .filter((a) => a.kind === 'image' || a.kind === 'gif')
    .map((a) => {
      const gif = a.kind === 'gif' || isLikelyGifUrl(a.url);
      return {
        url: a.url,
        storageKey: a.storageKey,
        alt: a.filename || props.message.content || (gif ? 'GIF' : 'Image'),
        spoiler: a.spoiler,
        isGif: gif,
      };
    }),
);

/** Legacy single `message.imageUrl` routed through the same fixed 16:9 box. */
const legacyImageItems = computed<CollageSourceItem[]>(() => {
  const url = props.message.imageUrl;
  if (!url) return [];
  return [
    {
      url,
      alt: props.message.content || (props.message.gif ? 'GIF' : 'Image'),
      spoiler: props.message.imageSpoiler,
      isGif: props.message.gif === true || isLikelyGifUrl(url),
    },
  ];
});

function isRenderableSticker(
  sticker: NonNullable<MessageWithAuthor['stickers']>[number],
): boolean {
  return sticker.format !== 'lottie';
}

function isLikelyGifUrl(url: string | undefined): boolean {
  return isLikelyGifImageUrl(url);
}

function mediaAspectStyle(
  media:
    | Pick<MessageAttachmentPayload, 'width' | 'height'>
    | { width?: number; height?: number }
    | undefined,
) {
  return mediaAspectStyleFromDims(media);
}
</script>

<template>
  <div class="message-attachments mt-1 max-w-full min-w-0 space-y-2">
    <template v-if="message.stickers?.length">
      <template
        v-for="(sticker, stickerIdx) in message.stickers"
        :key="`${message.id ?? 'm'}-sticker-${sticker.id}-${stickerIdx}`"
      >
        <button
          v-if="isRenderableSticker(sticker)"
          type="button"
          class="message-sticker-shell block text-left cursor-zoom-in rounded-lg overflow-hidden focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
          @click="openImageViewer?.(sticker.url)"
        >
          <GifImage
            v-if="sticker.format === 'gif' || isLikelyGifUrl(sticker.url)"
            :src="safeImageUrl(sticker.url)"
            :alt="sticker.name"
            reserve-layout
          />
          <MessageStickerBitmap v-else :url="sticker.url" :alt="sticker.name" />
        </button>
        <div v-else class="message-sticker-lottie rounded-lg px-3 py-2">
          <div
            class="text-[10px] font-semibold uppercase tracking-wide text-muted"
          >
            Lottie sticker
          </div>
          <a
            :href="safeImageUrl(sticker.url)"
            class="mt-1 inline-flex text-sm text-fg hover:underline"
            target="_blank"
            rel="noopener noreferrer"
          >
            {{ sticker.name }}
          </a>
        </div>
      </template>
    </template>

    <!-- Multiple attachments (normalized): images + GIFs share one collage box. -->
    <template v-if="attachments?.length">
      <MessageMediaCollage
        v-if="mediaCollageItems.length"
        :items="mediaCollageItems"
        @open="(u) => openImageViewer?.(u)"
      />
      <template
        v-for="(att, attIdx) in attachments"
        :key="`${message.id ?? 'm'}-att-${attIdx}`"
      >
        <div v-if="att.kind === 'video'" class="message-video-shell">
          <MessageChatVideo
            :url="att.url"
            :storage-key="att.storageKey"
            :filename="att.filename"
            :spoiler="att.spoiler"
            :media-style="mediaAspectStyle(att)"
          />
        </div>
        <MessageAudioAttachment
          v-else-if="att.kind === 'audio'"
          :url="att.url"
          :storage-key="att.storageKey"
          :filename="att.filename"
          :spoiler="att.spoiler"
        />
        <MessageDocumentAttachment
          v-else-if="att.kind === 'document'"
          :attachment="att"
          @open="onDocumentOpen(att)"
        />
      </template>
    </template>

    <!-- Legacy single videoUrl -->
    <div v-else-if="message.videoUrl" class="mt-1 max-w-full min-w-0">
      <div v-if="message.imageSpoiler" class="media-spoiler-container">
        <button
          v-if="!mediaRevealed"
          type="button"
          class="media-spoiler-btn chat-focus-ring inline-flex items-center gap-2 rounded-lg px-4 py-3 bg-overlay-heavy hover:bg-overlay-heavy text-amber-400/90 hover:text-amber-400 text-xs font-semibold uppercase tracking-wider transition-colors"
          @click="mediaRevealed = true"
        >
          <span>Spoiler</span>
          <span class="text-[10px] opacity-80">— Click to reveal</span>
        </button>
        <div v-else class="message-video-shell">
          <MessageChatVideo :url="message.videoUrl" />
          <button
            type="button"
            class="media-spoiler-hide chat-focus-ring absolute right-3 top-3 rounded px-2 py-1 text-[10px] font-semibold uppercase bg-overlay-heavy text-amber-400 hover:bg-overlay-heavy z-10"
            @click="mediaRevealed = false"
          >
            Hide
          </button>
        </div>
      </div>
      <div v-else class="message-video-shell">
        <MessageChatVideo :url="message.videoUrl" />
      </div>
    </div>

    <!-- Legacy single imageUrl -> same fixed 16:9 collage box -->
    <div v-else-if="message.imageUrl" class="mt-1 max-w-full min-w-0">
      <MessageMediaCollage
        :items="legacyImageItems"
        @open="(u) => openImageViewer?.(u)"
      />
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '@/features/chat/styles/messageBubble.scss';

.message-attachments {
  // Ensure styles from messageBubble.scss that target these elements work
  :deep(.message-video-shell) {
    position: relative;
    max-width: min(100%, 28rem);
    width: fit-content;
    min-width: 0;
    border-radius: 0.5rem;
    overflow: hidden;
    background: var(--msg-video-inner-bg);
    padding: 0;
    border: none;
    box-shadow: none;
    backdrop-filter: none;
  }
  :deep(.message-video-shell:has(.echo-video-player--expanded)) {
    max-width: min(100%, min(92vw, 56rem));
  }
  :deep(.message-video) {
    max-width: min(100%, 28rem);
    max-height: min(80vh, 24rem);
    display: block;
  }
  :deep(.message-image-shell) {
    display: block;
    width: 100%;
    max-width: min(100%, 40rem);
    min-height: 0;
    border-radius: 0.5rem;
    overflow: hidden;
    background: var(--msg-video-inner-bg);
  }
  :deep(.message-image) {
    display: block;
    width: auto;
    max-width: 100%;
    height: auto;
    max-height: min(80vh, 36rem);
    object-fit: contain;
  }
  :deep(.message-image--boxed) {
    width: 100%;
    height: 100%;
    max-height: none;
    object-fit: contain;
  }
  :deep(.message-sticker-shell) {
    width: fit-content;
    max-width: min(100%, 22rem);
    background: transparent;
  }
  :deep(.message-sticker) {
    display: block;
    max-width: min(100%, 22rem);
    max-height: 22rem;
    width: auto;
    height: auto;
    object-fit: contain;
  }
  :deep(.message-sticker-lottie) {
    max-width: min(100%, 22rem);
    background: var(--msg-video-inner-bg);
  }
}
</style>
