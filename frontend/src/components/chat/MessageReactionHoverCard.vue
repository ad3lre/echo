<script setup lang="ts">
import { computed } from 'vue';
import type { MessageReaction } from '@shared/types';
import PausedGifAvatar from '@/components/PausedGifAvatar.vue';
import { safeImageUrl } from '@/utils/safeImageUrl';

const MAX_REACTORS_SHOWN = 8;

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

const anchoredStyle = computed(() => {
  const r = props.triggerRect;
  if (!r) return { left: '0px', top: '0px' };
  const left = Math.max(8, Math.round(r.left + r.width / 2));
  const top = Math.max(8, Math.round(r.top - 8));
  return { left: `${left}px`, top: `${top}px` };
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
      class="fixed z-[110] w-[260px] max-w-[calc(100vw-16px)] -translate-x-1/2 -translate-y-full rounded-xl border border-border bg-[color-mix(in_srgb,var(--echo-popover-bg)_95%,transparent)] p-2 shadow-[0_10px_30px_rgba(0,0,0,0.45)] backdrop-blur-sm"
      :style="anchoredStyle"
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
