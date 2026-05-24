<script setup lang="ts">
import { computed } from 'vue';
import type { Embed } from '@shared/types';
import { openExternal } from '@/platform/desktopBridge';
import { useMessageJumpEmbedPreview } from '@/features/chat/composables/useMessageJumpEmbedPreview';

const props = defineProps<{
  embed: Embed;
  onJump?: (channelId: string, messageId: string) => void;
}>();

const { displayEmbed, loading, resolveFailed } = useMessageJumpEmbedPreview(
  () => props.embed,
);

const cardEmbed = computed(() => displayEmbed.value ?? props.embed);

function truncate(text: string, max: number) {
  const t = text.replace(/\s+/g, ' ').trim();
  return t.length <= max ? t : `${t.slice(0, max - 1)}…`;
}

async function onClick() {
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
  <a
    v-if="resolveFailed && fallbackHref"
    :href="fallbackHref"
    class="message-jump-embed-fallback text-[#00a8fc] hover:underline break-all"
    target="_blank"
    rel="noopener noreferrer"
    @click.prevent="openFallbackLink"
  >
    {{ fallbackHref }}
  </a>
  <button
    v-else-if="cardEmbed.echoJump"
    type="button"
    class="message-jump-embed chat-focus-ring flex w-full max-w-md min-w-0 cursor-pointer flex-col gap-0.5 rounded border-l-[3px] border-[#5865f2] bg-glass-2 px-2.5 py-2 text-left transition-colors hover:bg-glass-hover"
    :class="{ 'opacity-90': loading }"
    :aria-busy="loading"
    @click="onClick"
  >
    <div class="text-[10px] font-bold uppercase tracking-wide text-fg-subtle">
      Echo · message link
    </div>
    <div class="text-xs font-semibold text-fg">
      {{ cardEmbed.title || '#channel' }}
    </div>
    <div v-if="cardEmbed.author?.name" class="text-[11px] text-[#00a8fc]">
      @{{ cardEmbed.author.name }}
    </div>
    <div
      v-if="cardEmbed.description"
      class="line-clamp-2 text-xs leading-snug text-fg-soft"
    >
      {{ truncate(cardEmbed.description, 220) }}
    </div>
  </button>
</template>
