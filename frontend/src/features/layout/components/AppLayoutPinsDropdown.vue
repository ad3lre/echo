<script setup lang="ts">
import PausedGifAvatar from '@/components/PausedGifAvatar.vue';
import { safeImageUrl } from '@/utils/safeImageUrl';
import { useCompactShell } from '@/composables/useCompactShell';
import { computed } from 'vue';

const props = defineProps<{
  isOpen: boolean;
  rect: { left: number; bottom: number } | null;
  pinnedMessages: Array<{
    id?: string;
    author?: { avatar?: string; name?: string };
  }>;
  pinPreview: (msg: unknown) => string;
  closePinsDropdown: () => void;
  goToPinnedMessage: (messageId: string) => void;
}>();

const { isCompactShell } = useCompactShell();

const useSheetLayout = computed(() => props.isOpen && isCompactShell.value);

const useAnchoredDropdown = computed(
  () => props.isOpen && props.rect != null && !isCompactShell.value,
);

const anchoredDropdownStyle = computed(() => {
  const r = props.rect;
  if (!r) return {};
  return {
    left: `${r.left}px`,
    top: `${r.bottom + 6}px`,
  };
});
</script>

<template>
  <Teleport to="body">
    <!-- Mobile / compact: full-height scrollable sheet -->
    <template v-if="useSheetLayout">
      <div
        class="fixed inset-0 z-[94] bg-black/50"
        aria-hidden="true"
        @click="closePinsDropdown"
      />
      <div
        class="fixed inset-0 z-[95] flex flex-col bg-[var(--echo-server-rail-bg)] text-foreground"
        role="dialog"
        aria-modal="true"
        aria-label="Pinned messages"
      >
        <header
          class="flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-3"
          style="padding-top: calc(env(safe-area-inset-top, 0px) + 0.75rem)"
        >
          <h3 class="text-base font-semibold text-fg">Pinned messages</h3>
          <button
            type="button"
            class="rounded-lg px-3 py-2 text-sm font-semibold text-fg-soft transition-colors hover:bg-glass-hover hover:text-white"
            @click="closePinsDropdown"
          >
            Close
          </button>
        </header>
        <div class="custom-scrollbar min-h-0 flex-1 overflow-y-auto">
          <p
            v-if="!pinnedMessages.length"
            class="px-4 py-10 text-center text-sm text-muted"
          >
            No pinned messages in this channel.
          </p>
          <template v-else>
            <button
              v-for="msg in pinnedMessages"
              :key="msg.id"
              type="button"
              class="pins-dropdown-item flex w-full items-start gap-3 border-b border-border/60 px-4 py-3 text-left transition-colors hover:bg-glass-hover"
              @click="goToPinnedMessage(msg.id || '')"
            >
              <div
                class="relative h-9 w-9 shrink-0 overflow-hidden rounded-full ring-1 ring-border"
              >
                <PausedGifAvatar
                  :src="safeImageUrl(msg.author?.avatar)"
                  :alt="msg.author?.name ?? ''"
                  :session-key="msg.id ?? msg.author?.avatar ?? ''"
                  img-class="rounded-full object-cover"
                />
              </div>
              <div class="min-w-0 flex-1">
                <p class="truncate text-xs font-medium text-muted">
                  {{ msg.author?.name }}
                </p>
                <p
                  class="mt-0.5 text-sm leading-snug text-fg line-clamp-4 break-words"
                >
                  {{ pinPreview(msg) }}
                </p>
              </div>
            </button>
          </template>
        </div>
        <div
          class="shrink-0"
          :style="{ height: 'max(0px, env(safe-area-inset-bottom, 0px))' }"
        />
      </div>
    </template>

    <!-- Desktop: anchored popover -->
    <template v-else-if="useAnchoredDropdown">
      <div
        class="fixed inset-0 z-[90]"
        aria-hidden="true"
        @click="closePinsDropdown"
      />
      <div
        class="pins-dropdown fixed z-[91] flex max-h-[min(70vh,400px)] min-w-[320px] max-w-[min(420px,calc(100vw-24px))] flex-col overflow-hidden rounded-xl"
        :style="anchoredDropdownStyle"
        role="dialog"
        aria-label="Pinned messages"
        @click.stop
      >
        <div class="flex shrink-0 items-center justify-between gap-2 px-4 py-3">
          <h3 class="text-sm font-semibold text-fg">Pinned messages</h3>
        </div>
        <div class="custom-scrollbar min-h-0 flex-1 overflow-y-auto">
          <p
            v-if="!pinnedMessages.length"
            class="px-4 py-6 text-center text-sm text-muted"
          >
            No pinned messages in this channel.
          </p>
          <template v-else>
            <button
              v-for="msg in pinnedMessages"
              :key="msg.id"
              type="button"
              class="pins-dropdown-item flex w-full items-start gap-3 px-4 py-2.5 text-left transition-colors hover:bg-glass-hover"
              @click="goToPinnedMessage(msg.id || '')"
            >
              <div
                class="relative h-8 w-8 shrink-0 overflow-hidden rounded-full ring-1 ring-border"
              >
                <PausedGifAvatar
                  :src="safeImageUrl(msg.author?.avatar)"
                  :alt="msg.author?.name ?? ''"
                  :session-key="msg.id ?? msg.author?.avatar ?? ''"
                  img-class="rounded-full object-cover"
                />
              </div>
              <div class="min-w-0 flex-1">
                <p class="truncate text-xs font-medium text-muted">
                  {{ msg.author?.name }}
                </p>
                <p class="text-sm text-fg line-clamp-2 break-words">
                  {{ pinPreview(msg) }}
                </p>
              </div>
            </button>
          </template>
        </div>
      </div>
    </template>
  </Teleport>
</template>
