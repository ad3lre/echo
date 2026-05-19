<script setup lang="ts">
import type { Embed } from '@shared/types';
import { openExternal } from '@/platform/desktopBridge';

const props = defineProps<{
  embed: Embed;
  onJump?: (channelId: string, messageId: string) => void;
}>();

function truncate(text: string, max: number) {
  const t = text.replace(/\s+/g, ' ').trim();
  return t.length <= max ? t : `${t.slice(0, max - 1)}…`;
}

async function onClick() {
  const j = props.embed.echoJump;
  if (!j) return;
  if (props.onJump) {
    props.onJump(j.channelId, j.messageId);
    return;
  }
  const u = props.embed.url?.trim();
  if (u) await openExternal(u);
}
</script>

<template>
  <button
    v-if="embed.echoJump"
    type="button"
    class="message-jump-embed chat-focus-ring flex w-full max-w-md min-w-0 cursor-pointer flex-col gap-0.5 rounded border-l-[3px] border-[#5865f2] bg-glass-2 px-2.5 py-2 text-left transition-colors hover:bg-glass-hover"
    @click="onClick"
  >
    <div class="text-[10px] font-bold uppercase tracking-wide text-fg-subtle">
      Echo · message link
    </div>
    <div class="text-xs font-semibold text-fg">
      {{ embed.title || '#channel' }}
    </div>
    <div v-if="embed.author?.name" class="text-[11px] text-[#00a8fc]">
      @{{ embed.author.name }}
    </div>
    <div
      v-if="embed.description"
      class="line-clamp-2 text-xs leading-snug text-fg-soft"
    >
      {{ truncate(embed.description, 220) }}
    </div>
  </button>
</template>
