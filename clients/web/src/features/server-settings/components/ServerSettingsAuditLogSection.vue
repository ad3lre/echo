<script setup lang="ts">
import { computed } from 'vue';
import EchoDropdown from '@/components/EchoDropdown.vue';
import { safeImageUrl } from '@/features/layout/display/safeImageUrl';

const props = defineProps<{
  auditTabFilter: string;
  auditActorFilter: string;
  auditTimeFilter: string;
  auditTabOptions: string[];
  auditActorSelectOptions: Array<{ label: string; value: string }>;
  auditTimeOptions: string[];
  filteredAuditEntries: Array<{
    id: string;
    tab: string;
    actor: string;
    action: string;
    time: string;
  }>;
  splitAuditActionParts: (
    action: string,
  ) => Array<{ type: 'text' | 'mention'; value: string }>;
  auditActorAvatarByName: Record<string, string>;
  clearAuditLogFilters: () => void;
}>();

defineEmits<{
  'update:auditTabFilter': [value: string];
  'update:auditActorFilter': [value: string];
  'update:auditTimeFilter': [value: string];
}>();

const auditTabOptions = computed(() =>
  props.auditTabOptions.length ? props.auditTabOptions : ['All'],
);

const TIME_OPTION_LABELS: Record<string, string> = {
  All: 'All time',
  '1h': 'Last 1 hour',
  '6h': 'Last 6 hours',
  '12h': 'Last 12 hours',
  '24h': 'Last 24 hours',
  '3d': 'Last 3 days',
  '7d': 'Last 7 days',
  '30d': 'Last 30 days',
  '90d': 'Last 90 days',
};

const auditTimeDropdownOptions = computed(() =>
  props.auditTimeOptions.map((option) => ({
    label: TIME_OPTION_LABELS[option] ?? option,
    value: option,
  })),
);
</script>

<template>
  <div class="roles-panel overflow-hidden rounded-2xl">
    <div class="border-b border-white/6 p-5">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div
            class="text-[11px] font-semibold uppercase tracking-[0.16em] text-fg-subtle"
          >
            Audit filters
          </div>
          <div class="mt-1 text-sm text-fg-soft">
            Filter by category, actor, or time. Open
            <span class="font-medium text-fg-soft">Actor</span> and use the
            search field to find someone in the list.
          </div>
        </div>
        <button
          type="button"
          class="shrink-0 rounded-lg px-3 py-2 text-xs font-semibold text-fg-soft transition-colors hover:bg-glass-hover hover:text-fg"
          @click="props.clearAuditLogFilters"
        >
          Clear filters
        </button>
      </div>

      <div class="mt-4">
        <div
          class="flex items-center gap-2 overflow-x-auto custom-scrollbar pb-1"
          role="tablist"
          aria-label="Audit log tabs"
        >
          <button
            v-for="tab in auditTabOptions"
            :key="tab"
            type="button"
            role="tab"
            :aria-selected="tab === props.auditTabFilter"
            class="shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors"
            :class="
              tab === props.auditTabFilter
                ? 'bg-glass-2 text-fg-strong ring-1 ring-border'
                : 'bg-glass-1 text-fg-soft hover:bg-glass-hover hover:text-fg ring-1 ring-border'
            "
            @click="$emit('update:auditTabFilter', tab)"
          >
            {{ tab }}
          </button>
        </div>
      </div>

      <div class="mt-4 grid gap-3 md:grid-cols-2">
        <EchoDropdown
          :model-value="props.auditActorFilter"
          :options="props.auditActorSelectOptions"
          label="Actor"
          searchable
          surface="server"
          teleport-menu
          @update:model-value="$emit('update:auditActorFilter', $event)"
        />

        <EchoDropdown
          :model-value="props.auditTimeFilter"
          :options="auditTimeDropdownOptions"
          label="Time window"
          surface="server"
          teleport-menu
          @update:model-value="$emit('update:auditTimeFilter', $event)"
        />
      </div>
    </div>

    <div class="p-5">
      <div class="flex items-center justify-between gap-2">
        <div>
          <div
            class="text-[11px] font-semibold uppercase tracking-[0.16em] text-fg-subtle"
          >
            Event feed
          </div>
          <div class="mt-1 text-sm text-fg-soft">
            Recent moderation and administrative actions across the server.
          </div>
        </div>
        <div
          class="shrink-0 rounded-full bg-glass-1 px-2.5 py-1 text-xs font-semibold text-fg-soft"
        >
          {{ props.filteredAuditEntries.length }} entries
        </div>
      </div>

      <div
        class="mt-4 max-h-[min(480px,52vh)] min-h-[12rem] overflow-y-auto scroll-pb-2 custom-scrollbar"
      >
        <div
          v-if="props.filteredAuditEntries.length"
          class="divide-y divide-white/6"
        >
          <div
            v-for="entry in props.filteredAuditEntries"
            :key="entry.id"
            class="px-1 py-4"
          >
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0 flex items-start gap-3">
                <img
                  :src="
                    safeImageUrl(
                      props.auditActorAvatarByName[entry.actor] || '',
                    )
                  "
                  alt=""
                  class="mt-0.5 h-8 w-8 shrink-0 rounded-full bg-glass-1 object-cover"
                />
                <div class="min-w-0">
                  <div
                    class="inline-flex rounded-full bg-glass-1 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-fg-soft"
                  >
                    {{ entry.tab }}
                  </div>
                  <div
                    class="mt-2 text-sm leading-6 text-fg-soft break-words [overflow-wrap:anywhere]"
                  >
                    <span class="mr-1.5 font-semibold text-fg">{{
                      entry.actor
                    }}</span>
                    <template
                      v-for="(part, idx) in props.splitAuditActionParts(
                        entry.action,
                      )"
                      :key="`${entry.id}-${idx}`"
                    >
                      <span v-if="part.type === 'text'">{{ part.value }}</span>
                      <span v-else class="font-semibold text-accent"
                        >@{{ part.value }}</span
                      >
                    </template>
                  </div>
                </div>
              </div>
              <div
                class="shrink-0 pt-0.5 text-right text-[11px] tabular-nums text-fg-subtle"
              >
                {{ entry.time }}
              </div>
            </div>
          </div>
        </div>

        <div v-else class="flex h-full items-center justify-center">
          <div
            class="w-full max-w-md rounded-2xl bg-glass-1 px-6 py-8 text-center ring-1 ring-border"
          >
            <div class="text-sm font-semibold text-fg-soft">
              No audit events match these filters.
            </div>
            <div class="mt-2 text-xs leading-5 text-fg-subtle">
              Try clearing filters or broadening the time window to see more
              activity.
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
