<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref, watch } from 'vue';
import type { MessageReaction } from '@shared/types';
import PausedGifAvatar from '@/components/PausedGifAvatar.vue';
import { safeImageUrl } from '@/features/layout/display/safeImageUrl';

const MAX_REACTORS_SHOWN = 8;
const CARD_WIDTH = 260;
const PAD = 8;
const GAP = 8;
/** Extra score for “below” so we prefer it when margins are similar — keeps the message body above the reactions readable. */
const PREFER_BELOW_BIAS = 40;

const props = defineProps<{
  open: boolean;
  reaction: MessageReaction | null;
  triggerRect: DOMRect | null;
  parseSingleEmojiForReactions: (emoji: string) => string;
  resolveReactorDisplay?: (userId: string) => string;
  resolveReactorAvatar?: (userId: string) => string | undefined;
  currentUserId?: string;
  currentUserDisplayName?: string;
}>();

const emit = defineEmits<{
  cardMouseenter: [];
  cardMouseleave: [];
}>();

const cardRef = ref<HTMLElement | null>(null);
const cardStyle = ref<Record<string, string>>({
  left: `${PAD}px`,
  top: `${PAD}px`,
});

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

function intersectArea(
  a: { left: number; top: number; w: number; h: number },
  b: DOMRect,
): number {
  const x1 = Math.max(a.left, b.left);
  const y1 = Math.max(a.top, b.top);
  const x2 = Math.min(a.left + a.w, b.right);
  const y2 = Math.min(a.top + a.h, b.bottom);
  return Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
}

function estimatedCardHeight(reaction: MessageReaction): number {
  const n = Math.min(reaction.userIds?.length ?? 0, MAX_REACTORS_SHOWN);
  const overflow =
    (reaction.userIds?.length ?? 0) > MAX_REACTORS_SHOWN ? 22 : 0;
  return 52 + n * 34 + overflow + 12;
}

function cardWidthPx(vw: number): number {
  return Math.min(CARD_WIDTH, vw - PAD * 2);
}

function updateLayout() {
  const r = props.triggerRect;
  const reaction = props.reaction;
  if (!props.open || !r || !reaction || typeof window === 'undefined') return;

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const el = cardRef.value;
  const measuredH = el?.getBoundingClientRect().height ?? 0;
  const measuredW = el?.getBoundingClientRect().width ?? 0;
  const cw = measuredW > 8 ? measuredW : cardWidthPx(vw);
  const ch = measuredH > 8 ? measuredH : estimatedCardHeight(reaction);

  const cx = r.left + r.width / 2;
  const midY = r.top + r.height / 2;

  type Kind = 'above' | 'below' | 'left' | 'right';
  const candidates: Array<{ kind: Kind; left: number; top: number }> = [
    { kind: 'below', left: cx - cw / 2, top: r.bottom + GAP },
    { kind: 'above', left: cx - cw / 2, top: r.top - GAP - ch },
    { kind: 'right', left: r.right + GAP, top: midY - ch / 2 },
    { kind: 'left', left: r.left - GAP - cw, top: midY - ch / 2 },
  ];

  let best: { left: number; top: number; score: number } | null = null;

  for (const c of candidates) {
    const left = clamp(c.left, PAD, vw - PAD - cw);
    const top = clamp(c.top, PAD, vh - PAD - ch);
    const rect = { left, top, w: cw, h: ch };
    const minMargin = Math.min(
      left - PAD,
      top - PAD,
      vw - PAD - (left + cw),
      vh - PAD - (top + ch),
    );
    const overlap = intersectArea(rect, r);
    const bonus = c.kind === 'below' ? PREFER_BELOW_BIAS : 0;
    const score = minMargin - overlap * 4 + bonus;
    if (!best || score > best.score) {
      best = { left, top, score };
    }
  }

  if (!best) return;

  cardStyle.value = {
    left: `${Math.round(best.left)}px`,
    top: `${Math.round(best.top)}px`,
  };
}

let resizeObserver: ResizeObserver | null = null;

function detachLayoutObserver() {
  resizeObserver?.disconnect();
  resizeObserver = null;
}

watch(
  () =>
    props.open && props.triggerRect && props.reaction
      ? [
          props.triggerRect.left,
          props.triggerRect.top,
          props.triggerRect.width,
          props.triggerRect.height,
          props.reaction.count,
          props.reaction.userIds?.length ?? 0,
        ]
      : null,
  async (key) => {
    detachLayoutObserver();
    if (!key) return;
    await nextTick();
    requestAnimationFrame(() => {
      updateLayout();
      const el = cardRef.value;
      if (el) {
        resizeObserver = new ResizeObserver(() => updateLayout());
        resizeObserver.observe(el);
      }
    });
  },
);

onUnmounted(() => {
  detachLayoutObserver();
});

function labelForUser(userId: string): string {
  if (props.resolveReactorDisplay) return props.resolveReactorDisplay(userId);
  if (props.currentUserId && userId === props.currentUserId) {
    return props.currentUserDisplayName?.trim() || 'You';
  }
  return 'Unknown';
}

function avatarForUser(userId: string): string | null {
  const raw = props.resolveReactorAvatar?.(userId)?.trim();
  if (!raw) return null;
  return safeImageUrl(raw);
}

const visibleRows = computed(() => {
  const ids = props.reaction?.userIds ?? [];
  return ids.slice(0, MAX_REACTORS_SHOWN).map((id) => ({
    id,
    label: labelForUser(id),
    avatar: avatarForUser(id),
  }));
});

const overflowCount = computed(() => {
  const total = props.reaction?.userIds?.length ?? 0;
  return Math.max(0, total - MAX_REACTORS_SHOWN);
});
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open && reaction && triggerRect"
      ref="cardRef"
      class="fixed z-[110] w-[260px] max-w-[calc(100vw-16px)] rounded-xl border border-border bg-[color-mix(in_srgb,var(--echo-popover-bg)_95%,transparent)] p-2 shadow-[0_10px_30px_rgba(0,0,0,0.45)] backdrop-blur-sm"
      :style="cardStyle"
      role="dialog"
      aria-label="Reaction details"
      @mouseenter="emit('cardMouseenter')"
      @mouseleave="emit('cardMouseleave')"
    >
      <div class="mb-2 flex items-center gap-2 px-1">
        <span
          class="inline-flex h-6 w-6 items-center justify-center rounded-md bg-glass-1"
          v-html="parseSingleEmojiForReactions(reaction.emoji)"
        />
        <span class="text-xs text-fg-soft"
          >{{ reaction.count }} reaction{{
            reaction.count === 1 ? '' : 's'
          }}</span
        >
      </div>
      <ul class="space-y-1">
        <li
          v-for="row in visibleRows"
          :key="row.id"
          class="flex items-center gap-2 rounded-md px-1.5 py-1 text-xs text-fg-soft hover:bg-glass-1"
        >
          <div class="h-6 w-6 shrink-0 overflow-hidden rounded-full bg-glass-2">
            <PausedGifAvatar
              v-if="row.avatar"
              :src="row.avatar"
              :alt="row.label"
              :session-key="row.id"
              img-class="rounded-full object-cover"
            />
            <span
              v-else
              class="flex h-full w-full items-center justify-center text-[10px] font-semibold text-fg-soft"
            >
              {{ row.label.slice(0, 1).toUpperCase() }}
            </span>
          </div>
          <span class="min-w-0 flex-1 truncate">{{ row.label }}</span>
        </li>
      </ul>
      <div
        v-if="overflowCount > 0"
        class="mt-1 px-1.5 text-[11px] text-fg-soft"
      >
        +{{ overflowCount }} more
      </div>
    </div>
  </Teleport>
</template>
