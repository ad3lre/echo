<script setup lang="ts">
import { computed } from 'vue';
import type { MessageListRowPresentation } from '@/features/chat/presentation/messageListRowPresentation';
import { buildMessageRowShellLayout } from '@/features/chat/domain/messageRowShellLayout';
import { formatShortTime } from '@/utils/formatTimestamp';
import { safeImageUrl } from '@/utils/safeImageUrl';

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
        class="relative mt-1 h-10 w-10 shrink-0 overflow-hidden rounded-full bg-glass-2"
      >
        <img
          v-if="message.author?.avatar"
          :src="safeImageUrl(message.author.avatar)"
          :alt="shell.authorName"
          class="h-full w-full rounded-full object-cover"
          loading="lazy"
          decoding="async"
        />
      </div>
      <div v-else class="w-10 shrink-0" />

      <div class="min-w-0 flex-1">
        <div
          v-if="!shell.grouped"
          class="msg-header-row flex flex-wrap items-baseline gap-2"
        >
          <span class="font-semibold text-foreground">{{
            shell.authorName
          }}</span>
          <span
            class="text-[10px] tabular-nums leading-tight text-muted whitespace-nowrap shrink-0"
          >
            {{ shortTime }}
          </span>
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
          class="message-text truncate text-[0.9375rem] leading-[1.375rem] text-foreground/90"
        >
          {{ line }}
        </p>
        <p
          v-if="shell.bodyLines.length === 0"
          class="message-text text-[0.9375rem] leading-[1.375rem] text-muted/70"
        >
          &nbsp;
        </p>

        <div
          v-for="(block, blockIndex) in shell.imageBlocks"
          :key="`img-${blockIndex}`"
          class="my-2 block w-full max-w-[min(100%,40rem)] min-w-0 rounded-lg bg-glass-2"
          :style="{ aspectRatio: `${block.aspectW} / ${block.aspectH}` }"
          aria-hidden="true"
        />

        <div
          v-if="shell.showPollBlock"
          class="mt-1 h-24 rounded-md bg-glass-2"
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
