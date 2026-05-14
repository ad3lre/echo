<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import type { ChannelCategory } from '@/composables/useChannels';
import PausedGifAvatar from '@/components/PausedGifAvatar.vue';
import { useSimpleContextMenu } from '@/composables/useSimpleContextMenu';
import type { DmMentionNotificationRow } from '@/features/dm/collectDmMentionNotifications';
import {
  buildMentionNotificationSourceChips,
  filterDmMentionNotificationRows,
  type MentionNotificationSourceChip,
  type NotificationReadPreset,
  type NotificationSourceSelection,
} from '@/features/dm/filterDmMentionNotificationRows';
import { formatMessageListDaySeparatorLabel } from '@/features/chat/presentation/messageListRowFacts';
import { safeImageUrl } from '@/utils/safeImageUrl';
import {
  formatIsoCalendarDateLocal,
  formatShortTime,
} from '@/utils/formatTimestamp';
import { icons } from '@/assets/icons';

const props = defineProps<{
  currentUserId: string;
  rows: DmMentionNotificationRow[];
  users: { id: string; name: string; pfp: string; status?: string }[];
  readStateByChannelId: Readonly<Record<string, string | null>>;
  categoriesByServer: Readonly<Record<string, ChannelCategory[]>>;
  mentionServers: ReadonlyArray<{ id: string; name: string }>;
  isPersistedEchoDmThread: (channelId: string) => boolean;
  readPreset?: NotificationReadPreset;
  sourceKey?: string;
  showFilters?: boolean;
}>();

const emit = defineEmits<{
  'open-row': [row: DmMentionNotificationRow];
  'mark-row-read': [row: DmMentionNotificationRow];
  'update:read-preset': [preset: NotificationReadPreset];
  'update:source-key': [key: string];
  /** Mobile: return to DM Messages tab. */
  'back-to-messages': [];
}>();

const localReadPreset = ref<NotificationReadPreset>('all');
const localSourceKey = ref('all');
const contextRow = ref<DmMentionNotificationRow | null>(null);

const {
  menuOpen,
  menuRef,
  menuPosition,
  openAtEvent,
  closeMenu,
  fitMenuToViewport,
} = useSimpleContextMenu();

/**
 * Controlled/uncontrolled pattern: when the parent passes `readPreset` the
 * component forwards changes upward; otherwise it manages its own local state.
 */
const readPreset = computed<NotificationReadPreset>({
  get: () => props.readPreset ?? localReadPreset.value,
  set: (next) => {
    localReadPreset.value = next;
    emit('update:read-preset', next);
  },
});

/** Same controlled/uncontrolled pattern as `readPreset`, for the source chip selection. */
const selectedSourceKey = computed<string>({
  get: () => props.sourceKey ?? localSourceKey.value,
  set: (next) => {
    localSourceKey.value = next;
    emit('update:source-key', next);
  },
});

const usersById = computed(
  () => new Map(props.users.map((u) => [u.id, u] as const)),
);

const serverNameById = computed<Record<string, string>>(() => {
  const m: Record<string, string> = {};
  for (const s of props.mentionServers) {
    m[s.id] = s.name;
  }
  return m;
});

const sourceChips = computed((): MentionNotificationSourceChip[] =>
  buildMentionNotificationSourceChips({
    rows: props.rows,
    categoriesByServer: props.categoriesByServer,
    serverNameById: serverNameById.value,
    isPersistedEchoDmThread: props.isPersistedEchoDmThread,
  }),
);

/**
 * Keep source chips aligned with the active read preset so Unread/Read only
 * shows places that currently have matching rows.
 */
const visibleSourceChips = computed<MentionNotificationSourceChip[]>(() =>
  sourceChips.value.filter(
    (chip) =>
      chip.selection.kind === 'all' ||
      countRowsFor(readPreset.value, chip.selection) > 0,
  ),
);

// Reset the source chip selection when the active chip is removed
// (e.g. the last message from a server is read and that chip disappears).
watch(
  visibleSourceChips,
  (chips) => {
    if (!chips.some((c) => c.key === selectedSourceKey.value)) {
      selectedSourceKey.value = 'all';
    }
  },
  { deep: true },
);

const selectedSource = computed(
  () =>
    visibleSourceChips.value.find((c) => c.key === selectedSourceKey.value)
      ?.selection ?? { kind: 'all' as const },
);

const filteredRows = computed(() =>
  filterDmMentionNotificationRows({
    rows: props.rows,
    preset: readPreset.value,
    source: selectedSource.value,
    readStateByChannelId: props.readStateByChannelId,
    categoriesByServer: props.categoriesByServer,
    isPersistedEchoDmThread: props.isPersistedEchoDmThread,
  }),
);

function countRowsFor(
  preset: NotificationReadPreset,
  source: NotificationSourceSelection,
): number {
  return filterDmMentionNotificationRows({
    rows: props.rows,
    preset,
    source,
    readStateByChannelId: props.readStateByChannelId,
    categoriesByServer: props.categoriesByServer,
    isPersistedEchoDmThread: props.isPersistedEchoDmThread,
  }).length;
}

type PresetWidget = {
  key: NotificationReadPreset;
  label: string;
  hint: string;
  count: number;
};

const presetWidgets = computed<PresetWidget[]>(() => [
  {
    key: 'all',
    label: 'All mentions',
    hint: 'Show every mention and ping',
    count: countRowsFor('all', selectedSource.value),
  },
  {
    key: 'unread',
    label: 'Unread',
    hint: 'Only mentions not marked as read yet',
    count: countRowsFor('unread', selectedSource.value),
  },
  {
    key: 'read',
    label: 'Read',
    hint: 'Mentions already acknowledged',
    count: countRowsFor('read', selectedSource.value),
  },
]);

type SourceWidget = {
  key: string;
  label: string;
  context: string;
  count: number;
};

const sourceWidgets = computed<SourceWidget[]>(() =>
  visibleSourceChips.value.map((chip) => ({
    key: chip.key,
    label: chip.label,
    context:
      chip.selection.kind === 'all'
        ? 'Across all places'
        : chip.selection.kind === 'dms'
          ? 'Direct messages'
          : `In ${chip.label}`,
    count: countRowsFor(readPreset.value, chip.selection),
  })),
);

type DmNotificationListItem =
  | { type: 'header'; key: string; label: string }
  | { type: 'row'; key: string; row: DmMentionNotificationRow };

/** Newest-first rows with a sticky-style date header before each calendar day. */
const notificationListItems = computed((): DmNotificationListItem[] => {
  const rows = filteredRows.value;
  const out: DmNotificationListItem[] = [];
  let prevDay: string | null = null;
  for (const row of rows) {
    const d = new Date(row.timestamp);
    const day = Number.isNaN(d.getTime())
      ? '__invalid__'
      : formatIsoCalendarDateLocal(d);
    if (day !== prevDay) {
      prevDay = day;
      const label = formatMessageListDaySeparatorLabel(row.timestamp) || '—';
      out.push({
        type: 'header',
        key: `day:${day}:${row.key}`,
        label,
      });
    }
    out.push({ type: 'row', key: row.key, row });
  }
  return out;
});

const listEmptyMessage = computed(() => {
  if (props.rows.length === 0) {
    return "You're all caught up — no mentions yet.";
  }
  return 'No mentions match these filters.';
});

watch(menuOpen, async (open) => {
  if (!open) return;
  await nextTick();
  requestAnimationFrame(() => fitMenuToViewport(menuRef.value));
});

function closeContextMenu() {
  closeMenu();
  contextRow.value = null;
}

async function openRowContextMenu(
  row: DmMentionNotificationRow,
  e: MouseEvent,
) {
  contextRow.value = row;
  await openAtEvent(e);
}

function openContextRow() {
  if (!contextRow.value) return;
  emit('open-row', contextRow.value);
  closeContextMenu();
}

function markContextRowRead() {
  if (!contextRow.value) return;
  emit('mark-row-read', contextRow.value);
  closeContextMenu();
}

function pfpFor(userId: string): string {
  return usersById.value.get(userId)?.pfp ?? '';
}

/** Maps the raw mention kind array to the display label shown beside the author name. */
function formatKinds(kinds: readonly string[]): string {
  if (!kinds.length) return 'Mention';
  if (kinds.includes('user')) return '@you';
  if (kinds.includes('everyone')) return '@everyone';
  if (kinds.includes('active')) return '@active';
  return 'Mention';
}
</script>

<template>
  <div
    class="dm-notifications flex min-h-0 min-w-0 flex-1 flex-col bg-[var(--echo-dm-chrome-bg)] text-fg"
  >
    <header
      class="dm-notifications__header flex shrink-0 flex-col gap-2 border-b border-border px-5 py-4"
    >
      <div class="flex items-center gap-2 lg:hidden">
        <button
          type="button"
          class="inline-flex h-9 items-center gap-2 rounded-xl px-2 text-sm font-medium text-fg-soft transition-colors hover:bg-glass-2 hover:text-fg"
          aria-label="Back to messages"
          @click="emit('back-to-messages')"
        >
          <img
            :src="icons.arrowLeft"
            alt=""
            class="dm-notifications__back-icon h-5 w-5 shrink-0 opacity-90"
          />
          <span>Messages</span>
        </button>
      </div>
      <div class="flex flex-col gap-0.5">
        <p
          class="dm-notifications__kicker text-[11px] font-bold uppercase tracking-[0.18em] text-fg-subtle"
        >
          Notifications
        </p>
        <h1
          class="dm-notifications__title text-lg font-semibold text-fg-strong"
        >
          Mentions & pings
        </h1>
        <p class="text-xs text-fg-subtle">
          @{{ usersById.get(currentUserId)?.name?.trim() || 'you' }}
          in channels you’ve loaded — older threads appear after you visit them.
        </p>
      </div>

      <div
        v-if="props.showFilters !== false"
        class="flex flex-col gap-2"
        role="toolbar"
        aria-label="Mention filters"
      >
        <div class="dm-filter-widget-row custom-scrollbar">
          <button
            v-for="preset in presetWidgets"
            :key="preset.key"
            type="button"
            class="dm-filter-widget"
            :class="{ 'dm-filter-widget--active': readPreset === preset.key }"
            :aria-pressed="readPreset === preset.key"
            :title="preset.hint"
            :data-echo-hint="preset.hint"
            @click="readPreset = preset.key"
          >
            <span class="dm-filter-widget__label">{{ preset.label }}</span>
            <span class="dm-filter-widget__meta">{{ preset.hint }}</span>
            <span class="dm-filter-widget__count">{{ preset.count }}</span>
          </button>
        </div>

        <div v-if="sourceWidgets.length > 1" class="min-w-0">
          <p
            class="dm-notifications__section-heading mb-1 text-[10px] font-semibold uppercase tracking-wide text-fg-subtle"
          >
            Place
          </p>
          <div class="dm-filter-widget-row custom-scrollbar">
            <button
              v-for="source in sourceWidgets"
              :key="source.key"
              type="button"
              class="dm-filter-widget dm-filter-widget--source"
              :class="{
                'dm-filter-widget--active': selectedSourceKey === source.key,
              }"
              :aria-pressed="selectedSourceKey === source.key"
              :title="source.context"
              :data-echo-hint="source.context"
              @click="selectedSourceKey = source.key"
            >
              <span class="dm-filter-widget__label">{{ source.label }}</span>
              <span class="dm-filter-widget__meta">{{ source.context }}</span>
              <span class="dm-filter-widget__count">{{ source.count }}</span>
            </button>
          </div>
        </div>
      </div>
    </header>

    <div class="custom-scrollbar min-h-0 flex-1 overflow-y-auto px-3 py-3">
      <div
        v-if="filteredRows.length === 0"
        class="px-3 py-16 text-center text-sm text-fg-subtle"
      >
        {{ listEmptyMessage }}
      </div>
      <div v-else class="flex flex-col gap-1">
        <template v-for="item in notificationListItems" :key="item.key">
          <div
            v-if="item.type === 'header'"
            class="flex items-center gap-3 px-3 py-2"
            role="presentation"
          >
            <span
              class="dm-notifications__divider-line h-px flex-1"
              aria-hidden="true"
            />
            <span
              class="dm-notifications__divider-label shrink-0 text-[11px] font-semibold uppercase tracking-wide text-fg-subtle"
            >
              {{ item.label }}
            </span>
            <span
              class="dm-notifications__divider-line h-px flex-1"
              aria-hidden="true"
            />
          </div>
          <button
            v-else
            type="button"
            class="flex w-full items-start gap-3 rounded-xl px-3 py-3 text-left transition-colors hover:bg-glass-2"
            @click="emit('open-row', item.row)"
            @contextmenu.prevent="openRowContextMenu(item.row, $event)"
          >
            <div
              class="relative h-11 w-11 shrink-0 overflow-hidden rounded-full"
            >
              <PausedGifAvatar
                :src="safeImageUrl(pfpFor(item.row.authorId))"
                :alt="item.row.authorName"
                :session-key="item.row.authorId"
                img-class="h-full w-full rounded-full object-cover"
              />
            </div>
            <div class="min-w-0 flex-1">
              <div class="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <span class="truncate text-sm font-semibold text-fg-strong">{{
                  item.row.authorName
                }}</span>
                <span
                  class="dm-notifications__mention-kind shrink-0 text-[11px] font-medium"
                  >{{ formatKinds(item.row.mentionKinds) }}</span
                >
                <span class="text-[11px] text-fg-subtle">{{
                  formatShortTime(item.row.timestamp)
                }}</span>
              </div>
              <p class="mt-0.5 truncate text-xs font-medium text-fg-soft">
                # {{ item.row.channelLabel }}
              </p>
              <p class="mt-1 line-clamp-2 text-xs text-fg-soft">
                {{ item.row.preview }}
              </p>
            </div>
            <span
              class="mt-3 shrink-0 text-sm font-medium text-fg-subtle"
              aria-hidden="true"
              >›</span
            >
          </button>
        </template>
      </div>
    </div>

    <Teleport to="body">
      <div
        v-if="menuOpen && contextRow"
        ref="menuRef"
        class="ellipsis-menu fixed z-[140] min-w-[220px] py-1"
        :style="{
          left: `${menuPosition.left}px`,
          top: `${menuPosition.top}px`,
        }"
        role="menu"
        aria-label="Notification options"
        @contextmenu.prevent
      >
        <div
          class="truncate border-b border-border px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-fg-subtle"
        >
          {{ contextRow.authorName }}
        </div>
        <button
          type="button"
          class="echo-menu-item flex w-full items-center gap-2 px-3 py-2 text-left text-sm"
          role="menuitem"
          @click="openContextRow"
        >
          Open mention
        </button>
        <button
          type="button"
          class="echo-menu-item flex w-full items-center gap-2 px-3 py-2 text-left text-sm"
          role="menuitem"
          @click="markContextRowRead"
        >
          Mark as read
        </button>
      </div>
    </Teleport>
  </div>
</template>

<style scoped lang="scss">
.dm-filter-widget-row {
  display: flex;
  gap: 0.5rem;
  max-width: 100%;
  overflow-x: auto;
  overflow-y: hidden;
  padding-bottom: 0.2rem;
  scroll-snap-type: x proximity;
}

.dm-filter-widget {
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  grid-template-areas:
    'label count'
    'meta count';
  align-items: center;
  column-gap: 0.65rem;
  row-gap: 0.1rem;
  min-width: 12rem;
  max-width: 18rem;
  padding: 0.55rem 0.7rem;
  border-radius: 0.75rem;
  background: linear-gradient(
    140deg,
    color-mix(in srgb, white 6%, transparent) 0%,
    color-mix(in srgb, white 3%, transparent) 100%
  );
  color: color-mix(in srgb, white 83%, transparent);
  transition:
    background-color 120ms ease,
    color 120ms ease,
    transform 120ms ease;
  scroll-snap-align: start;
}

.dm-filter-widget:hover,
.dm-filter-widget:focus-visible {
  background: linear-gradient(
    140deg,
    color-mix(in srgb, white 11%, transparent) 0%,
    color-mix(in srgb, white 5%, transparent) 100%
  );
  color: white;
}

.dm-filter-widget:focus-visible {
  outline: none;
  box-shadow: 0 0 0 1px color-mix(in srgb, white 20%, transparent);
}

.dm-filter-widget--active {
  background: linear-gradient(
    140deg,
    color-mix(in srgb, #7c83ff 26%, transparent) 0%,
    color-mix(in srgb, #7c83ff 14%, transparent) 100%
  );
  color: white;
}

.dm-filter-widget__label {
  grid-area: label;
  min-width: 0;
  font-size: 0.73rem;
  font-weight: 650;
  letter-spacing: 0.01em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.dm-filter-widget__meta {
  grid-area: meta;
  min-width: 0;
  font-size: 0.66rem;
  color: color-mix(in srgb, currentColor 68%, transparent);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.dm-filter-widget__count {
  grid-area: count;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 1.65rem;
  padding: 0.2rem 0.45rem;
  border-radius: 999px;
  font-size: 0.66rem;
  font-weight: 700;
  background: color-mix(in srgb, black 30%, transparent);
  color: color-mix(in srgb, white 92%, transparent);
}

.dm-filter-widget--active .dm-filter-widget__count {
  background: color-mix(in srgb, #7c83ff 33%, black 67%);
}

@media (min-width: 768px) {
  .dm-filter-widget-row {
    flex-wrap: wrap;
    overflow-x: visible;
    padding-bottom: 0;
  }
}

@media (max-width: 420px) {
  .dm-filter-widget {
    min-width: min(13.5rem, calc(100vw - 4.25rem));
  }
}

.dm-notifications__back-icon {
  filter: invert(1);
}

.dm-notifications__divider-line {
  background: var(--color-glass-2);
}

.dm-notifications__mention-kind {
  color: color-mix(in srgb, #a5b4fc 92%, white 8%);
}

/* Light: notification chrome — ink-forward labels, accent-tinted structure, crisp filters */
:global([data-theme='light'] .dm-notifications__back-icon) {
  filter: none;
  opacity: 0.78;
}

:global([data-theme='light'] .dm-notifications__header) {
  border-color: color-mix(in srgb, var(--border) 72%, var(--accent) 28%);
  background: linear-gradient(
    180deg,
    color-mix(in srgb, var(--elevated) 88%, var(--accent) 6%) 0%,
    transparent 100%
  );
  box-shadow: 0 1px 0 rgba(255, 255, 255, 0.65) inset;
}

:global([data-theme='light'] .dm-notifications__kicker) {
  color: color-mix(in srgb, var(--accent) 78%, var(--text) 22%);
  letter-spacing: 0.2em;
}

:global([data-theme='light'] .dm-notifications__title) {
  color: var(--text);
  font-weight: 700;
  letter-spacing: -0.025em;
}

:global([data-theme='light'] .dm-notifications__section-heading) {
  color: color-mix(in srgb, var(--text) 38%, var(--accent) 62%);
  font-weight: 700;
  letter-spacing: 0.16em;
}

:global([data-theme='light'] .dm-notifications__divider-line) {
  background: linear-gradient(
    90deg,
    transparent 0%,
    color-mix(in srgb, var(--border) 55%, var(--accent) 45%) 42%,
    color-mix(in srgb, var(--border) 55%, var(--accent) 45%) 58%,
    transparent 100%
  );
}

:global([data-theme='light'] .dm-notifications__divider-label) {
  color: color-mix(in srgb, var(--text) 28%, var(--accent) 72%);
  font-weight: 700;
  letter-spacing: 0.08em;
}

:global([data-theme='light'] .dm-notifications__mention-kind) {
  color: color-mix(in srgb, var(--accent) 88%, var(--text) 12%);
}

:global([data-theme='light'] .dm-filter-widget) {
  background: linear-gradient(
    180deg,
    color-mix(in srgb, var(--elevated) 96%, var(--accent) 4%),
    color-mix(in srgb, var(--surface) 93%, var(--accent) 7%)
  );
  color: var(--text);
  border: 1px solid color-mix(in srgb, var(--border) 82%, var(--accent) 18%);
  box-shadow:
    0 1px 0 rgba(255, 255, 255, 0.82) inset,
    0 1px 2px rgba(15, 10, 25, 0.05);
}

:global([data-theme='light'] .dm-filter-widget:hover),
:global([data-theme='light'] .dm-filter-widget:focus-visible) {
  background: linear-gradient(
    180deg,
    color-mix(in srgb, var(--elevated) 90%, var(--accent) 10%),
    color-mix(in srgb, var(--surface) 86%, var(--accent) 14%)
  );
  color: var(--text);
  box-shadow:
    0 1px 0 rgba(255, 255, 255, 0.9) inset,
    0 2px 10px color-mix(in srgb, var(--accent) 14%, transparent);
}

:global([data-theme='light'] .dm-filter-widget:focus-visible) {
  outline: none;
  box-shadow:
    0 0 0 2px color-mix(in srgb, var(--accent) 38%, transparent),
    0 1px 0 rgba(255, 255, 255, 0.82) inset;
}

:global([data-theme='light'] .dm-filter-widget--active) {
  background: linear-gradient(
    155deg,
    color-mix(in srgb, var(--accent) 24%, var(--elevated) 76%),
    color-mix(in srgb, var(--accent) 16%, var(--surface) 84%)
  );
  color: var(--accent-contrast-fg);
  border-color: color-mix(in srgb, var(--accent) 52%, var(--border) 48%);
  box-shadow:
    0 1px 0 rgba(255, 255, 255, 0.28) inset,
    0 4px 16px color-mix(in srgb, var(--accent) 26%, transparent);
}

:global(
  [data-theme='light'] .dm-filter-widget--active .dm-filter-widget__meta
) {
  color: color-mix(in srgb, var(--accent-contrast-fg) 78%, transparent);
}

:global([data-theme='light'] .dm-filter-widget__meta) {
  color: color-mix(in srgb, var(--text) 58%, transparent);
}

:global([data-theme='light'] .dm-filter-widget__count) {
  background: color-mix(in srgb, var(--text) 10%, var(--surface) 90%);
  color: var(--text);
}

:global(
  [data-theme='light'] .dm-filter-widget--active .dm-filter-widget__count
) {
  background: color-mix(in srgb, var(--accent-contrast-fg) 22%, transparent);
  color: var(--accent-contrast-fg);
}
</style>
