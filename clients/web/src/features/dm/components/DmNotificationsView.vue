<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import type { ChannelCategory } from '@/features/layout/channels/useChannels';
import PausedGifAvatar from '@/components/PausedGifAvatar.vue';
import { useSimpleContextMenu } from '@/features/layout/useSimpleContextMenu';
import type { DmMentionNotificationRow } from '@/features/dm/collectDmMentionNotifications';
import {
  buildMentionNotificationSourceChips,
  filterDmMentionNotificationRows,
  type MentionNotificationPlaceVisual,
  type MentionNotificationSourceChip,
  type NotificationReadPreset,
  type NotificationSourceSelection,
} from '@/features/dm/filterDmMentionNotificationRows';
import {
  MENTION_NOTIFICATION_FAILED_PREVIEW,
  MENTION_NOTIFICATION_STUB_PREVIEW,
} from '@/features/dm/mentionNotificationAuthority';
import { formatMessageListDaySeparatorLabel } from '@/features/chat/domain/messageListRowFacts';
import { safeImageUrl } from '@/features/layout/display/safeImageUrl';
import {
  formatIsoCalendarDateLocal,
  formatShortTime,
} from '@/features/chat/formatTimestamp';
import { icons } from '@/assets/icons';

const props = defineProps<{
  currentUserId: string;
  rows: DmMentionNotificationRow[];
  resolveChannelLabel: (channelId: string) => string;
  resolveAuthorName: (row: DmMentionNotificationRow) => string;
  resolvePreview: (row: DmMentionNotificationRow) => string;
  users: { id: string; name: string; pfp: string; status?: string }[];
  readStateByChannelId: Readonly<Record<string, string | null>>;
  categoriesByServer: Readonly<Record<string, ChannelCategory[]>>;
  mentionServers: ReadonlyArray<{
    id: string;
    name: string;
    imageUrl?: string;
  }>;
  echoPeerByChannelId?: ReadonlyMap<string, string>;
  isPersistedEchoDmThread: (channelId: string) => boolean;
  readPreset?: NotificationReadPreset;
  sourceKey?: string;
  showFilters?: boolean;
  hydrationLoading?: boolean;
}>();

const emit = defineEmits<{
  'open-row': [row: DmMentionNotificationRow];
  'mark-row-read': [row: DmMentionNotificationRow];
  'update:read-preset': [preset: NotificationReadPreset];
  'update:source-key': [key: string];
  /** Mobile: return to DM Messages tab. */
  'back-to-messages': [];
}>();

const localReadPreset = ref<NotificationReadPreset>('unread');
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

watch(
  () => props.readPreset,
  (preset) => {
    if (preset === 'read') readPreset.value = 'all';
  },
  { immediate: true },
);

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

const serverImageUrlById = computed<Record<string, string | undefined>>(() => {
  const m: Record<string, string | undefined> = {};
  for (const s of props.mentionServers) {
    m[s.id] = s.imageUrl;
  }
  return m;
});

const sourceChips = computed((): MentionNotificationSourceChip[] =>
  buildMentionNotificationSourceChips({
    rows: props.rows,
    categoriesByServer: props.categoriesByServer,
    serverNameById: serverNameById.value,
    serverImageUrlById: serverImageUrlById.value,
  }),
);

const displayRows = computed(() =>
  props.rows.map((row) => ({
    ...row,
    channelLabel: props.resolveChannelLabel(row.channelId),
    authorName: props.resolveAuthorName(row),
    preview: props.resolvePreview(row),
  })),
);

function countRowsFor(
  preset: NotificationReadPreset,
  source: NotificationSourceSelection,
): number {
  return filterDmMentionNotificationRows({
    rows: displayRows.value,
    preset,
    source,
    readStateByChannelId: props.readStateByChannelId,
    categoriesByServer: props.categoriesByServer,
    isPersistedEchoDmThread: props.isPersistedEchoDmThread,
  }).length;
}

const UNREAD_FILTER_KEY = 'unread';

type PlaceWidget = {
  key: string;
  label: string;
  count: number;
  visual: MentionNotificationPlaceVisual;
};

/**
 * Single filter key for the vertical place list: `unread` or a source chip key.
 * Maps to the legacy read-preset + source-key pair the parent persists.
 */
const activeFilterKey = computed<string>({
  get: () => {
    if (readPreset.value === 'unread') return UNREAD_FILTER_KEY;
    return selectedSourceKey.value;
  },
  set: (key) => {
    if (key === UNREAD_FILTER_KEY) {
      readPreset.value = 'unread';
      selectedSourceKey.value = 'all';
      return;
    }
    readPreset.value = 'all';
    selectedSourceKey.value = key;
  },
});

const effectiveReadPreset = computed<NotificationReadPreset>(() =>
  activeFilterKey.value === UNREAD_FILTER_KEY ? 'unread' : 'all',
);

const effectiveSource = computed<NotificationSourceSelection>(() => {
  if (activeFilterKey.value === UNREAD_FILTER_KEY) {
    return { kind: 'all' };
  }
  return (
    sourceChips.value.find((chip) => chip.key === activeFilterKey.value)
      ?.selection ?? { kind: 'all' }
  );
});

/**
 * Keep place chips aligned with available rows. Unread is always shown; other
 * places appear when they have at least one mention.
 */
const visibleSourceChips = computed<MentionNotificationSourceChip[]>(() =>
  sourceChips.value.filter(
    (chip) =>
      chip.selection.kind === 'all' || countRowsFor('all', chip.selection) > 0,
  ),
);

const placeWidgets = computed<PlaceWidget[]>(() => {
  const unread: PlaceWidget = {
    key: UNREAD_FILTER_KEY,
    label: 'Unread',
    count: countRowsFor('unread', { kind: 'all' }),
    visual: { kind: 'none' },
  };
  const places = visibleSourceChips.value.map((chip) => ({
    key: chip.key,
    label: chip.label,
    count: countRowsFor('all', chip.selection),
    visual: chip.visual,
  }));
  return [unread, ...places];
});

const filteredRows = computed(() =>
  filterDmMentionNotificationRows({
    rows: displayRows.value,
    preset: effectiveReadPreset.value,
    source: effectiveSource.value,
    readStateByChannelId: props.readStateByChannelId,
    categoriesByServer: props.categoriesByServer,
    isPersistedEchoDmThread: props.isPersistedEchoDmThread,
  }),
);

watch(
  placeWidgets,
  (widgets) => {
    if (!widgets.some((place) => place.key === activeFilterKey.value)) {
      activeFilterKey.value = UNREAD_FILTER_KEY;
    }
  },
  { deep: true },
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

function isLoadingStubRow(row: DmMentionNotificationRow): boolean {
  return props.resolvePreview(row) === MENTION_NOTIFICATION_STUB_PREVIEW;
}

function isFailedStubRow(row: DmMentionNotificationRow): boolean {
  return row.preview === MENTION_NOTIFICATION_FAILED_PREVIEW;
}

function rowPreviewText(row: DmMentionNotificationRow): string {
  return props.resolvePreview(row);
}

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
            class="echo-ink-icon h-5 w-5 shrink-0 opacity-90"
          />
          <span>Messages</span>
        </button>
      </div>
      <div class="flex items-center gap-3">
        <div
          class="dm-notifications__avatar flex h-11 w-11 shrink-0 items-center justify-center rounded-full"
        >
          <svg
            class="h-6 w-6 text-white"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
        </div>
        <div class="flex min-w-0 flex-col gap-0.5">
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
          <p class="truncate text-xs text-fg-subtle">
            @{{ usersById.get(currentUserId)?.name?.trim() || 'you' }} in
            channels you’ve loaded
          </p>
        </div>
      </div>
    </header>

    <div class="dm-notifications__body flex min-h-0 min-w-0 flex-1 flex-col">
      <div
        class="dm-notifications__list custom-scrollbar min-h-0 min-w-0 flex-1 overflow-y-auto px-3 py-3"
      >
        <div
          v-if="filteredRows.length === 0"
          class="px-3 py-16 text-center text-sm text-fg-subtle"
          :aria-busy="props.hydrationLoading && props.rows.length === 0"
        >
          <p v-if="props.hydrationLoading && props.rows.length === 0">
            Loading mentions from your channels…
          </p>
          <p v-else>{{ listEmptyMessage }}</p>
        </div>
        <div v-else class="flex flex-col gap-1">
          <template v-for="item in notificationListItems" :key="item.key">
            <div
              v-if="item.type === 'header'"
              class="flex items-center gap-3 px-3 pb-1 pt-3 first:pt-1"
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
              class="dm-notification-card group flex w-full touch-manipulation items-start gap-3 rounded-2xl px-3 py-3.5 text-left sm:py-3"
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
                <span
                  class="dm-notification-card__chip mt-1 inline-flex max-w-full items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium"
                >
                  <span class="opacity-70">#</span>
                  <span class="truncate">{{ item.row.channelLabel }}</span>
                </span>
                <p
                  class="mt-1.5 line-clamp-3 text-xs leading-relaxed"
                  :class="{
                    'dm-notification-card__preview--failed': isFailedStubRow(
                      item.row,
                    ),
                    'dm-notification-card__preview--loading': isLoadingStubRow(
                      item.row,
                    ),
                    'text-fg-soft':
                      !isFailedStubRow(item.row) && !isLoadingStubRow(item.row),
                  }"
                >
                  {{ rowPreviewText(item.row) }}
                </p>
              </div>
              <span
                class="dm-notification-card__jump mt-2 hidden shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold sm:inline-flex"
                aria-hidden="true"
              >
                Jump
                <span>›</span>
              </span>
            </button>
          </template>
        </div>
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

<style scoped lang="scss" src="./styles/DmNotificationsView.scss"></style>
