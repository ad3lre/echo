<script setup lang="ts">
import { computed } from 'vue';
import type { MessageListRowPresentation } from '@/features/chat/presentation/messageListRowPresentation';
import { buildMessageRowShellLayout } from '@/features/chat/domain/messageRowShellLayout';
import { formatShortTime } from '@/utils/formatTimestamp';

const props = defineProps<{
  row: MessageListRowPresentation;
  authorName: string;
}>();

const shell = computed(() =>
  buildMessageRowShellLayout(props.row, props.authorName),
);
const message = computed(() => props.row.message);
const shortTime = computed(() =>
  message.value.timestamp ? formatShortTime(message.value.timestamp) : '',
);

function lineWidthClass(line: string, index: number): string {
  const len = line.trim().length;
  if (len > 96) return index % 2 === 0 ? 'w-11/12' : 'w-10/12';
  if (len > 56) return index % 2 === 0 ? 'w-9/12' : 'w-8/12';
  if (len > 24) return index % 2 === 0 ? 'w-7/12' : 'w-6/12';
  return index % 2 === 0 ? 'w-5/12' : 'w-4/12';
}
</script>

<template>
  <div
    v-if="row.showUnreadSeparatorBefore"
    class="message-list__unread-separator mx-1 mb-2 mt-1 flex items-center gap-3 px-2"
    :class="{
      'message-list__unread-separator--first': row.layout.isFirstInList,
    }"
    aria-hidden="true"
  >
    <span class="h-px flex-1 bg-rose-400/45" />
    <span
      class="shrink-0 rounded-full border border-rose-300/30 bg-rose-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-rose-200"
    >
      New
    </span>
    <span class="h-px flex-1 bg-rose-400/45" />
  </div>
  <div
    v-if="row.showDaySeparatorBefore"
    class="message-list__day-separator flex items-center gap-3 px-4"
    :class="{ 'message-list__day-separator--first': row.layout.isFirstInList }"
    :data-day="row.daySeparatorLabel"
    aria-hidden="true"
  >
    <span class="h-px flex-1 bg-glass-2" />
    <span
      class="shrink-0 text-[11px] font-semibold uppercase tracking-wide text-muted"
    >
      {{ row.daySeparatorLabel }}
    </span>
    <span class="h-px flex-1 bg-glass-2" />
  </div>

  <article
    v-if="shell.isSystemMessage"
    class="message-bubble pointer-events-none px-1"
    aria-hidden="true"
  >
    <p class="py-1.5 text-center text-xs leading-snug text-muted">
      {{ shell.systemText }}
    </p>
  </article>

  <article
    v-else
    class="message-bubble pointer-events-none px-1"
    :id="message.id ? `message-${message.id}` : undefined"
    :class="[
      shell.grouped ? 'msg-continuation' : 'msg-header',
      {
        'msg-header--first': !shell.grouped && row.layout.isFirstInList,
        'msg-header--clustered': !shell.grouped && shell.clustered,
        'msg-continuation--followed': shell.grouped && shell.clustered,
        'message-bubble--compact-top': row.isCompact,
      },
    ]"
    aria-hidden="true"
  >
    <div class="flex items-start gap-4">
      <div
        v-if="!shell.grouped"
        class="message-list-skeleton-pulse relative mt-1 h-10 w-10 shrink-0 overflow-hidden rounded-full"
      />
      <div v-else class="w-10 shrink-0" />

      <div class="min-w-0 flex-1">
        <div
          v-if="!shell.grouped"
          class="msg-header-row flex flex-wrap items-baseline gap-2"
        >
          <span
            class="message-list-skeleton-pulse h-[0.95rem] w-28 rounded"
            :aria-label="shell.authorName"
          />
          <span
            class="message-list-skeleton-pulse h-[0.6rem] w-10 shrink-0 rounded"
            :aria-label="shortTime"
          />
        </div>

        <div
          v-if="shell.showReplyBlock"
          class="mb-1 h-5 rounded bg-glass-2"
          aria-hidden="true"
        />
        <div
          v-if="shell.showForwardedBlock"
          class="mb-2 rounded-md border border-border bg-scrim-1 px-2.5 py-2"
          aria-hidden="true"
        >
          <div
            class="text-[10px] font-semibold uppercase tracking-wide text-muted"
          >
            Forwarded
          </div>
          <div class="mt-1 h-4 w-32 rounded bg-glass-2" />
        </div>

        <p
          v-for="(line, lineIndex) in shell.bodyLines"
          :key="lineIndex"
          class="skeleton-line flex items-center"
        >
          <span
            class="message-list-skeleton-pulse h-[0.85rem] rounded"
            :class="lineWidthClass(line, lineIndex)"
          />
        </p>
        <p
          v-if="shell.bodyLines.length === 0"
          class="skeleton-line flex items-center"
        >
          <span
            class="message-list-skeleton-pulse h-[0.85rem] w-4/12 rounded"
          />
        </p>

        <div
          v-for="(block, blockIndex) in shell.imageBlocks"
          :key="`img-${blockIndex}`"
          class="message-list-skeleton-pulse my-2 block w-full min-w-0 rounded-lg"
          :style="{
            aspectRatio: `${block.aspectW} / ${block.aspectH}`,
            maxWidth: block.maxWidthCss ?? 'min(100%, 40rem)',
          }"
          aria-hidden="true"
        />

        <div
          v-if="shell.showPollBlock"
          class="mt-2 rounded-lg bg-glass-2"
          :style="{ height: `${shell.pollBlockHeightPx}px` }"
          aria-hidden="true"
        />

        <div
          v-if="shell.showReactions"
          class="mt-1 flex flex-wrap gap-1"
          aria-hidden="true"
        >
          <span
            v-for="n in Math.min(shell.reactionCount, 4)"
            :key="n"
            class="inline-block h-6 w-12 rounded-full bg-glass-2"
          />
        </div>
      </div>
    </div>
  </article>
</template>

<style scoped lang="scss">
.skeleton-line {
  height: 1.375rem;
}

.message-list-skeleton-pulse {
  background: color-mix(in srgb, var(--text) 10%, transparent);
  animation: message-list-skeleton-pulse 1.4s ease-in-out infinite;
}

@keyframes message-list-skeleton-pulse {
  0%,
  100% {
    opacity: 0.38;
  }
  50% {
    opacity: 0.68;
  }
}

@media (prefers-reduced-motion: reduce) {
  .message-list-skeleton-pulse {
    animation: none;
    opacity: 0.55;
  }
}
</style>
