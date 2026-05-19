<script setup lang="ts">
import type {
  ServerSettingsSection,
  SectionGroup,
} from '@/features/server-settings/types';
import { icons } from '@/assets/icons';

withDefaults(
  defineProps<{
    serverName: string;
    visibleSectionGroups: SectionGroup[];
    activeSection: ServerSettingsSection;
    getSectionIcon: (section: ServerSettingsSection) => string;
    /** Icon-only rail (narrow / auto-collapsed). */
    collapsed?: boolean;
  }>(),
  { collapsed: false },
);

const emit = defineEmits<{
  'update:activeSection': [value: ServerSettingsSection];
  'request-expand-labels': [];
}>();
</script>

<template>
  <aside
    class="server-settings-sidebar custom-scrollbar flex min-h-0 flex-col overflow-y-auto transition-[width,padding] duration-200 ease-out"
    :class="
      collapsed
        ? 'server-settings-sidebar--collapsed w-[48px] max-w-[48px] px-1 py-3'
        : 'w-full min-w-0 max-w-[320px] p-5'
    "
  >
    <template v-if="collapsed">
      <div class="mb-2 flex justify-center">
        <button
          type="button"
          class="chat-focus-ring flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--border)] bg-glass-1 text-fg-soft transition-colors hover:bg-glass-hover hover:text-fg"
          :title="'Show section names'"
          aria-label="Show section names"
          @click="emit('request-expand-labels')"
        >
          <img
            :src="icons.list"
            alt=""
            class="server-settings-nav-icon h-4 w-4"
          />
        </button>
      </div>
      <div
        class="mb-3 flex flex-col items-center gap-1 border-b border-[var(--border)] pb-3"
      >
        <div
          class="flex h-8 w-8 items-center justify-center rounded-full border border-[var(--border)] bg-glass-1 text-[10px] font-bold text-fg"
          :title="serverName"
          :aria-label="serverName"
        >
          {{ serverName.trim().charAt(0).toUpperCase() || '?' }}
        </div>
      </div>

      <div
        v-if="!visibleSectionGroups.length"
        class="px-0.5 text-center text-[10px] leading-tight text-muted"
      >
        No access
      </div>
      <div
        v-for="group in visibleSectionGroups"
        :key="group.label"
        class="mb-3 flex flex-col items-stretch gap-1"
      >
        <div class="sr-only">{{ group.label }}</div>
        <button
          v-for="item in group.items"
          :key="item"
          type="button"
          class="server-settings-nav-item flex h-9 w-full items-center justify-center rounded-lg transition-colors"
          :class="
            activeSection === item
              ? 'server-settings-nav-item--active'
              : 'text-fg-soft hover:bg-glass-hover hover:text-fg'
          "
          :title="item"
          :aria-label="item"
          :aria-current="activeSection === item ? 'page' : undefined"
          @click="emit('update:activeSection', item)"
        >
          <img
            :src="getSectionIcon(item)"
            alt=""
            class="server-settings-nav-icon h-[18px] w-[18px] shrink-0"
          />
        </button>
      </div>
    </template>

    <template v-else>
      <div class="mb-5 px-3">
        <div
          class="text-[11px] font-semibold uppercase tracking-[0.18em] text-fg-soft"
        >
          Server Settings
        </div>
        <h2 id="server-settings-title" class="mt-2 truncate text-2xl font-bold">
          {{ serverName }}
        </h2>
        <p class="mt-1 line-clamp-2 text-sm text-muted">
          Configure the server, roles, invites, and moderation.
        </p>
      </div>

      <div
        v-if="!visibleSectionGroups.length"
        class="mb-5 px-3 text-sm text-muted"
      >
        You don’t have permission to change this server’s settings.
      </div>
      <div
        v-for="group in visibleSectionGroups"
        :key="group.label"
        class="mb-5"
      >
        <div
          class="server-settings-nav-section-label truncate px-3 pb-2 text-[11px] font-semibold uppercase tracking-[0.18em]"
        >
          {{ group.label }}
        </div>
        <div class="flex flex-col gap-1">
          <button
            v-for="item in group.items"
            :key="item"
            type="button"
            class="server-settings-nav-item min-w-0 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition-colors"
            :class="
              activeSection === item
                ? 'server-settings-nav-item--active'
                : 'text-fg-soft hover:bg-glass-hover hover:text-fg'
            "
            @click="emit('update:activeSection', item)"
          >
            <div class="flex min-w-0 items-center gap-2">
              <img
                :src="getSectionIcon(item)"
                alt=""
                class="server-settings-nav-icon h-4 w-4 shrink-0"
              />
              <span class="min-w-0 flex-1 truncate">{{ item }}</span>
            </div>
          </button>
        </div>
      </div>
    </template>
  </aside>
</template>
