<script setup lang="ts">
/**
 * Dev-only surface gallery: exercise Light / Dark / AMOLED tokens side-by-side.
 * Opened from App.vue when `import.meta.env.DEV` (see App.vue).
 */
import { ref } from 'vue';
import { storeToRefs } from 'pinia';
import { useThemeStore } from '@/features/settings/themeStore';
import type { EchoThemeId } from '@/features/settings/theme';

const isDev = import.meta.env.DEV;
const open = ref(false);
const themeStore = useThemeStore();
const { theme: currentTheme } = storeToRefs(themeStore);

const presets: { id: EchoThemeId; label: string }[] = [
  { id: 'Sunny', label: 'Sunny' },
  { id: 'Light', label: 'Light' },
  { id: 'Dark', label: 'Dark' },
  { id: 'Amoled', label: 'AMOLED' },
];

function apply(id: EchoThemeId) {
  themeStore.setTheme(id);
}
</script>

<template>
  <div
    v-if="isDev"
    class="pointer-events-none fixed bottom-3 left-3 z-[10000] flex flex-col items-start gap-2"
  >
    <button
      type="button"
      class="pointer-events-auto rounded-full border border-border bg-elevated px-3 py-1.5 text-xs font-semibold text-foreground shadow-2"
      @click="open = !open"
    >
      Theme Lab
    </button>
    <div
      v-if="open"
      class="pointer-events-auto custom-scrollbar max-h-[min(85vh,720px)] w-[min(96vw,420px)] overflow-y-auto rounded-2xl border border-border bg-surface p-4 text-foreground shadow-3"
    >
      <div class="mb-3 flex flex-wrap items-center gap-2">
        <span class="text-xs font-semibold text-muted">Preview as</span>
        <button
          v-for="p in presets"
          :key="p.id"
          type="button"
          class="rounded-md px-2.5 py-1 text-xs font-semibold transition-colors"
          :class="
            currentTheme === p.id
              ? 'bg-accent text-[var(--accent-contrast-fg)]'
              : 'bg-glass-2 text-fg-soft hover:bg-glass-hover'
          "
          @click="apply(p.id)"
        >
          {{ p.label }}
        </button>
      </div>

      <div class="space-y-4 text-sm">
        <section class="rounded-xl border border-border bg-bg p-3">
          <p
            class="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted"
          >
            Core tokens
          </p>
          <div class="flex flex-wrap gap-2">
            <span class="rounded-md bg-bg px-2 py-1 text-xs ring-1 ring-border">
              --bg
            </span>
            <span
              class="rounded-md bg-surface px-2 py-1 text-xs ring-1 ring-border"
            >
              --surface
            </span>
            <span
              class="rounded-md bg-elevated px-2 py-1 text-xs ring-1 ring-border"
            >
              --elevated
            </span>
          </div>
        </section>

        <section
          class="chat-header-glass rounded-xl border border-border px-3 py-2 text-xs font-medium"
        >
          .chat-header-glass strip (channel header recipe)
        </section>

        <section class="rounded-xl border border-border p-3">
          <p
            class="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted"
          >
            Semantic chrome (Tailwind)
          </p>
          <div class="flex flex-wrap gap-2">
            <span class="rounded-md bg-glass-1 px-2 py-1 text-xs text-fg-soft">
              glass-1 / fg-soft
            </span>
            <span class="rounded-md bg-glass-2 px-2 py-1 text-xs text-fg">
              glass-2 / fg
            </span>
            <span
              class="rounded-md bg-glass-3 px-2 py-1 text-xs text-fg-strong"
            >
              glass-3 / fg-strong
            </span>
          </div>
          <p class="mt-2 text-xs text-fg-subtle">
            Muted caption uses fg-subtle — replaces raw white opacity ramps.
          </p>
        </section>

        <section class="rounded-xl border border-border p-3">
          <p
            class="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted"
          >
            Mention pills (CSS vars)
          </p>
          <span
            class="inline-flex rounded px-2 py-0.5 text-xs font-medium"
            style="
              color: var(--mention-user-fg);
              background: var(--mention-user-bg);
            "
            >@user</span
          >
          <span
            class="ml-2 inline-flex rounded px-2 py-0.5 text-xs font-medium"
            style="
              color: var(--mention-channel-fg);
              background: var(--mention-channel-bg);
            "
            >#channel</span
          >
        </section>

        <section class="rounded-xl border border-border bg-overlay-subtle p-4">
          <p class="text-xs font-medium text-fg">
            Overlay subtle scrim (cards / wells)
          </p>
        </section>

        <section
          class="rounded-xl border border-border p-4"
          style="
            background: linear-gradient(
              135deg,
              var(--echo-rail-corner-blue-0),
              var(--echo-rail-corner-violet-55)
            );
          "
        >
          <p class="text-xs font-semibold text-fg shadow-sm">
            Rail corner gradient stops (brand wash)
          </p>
        </section>
      </div>
    </div>
  </div>
</template>
