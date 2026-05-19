<script setup lang="ts">
import { computed, nextTick, ref, toRef, watch } from 'vue';
import { icons, getChannelDisplayName } from '@/assets/icons';
import { useChannelIconResolver } from '@/composables/useChannelIconResolver';
import {
  getParentChannelIdOrNull,
  isForumPostChannel,
  isForumPostPinned,
  isForumPostArchived,
} from '@/features/forums/domain/forumPostChannel';
import type {
  ChannelWithParticipants,
  ChannelCategory,
} from '@/features/channel-panel/composables/useChannelPanelVoiceState';
import type { VcActivityPresenceKind } from '@/features/voice/vcActivityTypes';
import ChannelPanelVoiceParticipant from './ChannelPanelVoiceParticipant.vue';
import ChannelPanelDiscordMirrorParticipant from './ChannelPanelDiscordMirrorParticipant.vue';
import ChannelIconPickerPopover from '@/components/ChannelIconPickerPopover.vue';
import EchoDropdown from '@/components/EchoDropdown.vue';
import type { CreateChannelModalSubmitPayload } from '@/components/CreateChannelModal.vue';
import { layoutHyperLog } from '@/utils/layoutHyperLog';
import {
  clampEchoChannelName,
  ECHO_CHANNEL_NAME_MAX_LENGTH,
} from '@shared/echoChannelLimits';
import { useCompactShell } from '@/composables/useCompactShell';
import { useEchoSessionStore } from '@/stores/echoSession';
import ChannelPanelVoiceOccupancyIndicator from '@/features/channel-panel/components/ChannelPanelVoiceOccupancyIndicator.vue';

const { isCompactShell } = useCompactShell();
const echoSession = useEchoSessionStore();
const CATEGORY_COLLAPSE_STORAGE_KEY =
  'echo.channelPanelCollapsedCategoriesByServer';

function readCollapsedCategoryIdsByServer(): Record<string, string[]> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(CATEGORY_COLLAPSE_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object') return {};
    const out: Record<string, string[]> = {};
    for (const [serverId, ids] of Object.entries(parsed)) {
      if (!Array.isArray(ids)) continue;
      out[serverId] = ids.filter((id): id is string => typeof id === 'string');
    }
    return out;
  } catch {
    return {};
  }
}

function writeCollapsedCategoryIdsByServer(map: Record<string, string[]>) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      CATEGORY_COLLAPSE_STORAGE_KEY,
      JSON.stringify(map),
    );
  } catch {
    /* ignore */
  }
}

function discordMirrorMembers(echoChannelId: string) {
  return (
    echoSession.discordVoiceMirrorRosterByEchoChannelId[echoChannelId] ?? []
  );
}

/** Forum post rows under a hub: thread affordance, not the same as a top-level # channel. */
function forumPostSubRowIconUrl(): string {
  return icons.message;
}

const props = defineProps<{
  effectiveCategories: ChannelCategory[];
  activeChannelId: string;
  currentVoiceChannelId: string | null;
  hoveredChannelId: string | null;
  /** Sparse: channel ids with unread (attention) for row emphasis (independent of rail badge prefs). */
  channelMissedActivityByChannelId?: Record<string, true>;
  selectedServerId: string | null;
  /** Guild owner user id — crown next to voice participant names. */
  serverOwnerId?: string | null;
  canCreateChannels: boolean;
  /** Echo: show drag handle when user has MANAGE_CHANNELS. */
  canReorderChannels?: boolean;
  /** Echo: drag-reorder category headers (MANAGE_CHANNELS). */
  canReorderCategories?: boolean;
  canInvite: boolean;
  sideChatCollapsed: boolean;
  openProfileUserId: string | null;
  getUserById: (id: string) => { name: string; pfp: string } | undefined;
  /** When LiveKit lists a participant not yet in workspace, resolve a label (e.g. SFU display name). */
  voiceParticipantLabel?: (
    channelId: string,
    userId: string,
  ) => string | undefined;
  participantVoiceUi: (channelId: string, userId: string) => any;
  rowCanManageChannel: (channel: any) => boolean;
  /** Voice rows: when set and returns false, row looks disabled (click still shows parent toast). */
  canJoinVoice?: (channelId: string) => boolean;
  /** Mobile VC lobby: pulse outline on the targeted voice row. */
  voiceLobbyChannelId?: string | null;
  getVcActivityPresence?: (userId: string) => VcActivityPresenceKind[];
  /** User id hosting synced VC activity for the connected voice session; crown in roster. */
  vcActivityKingUserId?: string | null;
  /** When true, show icon-only bubble view for narrow panels */
  bubbleMode?: boolean;
}>();

const channelIconResolver = useChannelIconResolver(
  toRef(() => props.selectedServerId ?? undefined),
);

function getChannelEmojiOrNull(channel: {
  name: string;
  type?: 'text' | 'voice' | 'forum';
  iconKey?: string;
}): string | null {
  const v = channelIconResolver.getVisual(channel);
  return v.kind === 'emoji' ? v.emoji : null;
}

function getChannelIconUrlOrFallback(channel: {
  name: string;
  type?: 'text' | 'voice' | 'forum';
  iconKey?: string;
}): string {
  const v = channelIconResolver.getVisual(channel);
  if (v.kind === 'svg' || v.kind === 'image') return v.url;
  return channelIconResolver.getIconUrl(channel);
}

function channelIconUsesInvert(channel: { iconKey?: string }): boolean {
  return channelIconResolver.usesSvgInvert(channel.iconKey);
}

function channelRowMissedActivity(channelId: string): boolean {
  return !!props.channelMissedActivityByChannelId?.[channelId];
}

const emit = defineEmits<{
  'open-create-channel': [categoryId: string | null];
  'open-create-category': [];
  'open-category-settings': [categoryId: string];
  'open-channel-settings': [payload: { channel: any; categoryId: string }];
  'category-contextmenu': [
    categoryId: string,
    categoryName: string,
    event: MouseEvent,
  ];
  'channel-click': [channel: ChannelWithParticipants];
  'channel-contextmenu': [
    channel: ChannelWithParticipants,
    categoryId: string,
    categoryName: string,
    event: MouseEvent,
  ];
  'vc-participant-click': [userId: string, event: MouseEvent | HTMLElement];
  'vc-participant-contextmenu': [
    userId: string,
    channel: ChannelWithParticipants,
    categoryId: string,
    categoryName: string,
    event: MouseEvent,
  ];
  invite: [payload?: { voiceChannelId: string; voiceChannelName?: string }];
  'toggle-side-chat': [];
  'set-hovered-channel': [id: string | null];
  'quick-create-submit': [payload: CreateChannelModalSubmitPayload];
  'channel-reorder': [
    payload: {
      channelId: string;
      targetCategoryId: string | null;
      siblingIndex: number;
    },
  ];
  'category-reorder': [payload: { categoryId: string; siblingIndex: number }];
}>();

function categoryIdForApi(category: ChannelCategory): string {
  return category.hideCategoryHeader ? '' : category.id;
}

function blurChannelSettingsTrigger(e: MouseEvent) {
  (e.currentTarget as HTMLButtonElement | null)?.blur();
}

function openChannelSettings(
  payload: { channel: any; categoryId: string },
  e: MouseEvent,
) {
  blurChannelSettingsTrigger(e);
  emit('open-channel-settings', payload);
}

function openCategorySettings(categoryId: string, e: MouseEvent) {
  blurChannelSettingsTrigger(e);
  emit('open-category-settings', categoryId);
}

function voiceParticipantName(channelId: string, userId: string) {
  return (
    props.voiceParticipantLabel?.(channelId, userId) ??
    props.getUserById(userId)?.name
  );
}

const reorderEnabled = computed(
  () => !!props.canReorderChannels && props.selectedServerId !== 'echo',
);

const categoryReorderEnabled = computed(
  () => !!props.canReorderCategories && props.selectedServerId !== 'echo',
);

const realCategoryIds = computed(() =>
  props.effectiveCategories
    .filter((c) => !c.hideCategoryHeader)
    .map((c) => c.id),
);

const realCategoryCount = computed(() => realCategoryIds.value.length);

const reorderDragChannelId = ref<string | null>(null);
const reorderDragCategoryId = ref<string | null>(null);
/** After a successful drop, suppress the row click that follows dragend (HTML5 DnD quirk). */
const suppressChannelClickAfterReorder = ref(false);
/** After category drag ends, suppress stray click on the category header (caret lives in the toggle button). */
const suppressCategoryToggleClick = ref(false);
/** Gap index within this category’s top-level channel list (0..n); matches server-rail drop line semantics. */
const channelDropLine = ref<{ categoryId: string; lineBefore: number } | null>(
  null,
);
/** 0..realCategoryCount — drop line before category at index, or `realCategoryCount` for end. */
const categoryDropLineBefore = ref<number | null>(null);
const collapsedCategoryIds = ref<Set<string>>(new Set());

function persistCollapsedCategoryIdsForServer(serverId: string) {
  const map = readCollapsedCategoryIdsByServer();
  const ids = [...collapsedCategoryIds.value];
  if (ids.length === 0) {
    delete map[serverId];
  } else {
    map[serverId] = ids;
  }
  writeCollapsedCategoryIdsByServer(map);
}

function syncCollapsedCategoriesForServer(serverId: string | null) {
  if (!serverId) {
    collapsedCategoryIds.value = new Set();
    return;
  }
  const map = readCollapsedCategoryIdsByServer();
  const persisted = map[serverId] ?? [];
  const allowed = new Set(
    props.effectiveCategories
      .filter((c) => !c.hideCategoryHeader)
      .map((c) => c.id),
  );
  const filtered = persisted.filter((id) => allowed.has(id));
  collapsedCategoryIds.value = new Set(filtered);
  if (filtered.length !== persisted.length) {
    if (filtered.length === 0) {
      delete map[serverId];
    } else {
      map[serverId] = filtered;
    }
    writeCollapsedCategoryIdsByServer(map);
  }
}

function isCategoryCollapsed(categoryId: string): boolean {
  return collapsedCategoryIds.value.has(categoryId);
}

function toggleCategoryCollapsed(categoryId: string) {
  const next = new Set(collapsedCategoryIds.value);
  if (next.has(categoryId)) {
    next.delete(categoryId);
  } else {
    next.add(categoryId);
  }
  collapsedCategoryIds.value = next;
  const sid = props.selectedServerId;
  if (sid) persistCollapsedCategoryIdsForServer(sid);
}

function onCategoryToggleClick(categoryId: string, ev: MouseEvent) {
  if (suppressCategoryToggleClick.value) {
    ev.preventDefault();
    ev.stopPropagation();
    return;
  }
  toggleCategoryCollapsed(categoryId);
}

function categoryApiIdForReorder(category: ChannelCategory): string | null {
  return category.hideCategoryHeader ? null : category.id;
}

function topLevelIdsForCategory(cat: ChannelCategory): string[] {
  return topLevelChannelsForCategory(cat.channels).map((c) => c.id);
}

/** Ordering space for drops: per real category, or merged roots for uncategorized. */
function bucketIdsForCategory(cat: ChannelCategory): string[] {
  if (!cat.hideCategoryHeader) {
    return topLevelIdsForCategory(cat);
  }
  const ids: string[] = [];
  for (const c of props.effectiveCategories) {
    if (c.hideCategoryHeader) {
      ids.push(...topLevelIdsForCategory(c));
    }
  }
  return ids;
}

function reorderInsertIndex(
  orderedIds: string[],
  draggedId: string,
  insertBeforeId: string | null,
): number | null {
  const without = orderedIds.filter((id) => id !== draggedId);
  if (insertBeforeId === null) return without.length;
  if (insertBeforeId === draggedId) return null;
  const i = without.indexOf(insertBeforeId);
  return i === -1 ? without.length : i;
}

function realCategoryIndex(category: ChannelCategory): number | null {
  if (category.hideCategoryHeader) return null;
  let i = 0;
  for (const c of props.effectiveCategories) {
    if (!c.hideCategoryHeader) {
      if (c.id === category.id) return i;
      i++;
    }
  }
  return null;
}

function showCategoryDropLineBefore(ri: number): boolean {
  if (!reorderDragCategoryId.value || categoryDropLineBefore.value === null)
    return false;
  return categoryDropLineBefore.value === ri;
}

function onCategoryReorderDragStart(categoryId: string, e: DragEvent) {
  reorderDragCategoryId.value = categoryId;
  reorderDragChannelId.value = null;
  channelDropLine.value = null;
  categoryDropLineBefore.value = null;
  const dt = e.dataTransfer;
  if (dt) {
    dt.setData('text/plain', categoryId);
    dt.effectAllowed = 'move';
  }
}

function onCategoryReorderDragEnd() {
  const hadCategoryDrag = reorderDragCategoryId.value !== null;
  reorderDragCategoryId.value = null;
  categoryDropLineBefore.value = null;
  if (hadCategoryDrag) {
    suppressCategoryToggleClick.value = true;
    window.setTimeout(() => {
      suppressCategoryToggleClick.value = false;
    }, 0);
  }
}

function onCategoryGapDragOver(ri: number, e: DragEvent) {
  if (categoryReorderEnabled.value && reorderDragCategoryId.value !== null) {
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
    categoryDropLineBefore.value = ri;
    return;
  }
  if (reorderEnabled.value && reorderDragChannelId.value !== null) {
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
    const ids = realCategoryIds.value;
    if (ri < ids.length) {
      const catId = ids[ri];
      const cat = props.effectiveCategories.find((c) => c.id === catId);
      if (cat) {
        channelDropLine.value = { categoryId: cat.id, lineBefore: 0 };
      }
    } else if (ids.length > 0) {
      const lastId = ids[ids.length - 1];
      const cat = props.effectiveCategories.find((c) => c.id === lastId);
      if (cat) {
        const n = topLevelChannelsForCategory(cat.channels).length;
        channelDropLine.value = { categoryId: cat.id, lineBefore: n };
      }
    }
  }
}

function onCategoryAppendDragOver(e: DragEvent) {
  if (!categoryReorderEnabled.value || reorderDragCategoryId.value === null)
    return;
  e.preventDefault();
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
  categoryDropLineBefore.value = realCategoryCount.value;
}

function onCategoryHeaderDragOver(category: ChannelCategory, e: DragEvent) {
  if (categoryReorderEnabled.value && reorderDragCategoryId.value !== null) {
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
    const ri = realCategoryIndex(category);
    if (ri === null) return;
    const ids = realCategoryIds.value;
    const n = ids.length;
    const el = e.currentTarget as HTMLElement;
    const rect = el.getBoundingClientRect();
    const mid = rect.top + rect.height / 2;
    const raw = e.clientY < mid ? ri : ri + 1;
    categoryDropLineBefore.value = Math.max(0, Math.min(raw, n));
    return;
  }
  if (reorderEnabled.value && reorderDragChannelId.value !== null) {
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
    channelDropLine.value = {
      categoryId: category.id,
      lineBefore: 0,
    };
  }
}

function onCategoryDropAtLine(lineBefore: number, e: DragEvent) {
  if (reorderDragChannelId.value) {
    const ids = realCategoryIds.value;
    if (lineBefore < ids.length) {
      const catId = ids[lineBefore];
      const cat = props.effectiveCategories.find((c) => c.id === catId);
      if (cat) {
        const topIds = topLevelIdsForCategory(cat);
        const insertBeforeId = topIds.length > 0 ? topIds[0]! : null;
        onReorderDrop(cat, insertBeforeId, e);
      }
    } else if (ids.length > 0) {
      const lastCat = props.effectiveCategories.find(
        (c) => c.id === ids[ids.length - 1],
      );
      if (lastCat) onReorderDrop(lastCat, null, e);
    }
    return;
  }

  const ids = realCategoryIds.value;
  const fromTransfer = e.dataTransfer?.getData('text/plain')?.trim();
  const dragId = reorderDragCategoryId.value ?? fromTransfer ?? null;
  if (!dragId) return;
  const without = ids.filter((id) => id !== dragId);
  const clamped = Math.max(0, Math.min(lineBefore, without.length));
  const insertBeforeId = without[clamped] ?? null;
  const idx = reorderInsertIndex(ids, dragId, insertBeforeId);
  if (idx === null) return;
  emit('category-reorder', { categoryId: dragId, siblingIndex: idx });
  reorderDragCategoryId.value = null;
  categoryDropLineBefore.value = null;
}

function onCategoryHeaderDrop(category: ChannelCategory, e: DragEvent) {
  if (reorderEnabled.value && reorderDragChannelId.value !== null) {
    const topIds = topLevelIdsForCategory(category);
    const insertBeforeId = topIds.length > 0 ? topIds[0]! : null;
    onReorderDrop(category, insertBeforeId, e);
    return;
  }

  if (!categoryReorderEnabled.value || reorderDragCategoryId.value === null)
    return;
  const ri = realCategoryIndex(category);
  if (ri === null) return;
  const ids = realCategoryIds.value;
  const el = e.currentTarget as HTMLElement;
  const rect = el.getBoundingClientRect();
  const mid = rect.top + rect.height / 2;
  const insertBeforeId =
    e.clientY < mid ? ids[ri]! : ri + 1 < ids.length ? ids[ri + 1]! : null;
  const fromTransfer = e.dataTransfer?.getData('text/plain')?.trim();
  const dragId = reorderDragCategoryId.value ?? fromTransfer ?? null;
  if (!dragId) return;
  const idx = reorderInsertIndex(ids, dragId, insertBeforeId);
  if (idx === null) return;
  emit('category-reorder', { categoryId: dragId, siblingIndex: idx });
  reorderDragCategoryId.value = null;
  categoryDropLineBefore.value = null;
}

function onReorderDragStart(channelId: string, e: DragEvent) {
  const t = e.target;
  if (t instanceof Element && t.closest('button')) {
    e.preventDefault();
    return;
  }
  reorderDragChannelId.value = channelId;
  reorderDragCategoryId.value = null;
  categoryDropLineBefore.value = null;
  channelDropLine.value = null;
  const dt = e.dataTransfer;
  if (dt) {
    dt.setData('text/plain', channelId);
    dt.effectAllowed = 'move';
  }
}

function onReorderDragEnd() {
  reorderDragChannelId.value = null;
  channelDropLine.value = null;
  if (suppressChannelClickAfterReorder.value) {
    window.setTimeout(() => {
      suppressChannelClickAfterReorder.value = false;
    }, 50);
  }
}

/**
 * HTML5 DnD only allows a drop if dragover is cancelled. The cursor often sits on
 * gaps, pseudo-elements, or text nodes — no per-row listener runs. Capture here
 * so the whole list accepts the drag while a channel reorder is in progress.
 */
function onChannelListDragOverCapture(e: DragEvent) {
  if (!reorderEnabled.value && !categoryReorderEnabled.value) return;
  if (!reorderDragChannelId.value && !reorderDragCategoryId.value) return;
  e.preventDefault();
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
}

function onChannelRowDragOver(
  category: ChannelCategory,
  channelIndex: number,
  e: DragEvent,
) {
  if (reorderDragCategoryId.value) return;
  if (!reorderEnabled.value || reorderDragChannelId.value === null) return;
  e.preventDefault();
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
  const el = e.currentTarget;
  if (!(el instanceof HTMLElement)) return;
  const rect = el.getBoundingClientRect();
  const mid = rect.top + rect.height / 2;
  const topIds = topLevelChannelsForCategory(category.channels);
  const n = topIds.length;
  const raw = e.clientY < mid ? channelIndex : channelIndex + 1;
  channelDropLine.value = {
    categoryId: category.id,
    lineBefore: Math.max(0, Math.min(raw, n)),
  };
}

function onAppendZoneDragOver(category: ChannelCategory, e: DragEvent) {
  if (reorderDragCategoryId.value) return;
  if (!reorderEnabled.value || reorderDragChannelId.value === null) return;
  e.preventDefault();
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
  const n = topLevelChannelsForCategory(category.channels).length;
  channelDropLine.value = {
    categoryId: category.id,
    lineBefore: n,
  };
}

function showDropLineBefore(category: ChannelCategory, idx: number): boolean {
  if (!reorderDragChannelId.value || !channelDropLine.value) return false;
  return (
    channelDropLine.value.categoryId === category.id &&
    channelDropLine.value.lineBefore === idx
  );
}

function showDropLineEnd(category: ChannelCategory): boolean {
  if (!reorderDragChannelId.value || !channelDropLine.value) return false;
  if (channelDropLine.value.categoryId !== category.id) return false;
  const n = topLevelChannelsForCategory(category.channels).length;
  return channelDropLine.value.lineBefore === n;
}

/**
 * Resolves "insert before this channel id" from the last drag-over line (or pointer vs row).
 * Row @drop used to always pass `channel.id`, which ignored upper/lower half — drops often no-op or wrong.
 */
function resolveInsertBeforeIdForRowDrop(
  category: ChannelCategory,
  channelIndex: number,
  e: DragEvent,
): string | null {
  const topIds = topLevelIdsForCategory(category);
  const n = topIds.length;
  let lineBefore: number;
  const dropLine = channelDropLine.value;
  if (
    dropLine?.categoryId === category.id &&
    dropLine.lineBefore >= 0 &&
    dropLine.lineBefore <= n
  ) {
    lineBefore = dropLine.lineBefore;
  } else {
    const el = e.currentTarget;
    if (!(el instanceof HTMLElement)) {
      lineBefore = channelIndex;
    } else {
      const rect = el.getBoundingClientRect();
      const mid = rect.top + rect.height / 2;
      const raw = e.clientY < mid ? channelIndex : channelIndex + 1;
      lineBefore = Math.max(0, Math.min(raw, n));
    }
  }
  if (lineBefore >= n) return null;
  return topIds[lineBefore] ?? null;
}

function onReorderDropOnRow(
  category: ChannelCategory,
  channelIndex: number,
  e: DragEvent,
) {
  const insertBeforeId = resolveInsertBeforeIdForRowDrop(
    category,
    channelIndex,
    e,
  );
  onReorderDrop(category, insertBeforeId, e, { fromChannelRow: true });
}

function onReorderDrop(
  targetCategory: ChannelCategory,
  insertBeforeId: string | null,
  e?: DragEvent,
  opts?: { fromChannelRow?: boolean },
) {
  if (reorderDragCategoryId.value) return;
  const fromTransfer = e?.dataTransfer?.getData('text/plain')?.trim();
  const dragId = reorderDragChannelId.value ?? fromTransfer ?? null;
  if (!dragId) return;
  const bucket = bucketIdsForCategory(targetCategory);
  const idx = reorderInsertIndex(bucket, dragId, insertBeforeId);
  if (idx === null) return;
  emit('channel-reorder', {
    channelId: dragId,
    targetCategoryId: categoryApiIdForReorder(targetCategory),
    siblingIndex: idx,
  });
  // Row drops fire a stray click on the dragged row after drop (HTML5 DnD quirk).
  if (opts?.fromChannelRow) {
    suppressChannelClickAfterReorder.value = true;
  } else if (insertBeforeId !== null) {
    suppressChannelClickAfterReorder.value = true;
  }
}

function onChannelRowActivate(channel: ChannelWithParticipants) {
  if (suppressChannelClickAfterReorder.value) {
    suppressChannelClickAfterReorder.value = false;
    return;
  }
  emit('channel-click', channel);
}

type QuickCreateType = 'text' | 'voice' | 'forum' | 'category';
type QuickCreateStage = 'pick-type' | 'details';

/** Parent forum id when its hub or one of its posts is selected (for compact sidebar). */
const activeForumContextId = computed((): string | null => {
  const id = props.activeChannelId;
  if (!id) return null;
  for (const cat of props.effectiveCategories) {
    const ch = cat.channels.find((c) => c.id === id);
    if (!ch) continue;
    if (ch.type === 'forum') return ch.id;
    const parent = getParentChannelIdOrNull(ch);
    if (parent && isForumPostChannel(ch)) return parent;
  }
  return null;
});

function topLevelChannelsForCategory(channels: ChannelWithParticipants[]) {
  return channels.filter((c: any) => {
    if (getParentChannelIdOrNull(c)) return false;
    if (isForumPostChannel(c)) return false;
    return true;
  });
}

function visibleForumSubchannelsForParent(
  channels: ChannelWithParticipants[],
  parentId: string,
  activeForumId: string | null,
) {
  if (!activeForumId || activeForumId !== parentId) return [];
  return channels.filter((c: any) => {
    if (getParentChannelIdOrNull(c) !== parentId) return false;
    if (!isForumPostChannel(c)) return false;

    const isActive = props.activeChannelId === c.id;
    if (isActive) return true;

    if (isForumPostArchived(c)) return false;
    return isForumPostPinned(c);
  });
}

const quickCreateExpanded = ref(false);
const quickCreateStage = ref<QuickCreateStage>('pick-type');
const quickCreateType = ref<QuickCreateType>('text');
const quickCreateName = ref('');
const quickCreateCategoryId = ref('');
const quickCreateInputRef = ref<HTMLInputElement | null>(null);
const quickCreateIconKey = ref<string>('message');
const quickCreateStackRef = ref<HTMLElement | null>(null);
const channelListRef = ref<HTMLElement | null>(null);

const topLevelChannelCount = computed(() =>
  props.effectiveCategories.reduce((sum, category) => {
    return sum + topLevelChannelsForCategory(category.channels).length;
  }, 0),
);

const visibleForumPostCount = computed(() =>
  props.effectiveCategories.reduce((sum, category) => {
    const perCategory = topLevelChannelsForCategory(category.channels).reduce(
      (inner, channel) => {
        if (channel.type !== 'forum') return inner;
        return (
          inner +
          visibleForumSubchannelsForParent(
            category.channels,
            channel.id,
            activeForumContextId.value,
          ).length
        );
      },
      0,
    );
    return sum + perCategory;
  }, 0),
);

const categoryOptions = computed(() =>
  props.effectiveCategories
    .filter((category) => !category.hideCategoryHeader)
    .map((category) => ({
      id: category.id,
      label: getChannelDisplayName(category.name),
    })),
);

const quickCreateCategoryDropdownOptions = computed(() =>
  categoryOptions.value.map((category) => ({
    value: category.id,
    label: category.label,
  })),
);

const activeCategoryId = computed(() => {
  for (const category of props.effectiveCategories) {
    const match = category.channels.find(
      (channel) => channel.id === props.activeChannelId,
    );
    if (!match) continue;
    return categoryIdForApi(category) || null;
  }
  return null;
});

const quickCreateCanUseChannels = computed(
  () => categoryOptions.value.length > 0,
);
const quickCreateNeedsCategory = computed(
  () => quickCreateType.value !== 'category',
);
const quickCreateTrimmedName = computed(() => quickCreateName.value.trim());
const quickCreateDuplicateCategory = computed(() => {
  if (quickCreateType.value !== 'category') return false;
  const normalized = quickCreateTrimmedName.value.toLocaleLowerCase();
  if (!normalized) return false;
  return categoryOptions.value.some(
    (category) => category.label.toLocaleLowerCase() === normalized,
  );
});
const quickCreateCanSubmit = computed(() => {
  if (!quickCreateTrimmedName.value) return false;
  if (quickCreateType.value === 'category') {
    return !quickCreateDuplicateCategory.value;
  }
  return !!quickCreateCategoryId.value && quickCreateCanUseChannels.value;
});

function defaultQuickCreateCategoryId(): string {
  const preferred = activeCategoryId.value;
  if (
    preferred &&
    categoryOptions.value.some((category) => category.id === preferred)
  ) {
    return preferred;
  }
  return categoryOptions.value[0]?.id ?? '';
}

function syncQuickCreateCategory() {
  if (quickCreateType.value === 'category') return;
  const selected = quickCreateCategoryId.value;
  if (
    selected &&
    categoryOptions.value.some((category) => category.id === selected)
  ) {
    return;
  }
  quickCreateCategoryId.value = defaultQuickCreateCategoryId();
}

function defaultIconKeyForQuickCreateType(type: QuickCreateType): string {
  if (type === 'voice') return 'volumeUp';
  if (type === 'forum') return 'messageAlt';
  return 'message';
}

function nextAnimationFrame() {
  return new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}

function findTopLevelChannelMeta(channelId: string) {
  for (const cat of props.effectiveCategories) {
    const ch = cat.channels.find((c) => c.id === channelId);
    if (ch) return ch;
  }
  return null;
}

watch(
  () => props.activeChannelId,
  async (id, prev) => {
    if (!id || id === prev) return;
    const ch = findTopLevelChannelMeta(id);
    if (!ch || ch.type !== 'voice') return;
    await nextTick();
    await nextAnimationFrame();
    const scroller = channelListRef.value;
    if (!scroller) return;
    const sel = `[data-channel-row-anchor="${CSS.escape(id)}"]`;
    const el = scroller.querySelector(sel);
    if (el instanceof HTMLElement) {
      el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  },
);

async function scrollQuickCreateIntoView() {
  await nextTick();
  await nextAnimationFrame();

  const scroller = channelListRef.value;
  const target = quickCreateStackRef.value;
  if (!scroller || !target) return;

  const padding = 12;
  const scrollerRect = scroller.getBoundingClientRect();
  const targetRect = target.getBoundingClientRect();

  const bottomDelta = targetRect.bottom - scrollerRect.bottom + padding;
  if (bottomDelta > 1) {
    scroller.scrollTo({
      top: scroller.scrollTop + bottomDelta,
      behavior: 'smooth',
    });
    return;
  }

  const topDelta = targetRect.top - scrollerRect.top - padding;
  if (topDelta < -1) {
    scroller.scrollTo({
      top: scroller.scrollTop + topDelta,
      behavior: 'smooth',
    });
  }
}

async function expandQuickCreate() {
  quickCreateStage.value = 'pick-type';
  quickCreateType.value = quickCreateCanUseChannels.value ? 'text' : 'category';
  quickCreateIconKey.value = defaultIconKeyForQuickCreateType(
    quickCreateType.value,
  );
  quickCreateExpanded.value = true;
  await scrollQuickCreateIntoView();
}

function collapseQuickCreate() {
  quickCreateExpanded.value = false;
  quickCreateStage.value = 'pick-type';
  quickCreateType.value = quickCreateCanUseChannels.value ? 'text' : 'category';
  quickCreateName.value = '';
  quickCreateCategoryId.value = defaultQuickCreateCategoryId();
  quickCreateIconKey.value = defaultIconKeyForQuickCreateType(
    quickCreateType.value,
  );
}

async function selectQuickCreateType(type: QuickCreateType) {
  if (
    (type === 'text' || type === 'voice' || type === 'forum') &&
    !quickCreateCanUseChannels.value
  ) {
    return;
  }
  quickCreateType.value = type;
  if (type !== 'category') {
    syncQuickCreateCategory();
  }
  quickCreateIconKey.value = defaultIconKeyForQuickCreateType(type);
  quickCreateStage.value = 'details';
  await nextTick();
  quickCreateInputRef.value?.focus();
  await scrollQuickCreateIntoView();
}

/** From the name step: return to channel type choices (keep quick-create open). */
async function backToQuickCreateTypePick() {
  quickCreateStage.value = 'pick-type';
  quickCreateName.value = '';
  quickCreateType.value = quickCreateCanUseChannels.value ? 'text' : 'category';
  quickCreateIconKey.value = defaultIconKeyForQuickCreateType(
    quickCreateType.value,
  );
  syncQuickCreateCategory();
  await scrollQuickCreateIntoView();
}

function submitQuickCreate() {
  if (!quickCreateCanSubmit.value) return;
  const name = quickCreateTrimmedName.value;
  if (quickCreateType.value === 'category') {
    emit('quick-create-submit', { kind: 'category', name });
    collapseQuickCreate();
    return;
  }
  emit('quick-create-submit', {
    kind: 'channel',
    name: clampEchoChannelName(name),
    type: quickCreateType.value,
    categoryId: quickCreateCategoryId.value,
    iconKey: quickCreateIconKey.value,
  });
  collapseQuickCreate();
}

watch(
  () => props.selectedServerId,
  () => {
    syncCollapsedCategoriesForServer(props.selectedServerId);
    collapseQuickCreate();
  },
  { immediate: true },
);

/** Fresh default (all categories expanded) whenever the active channel changes. */
watch(
  () => props.activeChannelId,
  (next, prev) => {
    if (next === prev) return;
    collapsedCategoryIds.value = new Set();
    const sid = props.selectedServerId;
    if (sid) {
      const map = readCollapsedCategoryIdsByServer();
      delete map[sid];
      writeCollapsedCategoryIdsByServer(map);
    }
  },
);

watch(
  () => props.effectiveCategories,
  () => {
    syncCollapsedCategoriesForServer(props.selectedServerId);
  },
  { deep: true },
);

watch(
  categoryOptions,
  () => {
    if (
      !quickCreateCanUseChannels.value &&
      quickCreateType.value !== 'category'
    ) {
      quickCreateType.value = 'category';
    }
    syncQuickCreateCategory();
  },
  { immediate: true },
);

watch(quickCreateExpanded, async (expanded) => {
  if (!expanded || quickCreateStage.value !== 'details') return;
  await nextTick();
  quickCreateInputRef.value?.focus();
});

watch(
  [
    () => props.selectedServerId,
    () => props.effectiveCategories,
    topLevelChannelCount,
    visibleForumPostCount,
    () => props.activeChannelId,
  ],
  () => {
    void nextTick(() => {
      const listEl = channelListRef.value;
      layoutHyperLog('ChannelPanelList:render', {
        selectedServerId: props.selectedServerId,
        effectiveCategoriesLen: props.effectiveCategories.length,
        topLevelChannelCount: topLevelChannelCount.value,
        visibleForumPostCount: visibleForumPostCount.value,
        activeChannelId: props.activeChannelId,
        domChildCount: listEl?.children.length ?? null,
        clientH: listEl?.clientHeight ?? null,
        scrollH: listEl?.scrollHeight ?? null,
      });
    });
  },
  { immediate: true, deep: true },
);
</script>

<template>
  <!-- Flex column child of ChannelPanel: must grow/shrink so the channel list scrolls
       and Voice Connected stays pinned to the bottom (flex-grow on an inner div alone
       does nothing when the parent block is not a flex container). -->
  <div class="flex min-h-0 min-w-0 flex-1 flex-col">
    <!-- Bubble/Narrow Mode: Icon-only view -->
    <div
      v-if="bubbleMode"
      ref="channelListRef"
      class="channel-list-bubble min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-y-contain py-2 px-2 custom-scrollbar touch-pan-y"
      v-scrollbar-on-scroll
    >
      <div
        v-for="category in effectiveCategories"
        :key="`bubble-${category.id}`"
        class="mb-3"
      >
        <!-- Category separator (dot) -->
        <div class="flex items-center justify-center py-1">
          <div class="h-1 w-1 rounded-full bg-fg-subtle/50"></div>
        </div>
        <!-- Channel bubbles -->
        <div class="flex flex-col items-center gap-1">
          <button
            v-for="channel in topLevelChannelsForCategory(category.channels)"
            :key="`bubble-ch-${channel.id}`"
            type="button"
            class="channel-bubble group relative flex h-10 w-10 items-center justify-center rounded-xl transition-all"
            :data-channel-row-anchor="channel.id"
            :class="[
              channel.id === activeChannelId
                ? 'bg-indigo-500/20 text-indigo-300 ring-1 ring-indigo-400/50'
                : 'hover:bg-glass-2 text-fg-soft hover:text-fg',
              channel.type === 'voice' && 'rounded-full',
            ]"
            :title="getChannelDisplayName(channel.name)"
            @click="emit('channel-click', channel)"
          >
            <img
              v-if="
                getChannelIconUrlOrFallback(channel) &&
                !getChannelEmojiOrNull(channel)
              "
              :src="getChannelIconUrlOrFallback(channel)"
              alt=""
              class="h-5 w-5 object-contain"
              :class="[
                channelIconUsesInvert(channel) ? 'filter invert' : '',
                { 'opacity-60': channel.id !== activeChannelId },
              ]"
            />
            <span
              v-else-if="getChannelEmojiOrNull(channel)"
              class="text-lg leading-none"
            >
              {{ getChannelEmojiOrNull(channel) }}
            </span>
            <!-- Unread indicator dot (top-left so it does not sit under the glyph) -->
            <div
              v-if="channelRowMissedActivity(channel.id)"
              class="pointer-events-none absolute -left-0.5 -top-0.5 z-[2] h-2.5 w-2.5 rounded-full border border-[var(--bg)] bg-indigo-500 shadow-sm"
            />
            <!-- Active voice indicator -->
            <div
              v-if="
                channel.type === 'voice' &&
                (channel.voiceParticipantIds?.length ||
                  discordMirrorMembers(channel.id).length)
              "
              class="pointer-events-none absolute -right-0.5 -top-0.5 z-[2] h-2.5 w-2.5 rounded-full border border-[var(--bg)] bg-emerald-500 shadow-sm"
            />
          </button>
        </div>
      </div>
    </div>
    <!-- Normal Mode: Full channel list -->
    <div
      v-else
      ref="channelListRef"
      role="tree"
      aria-label="Channels"
      class="channel-list min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-y-contain py-3 px-3 custom-scrollbar touch-pan-y"
      v-scrollbar-on-scroll
      @dragover.capture="onChannelListDragOverCapture"
    >
      <div v-if="effectiveCategories.length === 0" class="px-3 py-6">
        <template v-if="canCreateChannels">
          <div class="text-sm text-fg-soft">No channels yet</div>
          <p class="mt-2 max-w-[16rem] text-sm leading-snug text-fg-subtle">
            Use the quick create tray below to start with a category, then keep
            adding channels without leaving the panel.
          </p>
        </template>
        <template v-else>
          <div class="text-sm font-medium text-fg-soft">
            No channels to show
          </div>
          <p class="mt-2 max-w-[18rem] text-sm leading-snug text-fg-soft">
            Nothing in this server is visible with your current roles, or the
            server has no channels yet. If you expected to see channels here,
            ask a server admin to check your role and channel permissions.
          </p>
        </template>
      </div>
      <div
        v-for="category in effectiveCategories"
        :key="category.id"
        role="treeitem"
        :aria-expanded="!isCategoryCollapsed(category.id)"
        :aria-label="getChannelDisplayName(category.name)"
        class="mb-5"
      >
        <div v-if="category.hideCategoryHeader" class="mb-2 px-2">
          <div
            class="text-[10px] font-medium uppercase tracking-wide text-fg-subtle"
          >
            {{ getChannelDisplayName(category.name) }}
          </div>
        </div>
        <template v-else>
          <div
            v-if="categoryReorderEnabled && reorderDragCategoryId"
            class="category-reorder-slot relative min-h-[8px] -mt-0.5"
            :class="{
              'category-reorder-slot--show-line': showCategoryDropLineBefore(
                realCategoryIndex(category)!,
              ),
            }"
            @dragover.prevent="
              onCategoryGapDragOver(realCategoryIndex(category)!, $event)
            "
            @drop.prevent="
              onCategoryDropAtLine(realCategoryIndex(category)!, $event)
            "
          />
          <div
            class="group mb-2 flex items-center justify-between gap-2 px-2 text-[12px] font-bold uppercase tracking-wider text-fg-soft"
            :class="{
              'category-header--drag-source':
                reorderDragCategoryId === category.id,
            }"
            @contextmenu.stop.prevent="
              emit('category-contextmenu', category.id, category.name, $event)
            "
            @dragover.prevent="onCategoryHeaderDragOver(category, $event)"
            @drop.prevent="onCategoryHeaderDrop(category, $event)"
          >
            <button
              type="button"
              class="channel-category-toggle inline-flex min-w-0 flex-1 items-center gap-1.5 text-left"
              :aria-label="
                isCategoryCollapsed(category.id)
                  ? `Expand ${getChannelDisplayName(category.name)}`
                  : `Collapse ${getChannelDisplayName(category.name)}`
              "
              :aria-expanded="!isCategoryCollapsed(category.id)"
              @click.stop="onCategoryToggleClick(category.id, $event)"
            >
              <span
                class="channel-category-caret -ml-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-sm"
                :class="{
                  'channel-category-caret--collapsed': isCategoryCollapsed(
                    category.id,
                  ),
                  'channel-category-caret--draggable': categoryReorderEnabled,
                }"
                :draggable="categoryReorderEnabled"
                :title="
                  categoryReorderEnabled
                    ? 'Drag to reorder · Click to expand or collapse'
                    : undefined
                "
                aria-hidden="true"
                @dragstart="onCategoryReorderDragStart(category.id, $event)"
                @dragend="onCategoryReorderDragEnd"
                >▾</span
              >
              <span class="inline min-w-0 flex-1 truncate">{{
                getChannelDisplayName(category.name)
              }}</span>
            </button>
            <div
              v-if="canCreateChannels && selectedServerId !== 'echo'"
              class="flex shrink-0 items-center gap-0.5"
              draggable="false"
            >
              <button
                type="button"
                draggable="false"
                class="channel-category-gear chat-focus-ring flex h-5 w-5 items-center justify-center rounded text-fg-subtle opacity-0 transition-all pointer-fine:hover:bg-glass-hover pointer-fine:hover:text-fg group-hover:opacity-100 pointer-coarse:opacity-100"
                title="Category settings"
                aria-label="Category settings"
                @click.stop="openCategorySettings(category.id, $event)"
              >
                <img
                  :src="icons.settings"
                  alt=""
                  draggable="false"
                  class="h-3 w-3 opacity-80 filter invert"
                />
              </button>
              <button
                type="button"
                draggable="false"
                class="channel-category-add flex h-5 w-5 items-center justify-center rounded text-fg-subtle transition-colors hover:bg-glass-hover hover:text-fg"
                title="Create channel"
                aria-label="Create channel in this category"
                @click.stop="emit('open-create-channel', category.id)"
              >
                <span class="text-[14px] font-semibold leading-none">+</span>
              </button>
            </div>
          </div>
        </template>
        <div
          v-if="!isCategoryCollapsed(category.id)"
          role="group"
          class="flex flex-col gap-1"
          :class="{
            'channel-list-bucket--channel-dnd': reorderDragChannelId !== null,
          }"
        >
          <template
            v-for="(channel, channelIndex) in topLevelChannelsForCategory(
              category.channels,
            )"
            :key="channel.id"
          >
            <div
              class="channel-row-slot relative"
              :class="{
                'channel-row-slot--drop-before': showDropLineBefore(
                  category,
                  channelIndex,
                ),
              }"
            >
              <div
                role="treeitem"
                :aria-selected="activeChannelId === channel.id"
                :aria-label="getChannelDisplayName(channel.name)"
                class="group channel-row flex flex-col rounded-lg cursor-pointer"
                :data-channel-row-anchor="channel.id"
                :class="{
                  'bg-glass-2':
                    activeChannelId === channel.id && channel.type !== 'voice',
                  'ring-1 ring-sky-500/35':
                    channel.type === 'voice' &&
                    voiceLobbyChannelId &&
                    voiceLobbyChannelId === channel.id,
                  'cursor-not-allowed opacity-50 hover:opacity-55':
                    channel.type === 'voice' &&
                    canJoinVoice &&
                    !canJoinVoice(channel.id),
                  'channel-row--drag-source':
                    reorderDragChannelId === channel.id,
                  'select-none': reorderEnabled,
                  'cursor-grab active:cursor-grabbing':
                    reorderEnabled &&
                    !(
                      channel.type === 'voice' &&
                      canJoinVoice &&
                      !canJoinVoice(channel.id)
                    ),
                }"
                :draggable="reorderEnabled"
                :title="
                  channel.type === 'voice' &&
                  canJoinVoice &&
                  !canJoinVoice(channel.id)
                    ? 'You do not have permission to join this voice channel'
                    : reorderEnabled
                      ? 'Drag to reorder'
                      : undefined
                "
                @dragstart="onReorderDragStart(channel.id, $event)"
                @dragend="onReorderDragEnd"
                @click="onChannelRowActivate(channel)"
                @contextmenu.stop.prevent="
                  emit(
                    'channel-contextmenu',
                    channel,
                    categoryIdForApi(category),
                    category.name,
                    $event,
                  )
                "
                @mouseenter="emit('set-hovered-channel', channel.id)"
                @mouseleave="emit('set-hovered-channel', null)"
                @dragover.prevent="
                  onChannelRowDragOver(category, channelIndex, $event)
                "
                @drop.prevent="
                  onReorderDropOnRow(category, channelIndex, $event)
                "
              >
                <div
                  class="channel-row-drop-target relative flex items-center gap-2 min-w-0 rounded-md transition-colors"
                  :class="[
                    channel.type === 'voice'
                      ? currentVoiceChannelId === channel.id
                        ? 'hover:bg-glass-1 px-1.5 py-1'
                        : 'hover:bg-glass-1 px-1.5 py-1'
                      : '',
                    {
                      'channel-row--has-unread': channelRowMissedActivity(
                        channel.id,
                      ),
                    },
                    rowCanManageChannel(channel) &&
                    selectedServerId !== 'echo' &&
                    channel.type !== 'voice'
                      ? 'pr-9'
                      : '',
                  ]"
                >
                  <div class="flex min-w-0 flex-1 items-center gap-2">
                    <img
                      v-if="!getChannelEmojiOrNull(channel)"
                      :src="getChannelIconUrlOrFallback(channel)"
                      alt=""
                      draggable="false"
                      class="channel-row-icon h-4 w-4 flex-shrink-0 object-contain"
                      :class="{
                        'filter invert': channelIconUsesInvert(channel),
                        '!opacity-100': activeChannelId === channel.id,
                        'opacity-70':
                          activeChannelId !== channel.id &&
                          channelRowMissedActivity(channel.id),
                        'opacity-40':
                          activeChannelId !== channel.id &&
                          !channelRowMissedActivity(channel.id),
                        'group-hover:!opacity-100 pointer-coarse:!opacity-100':
                          activeChannelId !== channel.id,
                        'channel-icon-in-vc':
                          currentVoiceChannelId === channel.id &&
                          channel.type === 'voice',
                      }"
                    />
                    <span
                      v-else
                      draggable="false"
                      class="channel-row-icon h-4 w-4 flex-shrink-0 flex items-center justify-center text-[14px] leading-none"
                      :class="{
                        '!opacity-100': activeChannelId === channel.id,
                        'opacity-70':
                          activeChannelId !== channel.id &&
                          channelRowMissedActivity(channel.id),
                        'opacity-40':
                          activeChannelId !== channel.id &&
                          !channelRowMissedActivity(channel.id),
                        'group-hover:!opacity-100 pointer-coarse:!opacity-100':
                          activeChannelId !== channel.id,
                        'channel-icon-in-vc':
                          currentVoiceChannelId === channel.id &&
                          channel.type === 'voice',
                      }"
                      aria-hidden="true"
                      >{{ getChannelEmojiOrNull(channel) }}</span
                    >
                    <span
                      draggable="false"
                      :class="[
                        'channel-row-name truncate min-w-0 flex-1 text-[14px] block',
                        currentVoiceChannelId === channel.id &&
                        channel.type === 'voice'
                          ? 'font-semibold text-emerald-400 group-hover:text-emerald-300'
                          : activeChannelId === channel.id
                            ? 'font-semibold text-foreground'
                            : channelRowMissedActivity(channel.id)
                              ? 'font-bold text-foreground group-hover:text-foreground'
                              : 'font-medium text-fg-subtle group-hover:text-fg-soft',
                      ]"
                      >{{ getChannelDisplayName(channel.name) }}</span
                    >
                  </div>
                  <button
                    v-if="
                      rowCanManageChannel(channel) &&
                      selectedServerId !== 'echo' &&
                      channel.type !== 'voice'
                    "
                    type="button"
                    class="channel-row-gear chat-focus-ring absolute right-1 top-1/2 z-[3] flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-fg-subtle opacity-0 pointer-events-none transition-opacity pointer-fine:hover:bg-glass-hover pointer-fine:hover:text-foreground group-hover:pointer-events-auto group-hover:opacity-100 pointer-coarse:pointer-events-auto pointer-coarse:opacity-100 focus-visible:pointer-events-auto focus-visible:opacity-100"
                    title="Channel settings"
                    aria-label="Channel settings"
                    @click.stop="
                      openChannelSettings(
                        {
                          channel,
                          categoryId: categoryIdForApi(category),
                        },
                        $event,
                      )
                    "
                  >
                    <img
                      :src="icons.settings"
                      alt=""
                      class="h-3.5 w-3.5 opacity-80 filter invert"
                    />
                  </button>
                  <div
                    v-if="channel.type === 'voice'"
                    class="ml-auto flex-shrink-0 flex items-center gap-0.5"
                    @click.stop
                  >
                    <button
                      v-if="
                        rowCanManageChannel(channel) &&
                        selectedServerId !== 'echo'
                      "
                      type="button"
                      class="vc-row-btn chat-focus-ring opacity-0 transition-opacity group-hover:opacity-100 pointer-coarse:opacity-100"
                      title="Channel settings"
                      aria-label="Channel settings"
                      @click="
                        openChannelSettings(
                          {
                            channel,
                            categoryId: categoryIdForApi(category),
                          },
                          $event,
                        )
                      "
                    >
                      <img :src="icons.settings" alt="" class="vc-row-icon" />
                    </button>
                    <ChannelPanelVoiceOccupancyIndicator
                      :channel="channel"
                      :current-voice-channel-id="currentVoiceChannelId"
                      :hovered-channel-id="hoveredChannelId"
                    />
                    <span
                      v-if="
                        discordMirrorMembers(channel.id).length &&
                        !channel.voiceParticipantIds?.length &&
                        (currentVoiceChannelId !== channel.id ||
                          hoveredChannelId !== channel.id)
                      "
                      class="text-[11px] text-indigo-300 tabular-nums"
                      title="Discord voice (mirror)"
                    >
                      {{ discordMirrorMembers(channel.id).length }}
                    </span>
                    <template v-if="hoveredChannelId === channel.id">
                      <button
                        v-if="canInvite && selectedServerId !== 'echo'"
                        type="button"
                        class="vc-row-btn"
                        title="Invite people"
                        aria-label="Invite people"
                        @click="
                          emit('invite', {
                            voiceChannelId: channel.id,
                            voiceChannelName: getChannelDisplayName(
                              channel.name,
                            ),
                          })
                        "
                      >
                        <img
                          :src="icons.usersAvatar"
                          alt=""
                          class="vc-row-icon"
                        />
                      </button>
                      <button
                        v-if="
                          !isCompactShell &&
                          currentVoiceChannelId === channel.id
                        "
                        type="button"
                        class="vc-row-btn"
                        :title="sideChatCollapsed ? 'Show chat' : 'Hide chat'"
                        :aria-label="
                          sideChatCollapsed ? 'Show chat' : 'Hide chat'
                        "
                        @click="emit('toggle-side-chat')"
                      >
                        <img
                          :src="
                            sideChatCollapsed
                              ? icons.message
                              : icons.messageFilled
                          "
                          alt=""
                          class="vc-row-icon"
                          :class="{ 'opacity-90': !sideChatCollapsed }"
                        />
                      </button>
                    </template>
                  </div>
                </div>
                <div
                  v-if="
                    channel.type === 'voice' &&
                    channel.voiceParticipantIds?.length
                  "
                  class="vc-participants mt-2.5 pl-6 flex flex-col gap-1.5"
                >
                  <ChannelPanelVoiceParticipant
                    v-for="userId in channel.voiceParticipantIds"
                    :key="userId"
                    :user-id="userId"
                    :name="voiceParticipantName(channel.id, userId)"
                    :pfp="getUserById(userId)?.pfp"
                    :is-server-owner="
                      !!serverOwnerId?.trim() && userId === serverOwnerId.trim()
                    "
                    :vc="participantVoiceUi(channel.id, userId)"
                    :activity-presence="getVcActivityPresence?.(userId) ?? []"
                    :is-vc-activity-king="
                      !!vcActivityKingUserId?.trim() &&
                      currentVoiceChannelId === channel.id &&
                      userId === vcActivityKingUserId.trim()
                    "
                    :is-active="openProfileUserId === userId"
                    @click="emit('vc-participant-click', userId, $event)"
                    @contextmenu="
                      emit(
                        'vc-participant-contextmenu',
                        userId,
                        channel,
                        categoryIdForApi(category),
                        category.name,
                        $event,
                      )
                    "
                  />
                </div>
                <div
                  v-if="
                    channel.type === 'voice' &&
                    discordMirrorMembers(channel.id).length &&
                    !channel.voiceParticipantIds?.length
                  "
                  class="vc-participants mt-2.5 pl-6 flex flex-col gap-1"
                >
                  <div
                    class="text-[10px] font-semibold uppercase tracking-wide text-indigo-300/90"
                  >
                    Discord voice
                  </div>
                  <ChannelPanelDiscordMirrorParticipant
                    v-for="m in discordMirrorMembers(channel.id)"
                    :key="m.discordUserId"
                    :discord-user-id="m.discordUserId"
                    :username="m.username"
                    :global-name="m.globalName"
                    :avatar="m.avatar"
                  />
                </div>
              </div>
            </div>

            <template
              v-if="
                channel.type === 'forum' &&
                visibleForumSubchannelsForParent(
                  category.channels,
                  channel.id,
                  activeForumContextId,
                ).length > 0
              "
            >
              <div class="mt-1 flex flex-col gap-1">
                <div
                  v-for="sub in visibleForumSubchannelsForParent(
                    category.channels,
                    channel.id,
                    activeForumContextId,
                  )"
                  :key="sub.id"
                  class="group channel-row forum-post-sidebar-row flex flex-col rounded-lg cursor-pointer ml-4 border-l border-indigo-400/25"
                  :class="{
                    'bg-glass-2':
                      activeChannelId === sub.id && sub.type !== 'voice',
                  }"
                  title="Forum post"
                  @click="emit('channel-click', sub)"
                  @contextmenu.stop.prevent="
                    emit(
                      'channel-contextmenu',
                      sub,
                      categoryIdForApi(category),
                      category.name,
                      $event,
                    )
                  "
                  @mouseenter="emit('set-hovered-channel', sub.id)"
                  @mouseleave="emit('set-hovered-channel', null)"
                >
                  <div
                    class="channel-row-drop-target flex items-center gap-2 min-w-0 rounded-md transition-colors px-1.5 py-1 hover:bg-glass-1"
                    :class="{
                      'channel-row--has-unread': channelRowMissedActivity(
                        sub.id,
                      ),
                    }"
                  >
                    <img
                      v-if="!getChannelEmojiOrNull(sub)"
                      :src="forumPostSubRowIconUrl()"
                      alt=""
                      class="channel-row-icon h-3.5 w-3.5 flex-shrink-0 filter invert"
                      :class="{
                        '!opacity-100': activeChannelId === sub.id,
                        'opacity-65':
                          activeChannelId !== sub.id &&
                          channelRowMissedActivity(sub.id),
                        'opacity-35':
                          activeChannelId !== sub.id &&
                          !channelRowMissedActivity(sub.id),
                        'group-hover:!opacity-100 pointer-coarse:!opacity-100':
                          activeChannelId !== sub.id,
                      }"
                    />
                    <span
                      v-else
                      class="channel-row-icon h-3.5 w-3.5 flex-shrink-0 flex items-center justify-center text-[13px] leading-none"
                      :class="{
                        '!opacity-100': activeChannelId === sub.id,
                        'opacity-65':
                          activeChannelId !== sub.id &&
                          channelRowMissedActivity(sub.id),
                        'opacity-35':
                          activeChannelId !== sub.id &&
                          !channelRowMissedActivity(sub.id),
                        'group-hover:!opacity-100 pointer-coarse:!opacity-100':
                          activeChannelId !== sub.id,
                      }"
                      aria-hidden="true"
                      >{{ getChannelEmojiOrNull(sub) }}</span
                    >
                    <span
                      :class="[
                        'channel-row-name truncate min-w-0 flex-1 text-[13px] block',
                        activeChannelId === sub.id
                          ? 'font-semibold text-foreground'
                          : channelRowMissedActivity(sub.id)
                            ? 'font-bold text-foreground group-hover:text-foreground'
                            : 'font-medium text-fg-subtle group-hover:text-fg-soft',
                      ]"
                      >{{ getChannelDisplayName(sub.name) }}</span
                    >
                    <span
                      v-if="isForumPostPinned(sub)"
                      class="ml-auto text-[10px] font-semibold text-amber-300/90"
                      title="Pinned"
                      aria-label="Pinned"
                      >PIN</span
                    >
                  </div>
                </div>
              </div>
            </template>
          </template>
          <div
            v-if="reorderEnabled"
            class="channel-reorder-append-target relative min-h-[10px] -my-0.5 rounded"
            :class="{
              'channel-reorder-append-target--show-line':
                showDropLineEnd(category),
            }"
            @dragover.prevent="onAppendZoneDragOver(category, $event)"
            @drop.prevent="onReorderDrop(category, null, $event)"
          />
        </div>
      </div>
      <div
        v-if="
          categoryReorderEnabled &&
          reorderDragCategoryId &&
          realCategoryCount > 0
        "
        class="category-reorder-append-target relative min-h-[10px] -my-0.5 rounded"
        :class="{
          'category-reorder-append-target--show-line':
            showCategoryDropLineBefore(realCategoryCount),
        }"
        @dragover.prevent="onCategoryAppendDragOver($event)"
        @drop.prevent="onCategoryDropAtLine(realCategoryCount, $event)"
      />

      <!-- Quick Create (only in normal mode) -->
      <div
        v-if="!bubbleMode && canCreateChannels && selectedServerId !== 'echo'"
        class="channel-quick-create mt-1 px-1"
      >
        <!-- One of trigger vs panel at a time: avoids overlap while the panel
             leaves (previously the collapsed "+ Create" could stack under the
             toolbar "Create" row). -->
        <transition name="channel-quick-create-slide" mode="out-in">
          <button
            v-if="!quickCreateExpanded"
            key="channel-quick-create-trigger"
            type="button"
            class="channel-quick-create__trigger group flex w-full min-w-0 flex-col rounded-lg text-left outline-none"
            aria-label="Create channel or category"
            @click="expandQuickCreate"
          >
            <div
              class="channel-quick-create__trigger-inner flex min-w-0 flex-1 items-center gap-2 rounded-md transition-colors group-hover:bg-glass-1 pointer-coarse:group-hover:bg-glass-1"
            >
              <span
                class="flex h-4 w-4 shrink-0 items-center justify-center text-[14px] font-semibold leading-none text-fg-subtle/80 group-hover:text-fg-soft"
                aria-hidden="true"
                >+</span
              >
              <span
                class="channel-quick-create__trigger-label truncate min-w-0 flex-1 text-[14px] font-medium leading-none text-fg-subtle/85 group-hover:text-fg-soft"
                >Create…</span
              >
            </div>
          </button>
          <div
            v-else
            key="channel-quick-create-panel"
            class="channel-quick-create__panel"
          >
            <div ref="quickCreateStackRef" class="channel-quick-create__stack">
              <template v-if="quickCreateStage === 'pick-type'">
                <div
                  class="channel-quick-create__widget channel-quick-create__widget--toolbar"
                >
                  <div class="channel-quick-create__toolbar-row">
                    <button
                      type="button"
                      class="channel-quick-create__widget-back"
                      aria-label="Close"
                      @click="collapseQuickCreate"
                    >
                      <img
                        :src="icons.arrowLeft"
                        alt=""
                        class="channel-quick-create__widget-back-icon"
                      />
                    </button>
                    <div class="channel-quick-create__toolbar-title">
                      Create
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  class="channel-quick-create__widget channel-quick-create__widget--choice"
                  :class="{
                    'channel-quick-create__widget--disabled':
                      !quickCreateCanUseChannels,
                  }"
                  :disabled="!quickCreateCanUseChannels"
                  @click="selectQuickCreateType('text')"
                >
                  <div class="channel-quick-create__widget-left">
                    <img
                      :src="icons.message"
                      alt=""
                      class="channel-quick-create__widget-icon"
                    />
                    <div class="channel-quick-create__widget-copy">
                      <div class="channel-quick-create__widget-title">
                        Text channel
                      </div>
                      <div class="channel-quick-create__widget-subtitle">
                        Create a chat channel
                      </div>
                    </div>
                  </div>
                </button>

                <button
                  type="button"
                  class="channel-quick-create__widget channel-quick-create__widget--choice"
                  :class="{
                    'channel-quick-create__widget--disabled':
                      !quickCreateCanUseChannels,
                  }"
                  :disabled="!quickCreateCanUseChannels"
                  @click="selectQuickCreateType('voice')"
                >
                  <div class="channel-quick-create__widget-left">
                    <img
                      :src="icons.volumeUp"
                      alt=""
                      class="channel-quick-create__widget-icon"
                    />
                    <div class="channel-quick-create__widget-copy">
                      <div class="channel-quick-create__widget-title">
                        Voice channel
                      </div>
                      <div class="channel-quick-create__widget-subtitle">
                        Create a voice room
                      </div>
                    </div>
                  </div>
                </button>

                <button
                  type="button"
                  class="channel-quick-create__widget channel-quick-create__widget--choice"
                  :class="{
                    'channel-quick-create__widget--disabled':
                      !quickCreateCanUseChannels,
                  }"
                  :disabled="!quickCreateCanUseChannels"
                  @click="selectQuickCreateType('forum')"
                >
                  <div class="channel-quick-create__widget-left">
                    <img
                      :src="icons.messageAlt"
                      alt=""
                      class="channel-quick-create__widget-icon"
                    />
                    <div class="channel-quick-create__widget-copy">
                      <div class="channel-quick-create__widget-title">
                        Forum
                      </div>
                      <div class="channel-quick-create__widget-subtitle">
                        Create a forum channel
                      </div>
                    </div>
                  </div>
                </button>

                <button
                  type="button"
                  class="channel-quick-create__widget channel-quick-create__widget--choice"
                  @click="selectQuickCreateType('category')"
                >
                  <div class="channel-quick-create__widget-left">
                    <img
                      :src="icons.list"
                      alt=""
                      class="channel-quick-create__widget-icon"
                    />
                    <div class="channel-quick-create__widget-copy">
                      <div class="channel-quick-create__widget-title">
                        Category
                      </div>
                      <div class="channel-quick-create__widget-subtitle">
                        Create a new section
                      </div>
                    </div>
                  </div>
                </button>

                <div
                  v-if="!quickCreateCanUseChannels"
                  class="channel-quick-create__widget channel-quick-create__widget--note"
                >
                  Create a category first, then add channels into it.
                </div>
              </template>

              <template v-else>
                <div
                  class="channel-quick-create__widget channel-quick-create__widget--form"
                >
                  <div class="channel-quick-create__widget-header">
                    <button
                      type="button"
                      class="channel-quick-create__widget-back"
                      aria-label="Back to channel types"
                      @click="backToQuickCreateTypePick"
                    >
                      <img
                        :src="icons.arrowLeft"
                        alt=""
                        class="channel-quick-create__widget-back-icon"
                      />
                    </button>
                    <div
                      class="channel-quick-create__widget-title channel-quick-create__widget-title--header-grow"
                    >
                      Create
                      {{
                        quickCreateType === 'category'
                          ? 'category'
                          : quickCreateType === 'voice'
                            ? 'voice channel'
                            : quickCreateType === 'forum'
                              ? 'forum channel'
                              : 'text channel'
                      }}
                    </div>
                    <button
                      type="button"
                      class="channel-quick-create__widget-close"
                      aria-label="Close"
                      @click="collapseQuickCreate"
                    >
                      <span class="channel-quick-create__widget-close-glyph"
                        >x</span
                      >
                    </button>
                  </div>
                  <div class="channel-quick-create__widget-subtitle">
                    Press Enter to create. Esc to cancel.
                  </div>
                  <div class="channel-quick-create__name-row">
                    <ChannelIconPickerPopover
                      v-if="quickCreateType !== 'category'"
                      v-model="quickCreateIconKey"
                      variant="combined"
                      placement="top"
                      :channel-type="
                        quickCreateType === 'voice' ? 'voice' : 'text'
                      "
                      :server-id="selectedServerId ?? undefined"
                    />
                    <input
                      :id="`quick-create-name-${selectedServerId ?? 'server'}`"
                      ref="quickCreateInputRef"
                      v-model="quickCreateName"
                      type="text"
                      autocomplete="off"
                      class="channel-quick-create__input"
                      :placeholder="
                        quickCreateType === 'category'
                          ? 'new-category'
                          : 'new-channel'
                      "
                      :maxlength="
                        quickCreateType === 'category'
                          ? 100
                          : ECHO_CHANNEL_NAME_MAX_LENGTH
                      "
                      @keydown.enter.prevent="submitQuickCreate"
                      @keydown.escape.prevent="collapseQuickCreate"
                    />
                  </div>
                </div>

                <div
                  v-if="quickCreateNeedsCategory"
                  class="channel-quick-create__widget channel-quick-create__widget--field"
                >
                  <EchoDropdown
                    v-model="quickCreateCategoryId"
                    label="Category"
                    class="channel-quick-create__dropdown"
                    :options="quickCreateCategoryDropdownOptions"
                    :disabled="!quickCreateCanUseChannels"
                  />
                </div>

                <div
                  v-if="quickCreateDuplicateCategory"
                  class="channel-quick-create__widget channel-quick-create__widget--note channel-quick-create__widget--warning"
                >
                  A category with this name already exists.
                </div>
              </template>
            </div>
          </div>
        </transition>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '@/features/channel-panel/styles/channelPanelListParticipant.scss';

.channel-quick-create {
  padding-bottom: 0.35rem;
}

.channel-quick-create__panel {
  margin-top: 0.4rem;
}

.channel-quick-create__trigger {
  cursor: pointer;
  border: 0;
  background: transparent;
  /* Match `.channel-row` gutter so this reads as the next row after the last channel */
  padding: var(--echo-density-channel-py, 0.375rem)
    var(--echo-density-channel-px, 0.625rem);
  color: inherit;
  opacity: 0.82;
  transition: opacity 0.14s ease;
}

.channel-quick-create__trigger:hover {
  opacity: 1;
}

.channel-quick-create__trigger:focus-visible {
  opacity: 1;
  outline: 2px solid color-mix(in srgb, var(--accent) 55%, transparent);
  outline-offset: 2px;
}

.channel-quick-create__stack {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.channel-quick-create__widget {
  width: 100%;
  border-radius: 0.9rem;
  padding: 0.75rem 0.85rem;
  background: var(--glass-tint);
  color: var(--text);
}

.channel-quick-create__widget--choice {
  text-align: left;
  transition:
    transform 0.14s ease,
    background-color 0.16s ease;
}

.channel-quick-create__widget--choice:hover:not(:disabled) {
  transform: translateY(-1px);
  background: color-mix(in srgb, var(--glass-tint) 70%, transparent);
}

.channel-quick-create__widget--choice:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--accent) 55%, transparent);
  outline-offset: 2px;
}

.channel-quick-create__widget--disabled,
.channel-quick-create__widget:disabled {
  cursor: not-allowed;
  opacity: 0.5;
  transform: none;
}

.channel-quick-create__widget-left {
  display: flex;
  align-items: center;
  gap: 0.65rem;
}

.channel-quick-create__widget-icon {
  width: 1rem;
  height: 1rem;
  flex-shrink: 0;
  opacity: 0.82;
}

/* Icons are dark assets; invert only on dark chrome (light glass would read as white-on-white). */
[data-theme='dark'] .channel-quick-create__widget-icon {
  filter: invert(1);
}

.channel-quick-create__widget-copy {
  min-width: 0;
}

.channel-quick-create__widget--toolbar {
  padding-top: 0.55rem;
  padding-bottom: 0.55rem;
}

.channel-quick-create__toolbar-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.channel-quick-create__toolbar-title {
  flex: 1;
  min-width: 0;
  font-size: 0.85rem;
  font-weight: 750;
  letter-spacing: 0.01em;
  color: var(--text);
}

.channel-quick-create__widget-back {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 1.8rem;
  height: 1.8rem;
  border-radius: 999px;
  color: var(--muted);
  transition:
    background-color 0.14s ease,
    color 0.14s ease;
}

.channel-quick-create__widget-back:hover {
  background: color-mix(in srgb, var(--glass-tint) 75%, transparent);
  color: var(--text);
}

.channel-quick-create__widget-back:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--accent) 55%, transparent);
  outline-offset: 2px;
}

.channel-quick-create__widget-back-icon {
  width: 1rem;
  height: 1rem;
  opacity: 0.88;
}

[data-theme='dark'] .channel-quick-create__widget-back-icon {
  filter: invert(1);
}

.channel-quick-create__widget-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.channel-quick-create__widget-title {
  font-size: 0.85rem;
  font-weight: 750;
  letter-spacing: 0.01em;
  color: var(--text);
}

.channel-quick-create__widget-title--header-grow {
  flex: 1;
  min-width: 0;
}

.channel-quick-create__widget-subtitle {
  margin-top: 0.2rem;
  font-size: 0.75rem;
  line-height: 1.25;
  color: var(--muted);
}

.channel-quick-create__widget-close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.8rem;
  height: 1.8rem;
  border-radius: 999px;
  color: var(--muted);
  transition:
    background-color 0.14s ease,
    color 0.14s ease;
}

.channel-quick-create__widget-close:hover {
  background: color-mix(in srgb, var(--glass-tint) 75%, transparent);
  color: var(--text);
}

.channel-quick-create__widget-close:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--accent) 55%, transparent);
  outline-offset: 2px;
}

.channel-quick-create__widget-close-glyph {
  font-size: 0.9rem;
  font-weight: 800;
  line-height: 1;
  text-transform: uppercase;
}

.channel-quick-create__widget--note {
  padding: 0.65rem 0.85rem;
  color: var(--muted);
}

.channel-quick-create__widget--warning {
  color: var(--server-ping-broadcast);
}

.channel-quick-create__label {
  font-size: 0.68rem;
  font-weight: 800;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--muted);
}

.channel-quick-create__name-row {
  display: flex;
  align-items: stretch;
  gap: 0.5rem;
  border-radius: 0.9rem;
  margin-top: 0.6rem;
  padding: 0.25rem 0.6rem;
  background: color-mix(in srgb, var(--elevated) 42%, transparent);
}

.channel-quick-create__name-row:focus-within {
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 22%, transparent);
}

.channel-quick-create__input {
  width: 100%;
  min-width: 0;
  border: none;
  background: transparent;
  color: var(--text);
  font-size: 0.9rem;
  outline: none;
  padding: 0.7rem 0.2rem;
}

.channel-quick-create__input::placeholder {
  color: color-mix(in srgb, var(--muted) 75%, transparent);
}

.channel-quick-create__dropdown {
  width: 100%;
}

:deep(.channel-quick-create__dropdown .echo-dropdown-container) {
  gap: 0.35rem;
}

:deep(.channel-quick-create__dropdown .settings-label) {
  font-size: 0.68rem;
  font-weight: 800;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--muted);
}

:deep(.channel-quick-create__dropdown .echo-dropdown-trigger) {
  border-radius: 0.9rem;
  border: none;
  background: color-mix(in srgb, var(--elevated) 42%, transparent);
  box-shadow: none;
  padding: 0.72rem 0.85rem;
}

:deep(.channel-quick-create__dropdown .echo-dropdown-trigger:hover) {
  background: color-mix(in srgb, var(--elevated) 52%, transparent);
  box-shadow: none;
}

:deep(
  .channel-quick-create__dropdown
    .echo-dropdown-trigger.echo-dropdown-trigger--open
) {
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 22%, transparent);
  background: color-mix(in srgb, var(--elevated) 42%, transparent);
}

:deep(.channel-quick-create__dropdown .echo-dropdown-trigger-text) {
  color: var(--text);
  font-size: 0.88rem;
  font-weight: 500;
}

:deep(.channel-quick-create__dropdown .echo-dropdown-trigger:disabled) {
  cursor: not-allowed;
  opacity: 0.65;
}

.channel-quick-create-slide-enter-active,
.channel-quick-create-slide-leave-active {
  transition:
    opacity 0.18s ease,
    transform 0.22s ease;
}

.channel-quick-create-slide-enter-from,
.channel-quick-create-slide-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}

/** Channel reorder DnD — aligned with server-rail (`ServerList.vue`) visuals */
.channel-list-bucket--channel-dnd {
  overflow: visible;
}

.channel-row-slot {
  position: relative;
}

.channel-row {
  padding: var(--echo-density-channel-py, 0.375rem)
    var(--echo-density-channel-px, 0.625rem);
}

.channel-row-slot--drop-before::after {
  content: '';
  position: absolute;
  left: 0.35rem;
  right: 0.35rem;
  top: -6px;
  z-index: 2;
  height: 3px;
  border-radius: 9999px;
  background: var(--vue-auto-012);
  box-shadow: 0 0 10px var(--vue-auto-089);
  pointer-events: none;
}

.channel-reorder-append-target--show-line::after {
  content: '';
  position: absolute;
  left: 0.35rem;
  right: 0.35rem;
  top: 2px;
  z-index: 2;
  height: 3px;
  border-radius: 9999px;
  background: var(--vue-auto-012);
  box-shadow: 0 0 10px var(--vue-auto-089);
  pointer-events: none;
}

.category-reorder-slot {
  position: relative;
}

.category-reorder-slot--show-line::after {
  content: '';
  position: absolute;
  left: 0.35rem;
  right: 0.35rem;
  top: -2px;
  z-index: 2;
  height: 3px;
  border-radius: 9999px;
  background: var(--vue-auto-012);
  box-shadow: 0 0 10px var(--vue-auto-089);
  pointer-events: none;
}

.category-reorder-append-target {
  position: relative;
}

.category-reorder-append-target--show-line::after {
  content: '';
  position: absolute;
  left: 0.35rem;
  right: 0.35rem;
  top: 2px;
  z-index: 2;
  height: 3px;
  border-radius: 9999px;
  background: var(--vue-auto-012);
  box-shadow: 0 0 10px var(--vue-auto-089);
  pointer-events: none;
}

.category-row--drag-source {
  background: transparent !important;
  border: 2px solid var(--vue-auto-012);
  box-shadow:
    0 0 0 1px var(--vue-auto-007),
    0 0 14px var(--vue-auto-089) !important;
}

.category-header--drag-source {
  background: transparent !important;
  border-radius: 0.375rem;
  outline: 2px solid var(--vue-auto-012);
  box-shadow:
    0 0 0 1px var(--vue-auto-007),
    0 0 14px var(--vue-auto-089) !important;
}

/** Guild sidebar: unread strip in a left gutter so it never covers the channel icon. */
.channel-row-drop-target.channel-row--has-unread {
  position: relative;
  padding-left: 0.75rem;
}

.channel-row-drop-target.channel-row--has-unread::before {
  content: '';
  position: absolute;
  left: 0.22rem;
  top: 50%;
  transform: translateY(-50%);
  width: 0.1875rem;
  height: 1.125rem;
  border-radius: 9999px;
  background: color-mix(in srgb, var(--text) 82%, var(--accent) 18%);
  box-shadow: 0 0 12px color-mix(in srgb, var(--vue-auto-089) 55%, transparent);
  pointer-events: none;
}

.forum-post-sidebar-row .channel-row-drop-target.channel-row--has-unread::before {
  left: 0.22rem;
  height: 1rem;
}

.channel-category-toggle {
  border-radius: 0.375rem;
  color: inherit;
}

.channel-category-toggle:hover {
  color: var(--ui-fg);
}

.channel-category-toggle:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--accent) 52%, transparent);
  outline-offset: 1px;
}

.channel-category-caret {
  display: inline-flex;
  width: 0.7rem;
  justify-content: center;
  transition: transform 0.14s ease;
  transform-origin: center;
}

.channel-category-caret--collapsed {
  transform: rotate(-90deg);
}

.channel-category-caret--draggable {
  cursor: grab;
  user-select: none;
}

.channel-category-caret--draggable:active {
  cursor: grabbing;
}

/* Bubble/Narrow Mode Styles */
.channel-list-bubble {
  display: flex;
  flex-direction: column;
}

.channel-bubble {
  position: relative;
  transition: all 0.15s ease;
}

.channel-bubble:hover {
  transform: scale(1.05);
}

.channel-bubble:active {
  transform: scale(0.95);
}
</style>
