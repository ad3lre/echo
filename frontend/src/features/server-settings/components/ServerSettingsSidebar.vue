<script setup lang="ts">
import type {
  ServerSettingsSection,
  SectionGroup,
} from '@/features/server-settings/types';

defineProps<{
  serverName: string;
  visibleSectionGroups: SectionGroup[];
  activeSection: ServerSettingsSection;
  getSectionIcon: (section: ServerSettingsSection) => string;
}>();

const emit = defineEmits<{
  'update:activeSection': [value: ServerSettingsSection];
}>();
</script>

<template>
  <aside
    class="server-settings-sidebar custom-scrollbar w-full max-w-[320px] shrink-0 overflow-y-auto p-5"
  >
    <div class="mb-5 px-3">
      <div
        class="text-[11px] font-semibold uppercase tracking-[0.18em] text-fg-soft"
      >
        Server Settings
      </div>
      <h2 id="server-settings-title" class="mt-2 text-2xl font-bold">
        {{ serverName }}
      </h2>
      <p class="mt-1 text-sm text-muted">
        Configure the server, roles, invites, and moderation.
      </p>
    </div>

    <div
      v-if="!visibleSectionGroups.length"
      class="mb-5 px-3 text-sm text-muted"
    >
      You don’t have permission to change this server’s settings.
    </div>
    <div v-for="group in visibleSectionGroups" :key="group.label" class="mb-5">
      <div
        class="px-3 pb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-fg-subtle"
      >
        {{ group.label }}
      </div>
      <div class="flex flex-col gap-1">
        <button
          v-for="item in group.items"
          :key="item"
          type="button"
          class="server-settings-nav-item rounded-xl px-3 py-2.5 text-left text-sm font-medium transition-colors"
          :class="
            activeSection === item
              ? 'server-settings-nav-item--active'
              : 'text-fg-soft hover:bg-glass-hover hover:text-fg'
          "
          @click="emit('update:activeSection', item)"
        >
          <div class="flex items-center gap-2">
            <img
              :src="getSectionIcon(item)"
              alt=""
              class="server-settings-nav-icon h-4 w-4"
            />
            <span class="truncate">{{ item }}</span>
          </div>
        </button>
      </div>
    </div>
  </aside>
</template>
