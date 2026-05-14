<script setup lang="ts">
import { ref } from 'vue';
import type {
  MessageWithAuthor,
  MessageAttachmentPayload,
} from '@shared/types';
import { safeImageUrl } from '@/utils/safeImageUrl';
import GifImage from './GifImage.vue';
import MessageAudioAttachment from './MessageAudioAttachment.vue';
import MessageChatStillImage from './MessageChatStillImage.vue';
import MessageChatVideo from './MessageChatVideo.vue';
import MessageStickerBitmap from './MessageStickerBitmap.vue';

defineProps<{
  message: MessageWithAuthor;
  attachments?: MessageAttachmentPayload[];
  openImageViewer?: (url: string) => void;
}>();

const mediaRevealed = ref(false);

function isRenderableSticker(
  sticker: NonNullable<MessageWithAuthor['stickers']>[number],
): boolean {
  return sticker.format !== 'lottie';
}

function isLikelyGifUrl(url: string | undefined): boolean {
  if (!url) return false;
  const u = url.toLowerCase();
  return u.includes('giphy') || u.includes('.gif') || u.includes('media.giphy');
}

function mediaAspectStyle(
  media:
    | Pick<MessageAttachmentPayload, 'width' | 'height'>
    | { width?: number; height?: number }
    | undefined,
) {
  const width = media?.width;
  const height = media?.height;
  if (
    typeof width === 'number' &&
    width > 0 &&
    typeof height === 'number' &&
    height > 0
  ) {
    return { aspectRatio: `${width} / ${height}` };
  }
  return undefined;
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

    <!-- Multiple attachments (normalized) -->
    <template v-if="attachments?.length">
      <template
        v-for="(att, attIdx) in attachments"
        :key="`${message.id ?? 'm'}-att-${attIdx}`"
      >
        <div v-if="att.kind === 'video'" class="message-video-shell">
          <MessageChatVideo :url="att.url" />
        </div>
        <MessageAudioAttachment
          v-else-if="att.kind === 'audio'"
          :url="att.url"
          :filename="att.filename"
          :spoiler="att.spoiler"
        />
        <button
          v-else-if="att.kind === 'gif' || isLikelyGifUrl(att.url)"
          type="button"
          class="block text-left cursor-zoom-in rounded-lg overflow-hidden focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
          @click="openImageViewer?.(att.url)"
        >
          <GifImage
            :src="safeImageUrl(att.url)"
            :alt="att.filename || message.content || 'GIF'"
          />
        </button>
        <MessageChatStillImage
          v-else
          :url="att.url"
          :alt="att.filename || message.content || 'Image'"
          :image-style="mediaAspectStyle(att)"
          openable
          @open="openImageViewer?.(att.url)"
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

    <!-- Legacy single imageUrl -->
    <div v-else-if="message.imageUrl" class="mt-1 max-w-full min-w-0">
      <!-- Spoiled media: one button to reveal all -->
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
        <div v-else class="relative inline-block">
          <button
            v-if="message.gif || isLikelyGifUrl(message.imageUrl)"
            type="button"
            class="block text-left cursor-zoom-in rounded-lg overflow-hidden focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
            @click="openImageViewer?.(message.imageUrl ?? '')"
          >
            <GifImage
              :src="safeImageUrl(message.imageUrl ?? '')"
              :alt="message.content || 'GIF'"
            />
          </button>
          <MessageChatStillImage
            v-else
            :url="message.imageUrl ?? ''"
            :alt="message.content || 'Image'"
            :image-style="mediaAspectStyle(undefined)"
            openable
            @open="openImageViewer?.(message.imageUrl ?? '')"
          />
          <button
            type="button"
            class="media-spoiler-hide chat-focus-ring absolute right-2 top-2 rounded px-2 py-1 text-[10px] font-semibold uppercase bg-overlay-heavy text-amber-400 hover:bg-overlay-heavy z-10"
            @click="mediaRevealed = false"
          >
            Hide
          </button>
        </div>
      </div>
      <!-- Non-spoiled media -->
      <button
        v-else-if="message.gif || isLikelyGifUrl(message.imageUrl)"
        type="button"
        class="block text-left cursor-zoom-in rounded-lg overflow-hidden focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
        @click="openImageViewer?.(message.imageUrl ?? '')"
      >
        <GifImage
          :src="safeImageUrl(message.imageUrl ?? '')"
          :alt="message.content || 'GIF'"
        />
      </button>
      <MessageChatStillImage
        v-else
        :url="message.imageUrl ?? ''"
        :alt="message.content || 'Image'"
        :image-style="mediaAspectStyle(undefined)"
        openable
        @open="openImageViewer?.(message.imageUrl ?? '')"
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
    max-width: 100%;
    width: fit-content;
    border-radius: 0.5rem;
    overflow: hidden;
    background: var(--msg-video-inner-bg);
  }
  :deep(.message-video) {
    max-width: 100%;
    max-height: 80vh;
    display: block;
  }
  :deep(.message-image-shell) {
    display: block;
    width: fit-content;
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
