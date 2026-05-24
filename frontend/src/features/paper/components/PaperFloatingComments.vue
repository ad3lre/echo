<script setup lang="ts">
import { computed } from 'vue';
import type { PaperCommentPayload } from '@shared/types/paper';
import type { PaperGutterRow } from '@/features/paper/composables/usePaperAuthorGutter';
import type { PaperPageLayout } from '@/features/paper/composables/usePaperPageLayout';
import type { PaperCommentLayoutMode } from '@/features/paper/composables/usePaperCommentLayout';
import {
  PAPER_CARD_WIDTH,
  PAPER_COMMENT_GAP,
  stackCommentTops,
} from '@/features/paper/composables/usePaperCommentLayout';
import { paperAuthorColor } from '@/features/paper/composables/usePaperAuthorGutter';

const props = defineProps<{
  comments: PaperCommentPayload[];
  repliesFor: (parentId: string) => PaperCommentPayload[];
  resolveUserName: (userId: string) => string;
  resolveUserAvatar: (userId: string) => string | undefined;
  canComment: boolean;
  canManage: boolean;
  currentUserId: string;
  gutterRows: PaperGutterRow[];
  pageLayout: PaperPageLayout;
  layoutMode: PaperCommentLayoutMode;
  stackedBaseTop: number;
  showResolved: boolean;
  composerOpen: boolean;
  commentDraft: string;
  pendingQuote: string;
  replyParentId: string | null;
  composerTop: number | null;
}>();

const emit = defineEmits<{
  'update:composerOpen': [value: boolean];
  'update:commentDraft': [value: string];
  submit: [];
  resolve: [commentId: string, resolved: boolean];
  delete: [commentId: string];
  reply: [parentId: string];
  scrollToBlock: [anchorBlockId: string];
}>();

const blockTopById = computed(() => {
  const m = new Map<string, number>();
  for (const r of props.gutterRows) {
    m.set(r.paperBlockId, r.top);
  }
  return m;
});

const filteredThreads = computed(() =>
  props.comments.filter((c) => {
    if (c.parentCommentId) return false;
    if (!c.resolvedAt) return true;
    return props.showResolved && props.canManage;
  }),
);

const positioned = computed(() => {
  const isStacked = props.layoutMode === 'stacked';
  const commentLeft = isStacked
    ? props.pageLayout.left
    : props.pageLayout.left + props.pageLayout.width + PAPER_COMMENT_GAP;

  const raw = filteredThreads.value.map((c) => {
    const anchorTop = blockTopById.value.get(c.anchorBlockId);
    const baseTop = isStacked
      ? props.stackedBaseTop
      : (anchorTop ?? props.stackedBaseTop);
    return {
      comment: c,
      rawTop: anchorTop ?? null,
      baseTop,
      left: commentLeft,
      orphaned: anchorTop == null && !isStacked,
    };
  });

  const stackInput = raw
    .filter((r) => r.rawTop != null || isStacked)
    .map((r, i) => ({
      id: r.comment.id,
      top: isStacked ? props.stackedBaseTop + i * 116 : (r.rawTop as number),
    }));

  const stackedTops = stackCommentTops(stackInput);

  return raw.map((r) => {
    const top = stackedTops.get(r.comment.id) ?? r.baseTop;
    return {
      comment: r.comment,
      top,
      left: r.left,
      orphaned: r.orphaned,
    };
  });
});

const pins = computed(() => {
  const openByBlock = new Map<string, number>();
  for (const c of props.comments) {
    if (c.resolvedAt) continue;
    const id = c.anchorBlockId.trim();
    if (!id) continue;
    openByBlock.set(id, (openByBlock.get(id) ?? 0) + 1);
  }
  const pageRight = props.pageLayout.left + props.pageLayout.width;
  return [...openByBlock.entries()]
    .map(([paperBlockId, count]) => {
      const top = blockTopById.value.get(paperBlockId);
      return {
        paperBlockId,
        count,
        top: top ?? null,
        left: pageRight - 6,
      };
    })
    .filter((p) => p.top != null);
});

const composerStyle = computed(() => {
  const isStacked = props.layoutMode === 'stacked';
  const left = isStacked
    ? props.pageLayout.left
    : props.pageLayout.left + props.pageLayout.width + PAPER_COMMENT_GAP;
  const top =
    props.composerTop ??
    (positioned.value.at(-1)?.top != null
      ? positioned.value.at(-1)!.top + 120
      : isStacked
        ? props.stackedBaseTop
        : 80);
  return {
    left: `${left}px`,
    top: `${top}px`,
    width: `${PAPER_CARD_WIDTH}px`,
  };
});

const composerPlaceholder = computed(() => {
  if (props.replyParentId) return 'Write a reply…';
  if (props.pendingQuote) return 'Comment on selection…';
  return 'Add a comment…';
});

function pinLabel(count: number) {
  return count > 9 ? '9+' : String(count);
}

function onDraftInput(ev: Event) {
  emit('update:commentDraft', (ev.target as HTMLTextAreaElement).value);
}
</script>

<template>
  <div
    class="paper-floating-comments pointer-events-none absolute inset-0 z-20 overflow-visible"
    aria-label="Document comments"
  >
    <button
      v-for="pin in pins"
      :key="pin.paperBlockId"
      type="button"
      class="paper-comment-pin paper-icon-btn pointer-events-auto"
      :style="{
        top: `${pin.top}px`,
        left: `${pin.left}px`,
      }"
      :title="`${pin.count} comment${pin.count === 1 ? '' : 's'}`"
      :aria-label="`${pin.count} comments on block`"
      @click="emit('scrollToBlock', pin.paperBlockId)"
    >
      {{ pinLabel(pin.count) }}
    </button>

    <TransitionGroup name="paper-comment-card">
      <article
        v-for="{ comment: c, top, left, orphaned } in positioned"
        :key="c.id"
        class="paper-comment-card pointer-events-auto"
        :class="{ 'paper-comment-card--orphaned': orphaned }"
        :style="{
          top: `${top}px`,
          left: `${left}px`,
          width: `${PAPER_CARD_WIDTH}px`,
        }"
        @click="emit('scrollToBlock', c.anchorBlockId)"
      >
        <header class="mb-2 flex items-start gap-2">
          <div
            v-if="resolveUserAvatar(c.authorId)"
            class="h-7 w-7 shrink-0 overflow-hidden rounded-full"
          >
            <img
              :src="resolveUserAvatar(c.authorId)"
              alt=""
              class="h-full w-full object-cover"
            />
          </div>
          <div
            v-else
            class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
            :style="{ backgroundColor: paperAuthorColor(c.authorId) }"
          >
            {{ (resolveUserName(c.authorId) || '?').slice(0, 1).toUpperCase() }}
          </div>
          <div class="min-w-0 flex-1">
            <div class="flex items-center justify-between gap-1">
              <span class="truncate text-xs font-semibold text-fg">{{
                resolveUserName(c.authorId)
              }}</span>
              <div class="flex shrink-0 gap-1" @click.stop>
                <button
                  v-if="canComment"
                  type="button"
                  class="paper-icon-btn px-1 text-[10px] text-fg-subtle hover:text-fg"
                  @click="emit('reply', c.id)"
                >
                  Reply
                </button>
                <button
                  v-if="canManage || c.authorId === currentUserId"
                  type="button"
                  class="paper-icon-btn px-1 text-[10px] text-fg-subtle hover:text-fg"
                  @click="emit('resolve', c.id, !c.resolvedAt)"
                >
                  {{ c.resolvedAt ? 'Reopen' : 'Resolve' }}
                </button>
              </div>
            </div>
            <p v-if="orphaned" class="text-[10px] text-amber-500">
              Location lost
            </p>
          </div>
        </header>
        <p
          v-if="c.anchorQuote"
          class="mb-2 border-l-2 border-accent/40 pl-2 text-[11px] italic text-fg-subtle line-clamp-2"
        >
          “{{ c.anchorQuote }}”
        </p>
        <p class="text-sm leading-snug text-fg-soft whitespace-pre-wrap">
          {{ c.body }}
        </p>
        <div
          v-if="repliesFor(c.id).length"
          class="mt-2 space-y-2 border-t border-border pt-2"
        >
          <div
            v-for="r in repliesFor(c.id)"
            :key="r.id"
            class="rounded-lg bg-glass-1 p-2 text-xs"
          >
            <span class="font-medium text-fg">{{
              resolveUserName(r.authorId)
            }}</span>
            <p class="mt-0.5 whitespace-pre-wrap text-fg-soft">{{ r.body }}</p>
          </div>
        </div>
      </article>
    </TransitionGroup>

    <Transition name="paper-comment-composer">
      <div
        v-if="canComment && composerOpen"
        class="paper-comment-composer pointer-events-auto rounded-xl border border-border p-3 shadow-lg"
        :style="[
          composerStyle,
          {
            background: 'var(--paper-comment-card-bg)',
            boxShadow: 'var(--paper-comment-card-shadow)',
          },
        ]"
        @click.stop
      >
        <p
          v-if="pendingQuote"
          class="mb-2 border-l-2 border-accent/50 pl-2 text-[11px] italic text-fg-subtle line-clamp-3"
        >
          “{{ pendingQuote.slice(0, 160) }}”
        </p>
        <textarea
          :value="commentDraft"
          rows="3"
          class="w-full resize-none rounded-lg border border-border bg-bg px-2.5 py-2 text-sm text-fg outline-none focus:border-accent focus-visible:ring-2 focus-visible:ring-accent"
          :placeholder="composerPlaceholder"
          @input="onDraftInput"
        />
        <div class="mt-2 flex justify-end gap-2">
          <button
            type="button"
            class="paper-icon-btn rounded-lg px-2.5 py-1 text-xs text-fg-subtle hover:bg-glass-hover"
            @click="emit('update:composerOpen', false)"
          >
            Cancel
          </button>
          <button
            type="button"
            class="rounded-lg bg-accent px-3 py-1 text-xs font-medium text-white hover:opacity-90 disabled:opacity-40"
            :disabled="!commentDraft.trim()"
            @click="emit('submit')"
          >
            Post
          </button>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.paper-comment-pin {
  position: absolute;
  z-index: 21;
  display: flex;
  height: 1.25rem;
  min-width: 1.25rem;
  align-items: center;
  justify-content: center;
  border-radius: 9999px;
  background: var(--accent);
  padding: 0 0.25rem;
  font-size: 10px;
  font-weight: 700;
  color: var(--accent-contrast-fg);
  box-shadow: var(--paper-pin-shadow);
  transform: translate(-50%, -50%);
}

.paper-comment-card {
  position: absolute;
  z-index: 22;
  border-radius: 12px;
  border: 1px solid var(--border);
  background: var(--paper-comment-card-bg);
  box-shadow: var(--paper-comment-card-shadow);
  padding: 0.75rem;
  cursor: pointer;
  transition:
    border-color 0.15s ease,
    box-shadow 0.15s ease;
}

.paper-comment-card:hover {
  border-color: color-mix(in srgb, var(--accent) 35%, var(--border));
}

.paper-comment-card--orphaned {
  opacity: 0.85;
}

.paper-comment-composer {
  position: absolute;
  z-index: 30;
}
</style>
