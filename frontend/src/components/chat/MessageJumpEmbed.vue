<script setup lang="ts">
import { computed } from 'vue';
import type { Embed } from '@shared/types';
import { echoJumpErrorMessage } from '@shared/echoJumpEmbedErrors';
import { openExternal } from '@/platform/desktopBridge';
import { useMessageJumpEmbedPreview } from '@/features/chat/composables/useMessageJumpEmbedPreview';

const props = defineProps<{
  embed: Embed;
  onJump?: (channelId: string, messageId: string) => void;
}>();

const { displayEmbed, loading, resolveError } = useMessageJumpEmbedPreview(
  () => props.embed,
);

const cardEmbed = computed(() => displayEmbed.value ?? props.embed);

const hasError = computed(() =>
  Boolean(resolveError.value || cardEmbed.value.echoJumpError),
);

const errorMessage = computed(() => {
  const code = resolveError.value ?? cardEmbed.value.echoJumpError;
  if (code) return echoJumpErrorMessage(code);
  return cardEmbed.value.description?.trim() ?? '';
});

const accentColor = computed(() => {
  if (hasError.value) return '#ed4245';
  const c = cardEmbed.value.color;
  if (c != null && c >= 0) {
    const n = Math.min(0xffffff, Math.max(0, Math.floor(c)));
    return `#${n.toString(16).padStart(6, '0')}`;
  }
  return '#5865f2';
});

function truncate(text: string, max: number) {
  const t = text.replace(/\s+/g, ' ').trim();
  return t.length <= max ? t : `${t.slice(0, max - 1)}…`;
}

function formatTimestamp(raw: string | undefined): string {
  const s = raw?.trim();
  if (!s) return '';
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

async function onClick() {
  if (hasError.value) return;
  const j = cardEmbed.value.echoJump;
  if (!j) return;
  if (props.onJump) {
    props.onJump(j.channelId, j.messageId);
    return;
  }
  const u = cardEmbed.value.url?.trim();
  if (u) await openExternal(u);
}

const fallbackHref = computed(() => props.embed.url?.trim() ?? '');

async function openFallbackLink() {
  const u = fallbackHref.value;
  if (u) await openExternal(u);
}
</script>

<template>
  <article
    class="message-jump-embed relative w-full max-w-md overflow-hidden rounded-lg bg-elevated shadow-md"
    :class="{
      'message-jump-embed--loading': loading,
      'message-jump-embed--error': hasError,
    }"
    :aria-busy="loading"
    :aria-label="
      hasError
        ? 'Message link preview unavailable'
        : 'Echo message link preview'
    "
  >
    <div class="flex min-w-0">
      <div
        class="message-jump-embed__accent w-1 shrink-0 self-stretch rounded-l-[inherit]"
        :style="{ background: accentColor }"
        aria-hidden="true"
      />

      <div class="min-w-0 flex-1 px-3 py-2.5">
        <div
          class="text-[10px] font-bold uppercase tracking-[0.14em] text-fg-subtle"
        >
          {{ hasError ? 'Echo · link unavailable' : 'Echo · message link' }}
        </div>

        <div
          v-if="loading"
          class="message-jump-embed__skeleton mt-2 space-y-2"
          aria-hidden="true"
        >
          <div class="h-3.5 w-2/5 rounded bg-glass-2" />
          <div class="h-3 w-full rounded bg-glass-2" />
          <div class="h-3 w-4/5 rounded bg-glass-2" />
        </div>

        <button
          v-else-if="cardEmbed.echoJump && !hasError"
          type="button"
          class="message-jump-embed__body chat-focus-ring mt-1 w-full cursor-pointer text-left"
          @click="onClick"
        >
          <div class="text-[15px] font-semibold leading-snug text-fg">
            {{ cardEmbed.title || '#channel' }}
          </div>
          <div
            v-if="cardEmbed.author?.name"
            class="mt-0.5 text-[11px] font-semibold text-[#00a8fc]"
          >
            @{{ cardEmbed.author.name }}
          </div>
          <div
            v-if="cardEmbed.description && !hasError"
            class="mt-1 line-clamp-3 whitespace-pre-wrap break-words text-xs leading-snug text-fg-soft"
          >
            {{ truncate(cardEmbed.description, 220) }}
          </div>
          <div
            v-if="cardEmbed.timestamp"
            class="mt-1.5 text-[10px] text-fg-subtle"
          >
            {{ formatTimestamp(cardEmbed.timestamp) }}
          </div>
        </button>

        <div v-else-if="hasError" class="mt-1">
          <div class="text-[15px] font-semibold leading-snug text-fg">
            {{ cardEmbed.title || 'Message link' }}
          </div>
          <p class="mt-1 text-xs leading-snug text-[#f23f43]">
            {{ errorMessage }}
          </p>
          <a
            v-if="fallbackHref"
            :href="fallbackHref"
            class="mt-2 inline-block text-[11px] text-[#00a8fc] hover:underline break-all"
            target="_blank"
            rel="noopener noreferrer"
            @click.prevent="openFallbackLink"
          >
            Open original link
          </a>
        </div>
      </div>
    </div>
  </article>
</template>

<style scoped>
.message-jump-embed--loading {
  opacity: 0.92;
}

.message-jump-embed__body {
  border: none;
  background: transparent;
  padding: 0;
  transition: opacity 0.15s ease;
}

.message-jump-embed__body:hover {
  opacity: 0.92;
}

.message-jump-embed__skeleton > div {
  animation: message-jump-pulse 1.2s ease-in-out infinite;
}

@keyframes message-jump-pulse {
  0%,
  100% {
    opacity: 0.45;
  }
  50% {
    opacity: 0.85;
  }
}

@media (prefers-reduced-motion: reduce) {
  .message-jump-embed__skeleton > div {
    animation: none;
    opacity: 0.6;
  }
}
</style>
