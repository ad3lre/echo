<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from 'vue';
import { safeImageUrl } from '@/utils/safeImageUrl';
import { serverGuildIconDisplayUrl } from '@/utils/serverGuildIconDisplayUrl';
import { echoInviteSharePageUrl } from '@/utils/echoInviteShareUrl';
import PausedGifAvatar from '@/components/PausedGifAvatar.vue';
import { useMoreServers } from '@/composables/useMoreServers';
import type { MoreServersMockServer } from '@/composables/useMoreServers';
import { useMoreServerFolders } from '@/composables/useMoreServerFolders';
import type { MoreServerWidgetFolder } from '@/composables/useMoreServerFolders';
import {
  useMoreServerFolderDrag,
  type MoreServerDropTarget,
} from '@/composables/useMoreServerFolderDrag';
import MoreServerFolderModal from '@/components/MoreServerFolderModal.vue';
import MoreServerCompactHoverPreview from '@/components/MoreServerCompactHoverPreview.vue';
import { useMoreServerCompactHoverPreview } from '@/composables/useMoreServerCompactHoverPreview';
import { useServerStore } from '@/stores/server';
import { visibleFolderServerIds } from '@/utils/moreServerFoldersPersistence';

type WidgetFolderContextMenu =
  | { target: 'server'; serverId: string; left: number; top: number }
  | { target: 'folder'; folderId: string; left: number; top: number };

const props = defineProps<{
  open: boolean;
  compact: boolean;
  pinned: boolean;
  /** Echo CREATE_INVITE — hide “Copy invite link” when false for that guild. */
  canOpenInviteForServer?: (serverId: string) => boolean;
}>();

const emit = defineEmits<{
  close: [];
  'set-compact': [value: boolean];
  'toggle-pinned': [];
  'pin-server': [server: { id: string; name: string; imageUrl: string }];
  'unpin-server': [id: string];
  'open-server': [id: string];
  'invite-server': [id: string];
  'leave-server': [id: string];
}>();

const { moreServersList } = useMoreServers();
const serverStore = useServerStore();
const {
  folders,
  validServerIds,
  addFolder,
  removeFolder,
  renameFolder,
  moveServerInFolder,
  moveFolder,
  setServerFolderMembership,
  removeServerFromAllFolders,
  folderForServer,
  isFolderExpandedInCompact,
  setFolderExpandedInCompact,
  toggleFolderExpandedInCompact,
  isFolderCollapsedInCard,
  toggleFolderCollapsedInCard,
} = useMoreServerFolders();

const folderModalOpen = ref(false);
const folderModalMode = ref<'create' | 'edit'>('create');
const folderModalTargetId = ref<string | null>(null);
const pendingServerForNewFolder = ref<string | null>(null);

const folderModalInitialName = computed(() => {
  if (folderModalMode.value !== 'edit' || !folderModalTargetId.value) return '';
  return (
    folders.value.find((f) => f.id === folderModalTargetId.value)?.name ?? ''
  );
});

const folderModalServerCount = computed(() => {
  if (!folderModalTargetId.value) return 0;
  const f = folders.value.find((x) => x.id === folderModalTargetId.value);
  return f?.serverIds.length ?? 0;
});

function handleServerDrop(serverId: string, target: MoreServerDropTarget) {
  if (target.kind === 'ungrouped') {
    moveServerInFolder(serverId, null);
    return;
  }
  if (target.kind === 'folder') {
    moveServerInFolder(serverId, target.folderId, target.index);
  }
}

const {
  draggingServerId,
  draggingFolderId,
  onServerDragStart,
  onFolderDragStart,
  onDragEnd,
  onUngroupedDragOver,
  onFolderDragOver,
  onFolderOrderDragOver,
  onDrop,
  isDropTargetActive,
} = useMoreServerFolderDrag({
  onServerDrop: handleServerDrop,
  onFolderReorder: (folderId, toIndex) => moveFolder(folderId, toIndex),
});

const {
  previewServer: compactPreviewServer,
  previewAnchor: compactPreviewAnchor,
  onCompactServerPointerEnter,
  onCompactServerPointerLeave,
  onCompactServerPointerDown,
  onCompactServerDragStart: dismissCompactPreview,
  dismissPreview: dismissCompactPreviewNow,
} = useMoreServerCompactHoverPreview();

const openMenuId = ref<string | null>(null);
const cardMenuTriggerRef = ref<HTMLElement | null>(null);
const cardMenuPosition = ref<{ left: number; top: number } | null>(null);
const contextMenu = ref<WidgetFolderContextMenu | null>(null);

const CARD_MENU_WIDTH = 200;
const CARD_MENU_EST_HEIGHT = 320;
const CARD_MENU_GAP = 6;

const openMenuServer = computed(() => {
  const id = openMenuId.value;
  if (!id) return null;
  return serverById.value.get(id) ?? null;
});

const cardMenuStyle = computed(() => {
  const p = cardMenuPosition.value;
  if (!p) return {};
  return { left: `${p.left}px`, top: `${p.top}px` };
});

function syncCardMenuPosition() {
  const el = cardMenuTriggerRef.value;
  if (!el || !openMenuId.value) {
    cardMenuPosition.value = null;
    return;
  }
  const r = el.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  let left = r.right - CARD_MENU_WIDTH;
  left = Math.max(8, Math.min(left, vw - CARD_MENU_WIDTH - 8));
  let top = r.top - CARD_MENU_GAP - CARD_MENU_EST_HEIGHT;
  if (top < 8) top = r.bottom + CARD_MENU_GAP;
  top = Math.max(8, Math.min(top, vh - CARD_MENU_EST_HEIGHT - 8));
  cardMenuPosition.value = { left, top };
}

function setCardMenuTriggerRef(serverId: string, el: unknown) {
  if (openMenuId.value !== serverId) return;
  cardMenuTriggerRef.value = (el as HTMLElement | null) ?? null;
}

function onCardMenuScrollOrResize() {
  if (openMenuId.value) syncCardMenuPosition();
}

const contextMenuStyle = computed(() => {
  const m = contextMenu.value;
  if (!m) return {};
  const vw = typeof window !== 'undefined' ? window.innerWidth : 800;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 600;
  const left = Math.max(8, Math.min(m.left, vw - 220));
  const top = Math.max(8, Math.min(m.top, vh - 320));
  return { left: `${left}px`, top: `${top}px` };
});

const mockServers = moreServersList;

const sortedServers = computed(() => {
  const all = mockServers.value;
  const pinned = all.filter((s) => isPinned(s.id));
  const unpinned = all.filter((s) => !isPinned(s.id));
  return [...pinned, ...unpinned];
});

const serverById = computed(
  () => new Map(sortedServers.value.map((s) => [s.id, s] as const)),
);

const idsInAnyFolder = computed(() => {
  const ids = new Set<string>();
  for (const f of folders.value) for (const id of f.serverIds) ids.add(id);
  return ids;
});

const ungroupedServers = computed(() =>
  sortedServers.value.filter((s) => !idsInAnyFolder.value.has(s.id)),
);

const foldersWithServers = computed(() =>
  folders.value.map((folder) => ({
    folder,
    servers: visibleFolderServerIds(folder, validServerIds.value)
      .map((id) => serverById.value.get(id))
      .filter((x): x is MoreServersMockServer => !!x),
  })),
);

type CardStackItem =
  | {
      type: 'folderLabel';
      key: string;
      folder: MoreServerWidgetFolder;
      folderOrderIndex: number;
    }
  | { type: 'ungroupedLabel'; key: string }
  | {
      type: 'server';
      key: string;
      server: MoreServersMockServer;
      topSpacer: boolean;
      folderId?: string;
      serverIndexInFolder?: number;
      ungroupedIndex?: number;
      /** When this row sits under a widget folder header, show a subtle chip. */
      inFolderName?: string;
    };

const cardStack = computed((): CardStackItem[] => {
  const out: CardStackItem[] = [];
  let folderOrderIndex = 0;
  for (const { folder, servers } of foldersWithServers.value) {
    out.push({
      type: 'folderLabel',
      key: `h-${folder.id}`,
      folder,
      folderOrderIndex: folderOrderIndex++,
    });
    if (isFolderCollapsedInCard(folder.id)) continue;
    servers.forEach((server, serverIndexInFolder) => {
      out.push({
        type: 'server',
        key: `f-${folder.id}-${server.id}`,
        server,
        topSpacer: false,
        folderId: folder.id,
        serverIndexInFolder,
        inFolderName: folder.name,
      });
    });
  }
  let ungroupedIndex = 0;
  if (
    ungroupedServers.value.length > 0 &&
    foldersWithServers.value.length > 0
  ) {
    out.push({ type: 'ungroupedLabel', key: 'ungrouped-label' });
  }
  for (const server of ungroupedServers.value) {
    out.push({
      type: 'server',
      key: `u-${server.id}`,
      server,
      topSpacer: false,
      ungroupedIndex: ungroupedIndex++,
    });
  }
  return out;
});

type CompactRow =
  | { kind: 'server'; server: MoreServersMockServer; ungroupedIndex: number }
  | { kind: 'ungroupedLabel' }
  | {
      kind: 'folder';
      folder: MoreServerWidgetFolder;
      servers: MoreServersMockServer[];
      folderOrderIndex: number;
    };

const compactRows = computed((): CompactRow[] => {
  const rows: CompactRow[] = [];
  let folderOrderIndex = 0;
  for (const folder of folders.value) {
    const servers = visibleFolderServerIds(folder, validServerIds.value)
      .map((id) => serverById.value.get(id))
      .filter((x): x is MoreServersMockServer => !!x);
    rows.push({
      kind: 'folder',
      folder,
      servers,
      folderOrderIndex: folderOrderIndex++,
    });
  }
  if (ungroupedServers.value.length > 0 && folders.value.length > 0) {
    rows.push({ kind: 'ungroupedLabel' });
  }
  let ungroupedIndex = 0;
  for (const server of ungroupedServers.value) {
    rows.push({ kind: 'server', server, ungroupedIndex: ungroupedIndex++ });
  }
  return rows;
});

function closeContextMenu() {
  contextMenu.value = null;
}

function openServerContextMenu(server: MoreServersMockServer, e: MouseEvent) {
  e.preventDefault();
  e.stopPropagation();
  openMenuId.value = null;
  contextMenu.value = {
    target: 'server',
    serverId: server.id,
    left: e.clientX,
    top: e.clientY,
  };
}

function openFolderContextMenu(folderId: string, e: MouseEvent) {
  e.preventDefault();
  e.stopPropagation();
  openMenuId.value = null;
  contextMenu.value = {
    target: 'folder',
    folderId,
    left: e.clientX,
    top: e.clientY,
  };
}

function onDocPointerDown(ev: MouseEvent) {
  const t = ev.target;
  if (!(t instanceof Node)) return;
  const ctxEl = document.querySelector('[data-more-servers-folder-menu]');
  if (ctxEl && !ctxEl.contains(t)) closeContextMenu();
  if (!openMenuId.value) return;
  const cardEl = document.querySelector('[data-more-servers-card-menu]');
  const trigger = cardMenuTriggerRef.value;
  if (cardEl && !cardEl.contains(t) && trigger && !trigger.contains(t)) {
    openMenuId.value = null;
    cardMenuPosition.value = null;
  }
}

watch(openMenuId, (id) => {
  if (id) {
    nextTick(() => syncCardMenuPosition());
    window.addEventListener('scroll', onCardMenuScrollOrResize, true);
    window.addEventListener('resize', onCardMenuScrollOrResize);
  } else {
    cardMenuPosition.value = null;
    window.removeEventListener('scroll', onCardMenuScrollOrResize, true);
    window.removeEventListener('resize', onCardMenuScrollOrResize);
  }
});

onMounted(() => {
  document.addEventListener('pointerdown', onDocPointerDown, true);
});
onUnmounted(() => {
  document.removeEventListener('pointerdown', onDocPointerDown, true);
  window.removeEventListener('scroll', onCardMenuScrollOrResize, true);
  window.removeEventListener('resize', onCardMenuScrollOrResize);
});

function openCreateFolderModal() {
  folderModalMode.value = 'create';
  folderModalTargetId.value = null;
  folderModalOpen.value = true;
}

function openEditFolderModal(folderId: string) {
  folderModalMode.value = 'edit';
  folderModalTargetId.value = folderId;
  folderModalOpen.value = true;
  setFolderExpandedInCompact(folderId, true);
  closeContextMenu();
}

function onFolderModalSave(name: string) {
  if (folderModalMode.value === 'create') {
    const f = addFolder(name);
    const sid = pendingServerForNewFolder.value;
    if (sid) {
      moveServerInFolder(sid, f.id, 0);
      pendingServerForNewFolder.value = null;
    }
  } else if (folderModalTargetId.value) {
    renameFolder(folderModalTargetId.value, name);
  }
}

function onFolderModalDelete() {
  const id = folderModalTargetId.value;
  if (!id) return;
  removeFolder(id);
  folderModalTargetId.value = null;
}

function onCreateWidgetFolder() {
  pendingServerForNewFolder.value = null;
  openCreateFolderModal();
}

function onPanelBackgroundClick() {
  openMenuId.value = null;
  cardMenuPosition.value = null;
  closeContextMenu();
  dismissCompactPreviewNow();
}

function assignServerToFolder(serverId: string, folderId: string | null) {
  setServerFolderMembership(serverId, folderId);
  closeContextMenu();
}

function assignServerToFolderFromMenu(folderId: string | null) {
  const m = contextMenu.value;
  if (!m || m.target !== 'server') return;
  assignServerToFolder(m.serverId, folderId);
}

function newFolderFromContextMenu() {
  const m = contextMenu.value;
  if (!m || m.target !== 'server') return;
  newFolderWithServer(m.serverId);
}

function newFolderWithServer(serverId: string) {
  pendingServerForNewFolder.value = serverId;
  openCreateFolderModal();
  openMenuId.value = null;
  closeContextMenu();
}

function contextMenuToggleFolderLayout() {
  const m = contextMenu.value;
  if (!m || m.target !== 'folder') return;
  if (props.compact) {
    toggleFolderExpandedInCompact(m.folderId);
  } else {
    toggleFolderCollapsedInCard(m.folderId);
  }
  closeContextMenu();
}

const contextMenuFolderExpandedLabel = computed(() => {
  const m = contextMenu.value;
  if (!m || m.target !== 'folder') return '';
  if (props.compact) {
    return isFolderExpandedInCompact(m.folderId)
      ? 'Collapse folder'
      : 'Expand folder';
  }
  return isFolderCollapsedInCard(m.folderId) ? 'Show servers' : 'Hide servers';
});

const contextMenuFolderName = computed(() => {
  const m = contextMenu.value;
  if (!m || m.target !== 'folder') return 'Folder';
  return folders.value.find((f) => f.id === m.folderId)?.name ?? 'Folder';
});

function contextMenuEditFolder() {
  const m = contextMenu.value;
  if (!m || m.target !== 'folder') return;
  openEditFolderModal(m.folderId);
}

function contextMenuDeleteFolder() {
  contextMenuEditFolder();
}

function isPinned(id: string) {
  return serverStore.pinnedMoreServers.some((s) => s.id === id);
}

function togglePin(server: MoreServersMockServer) {
  if (isPinned(server.id)) {
    emit('unpin-server', server.id);
  } else {
    emit('pin-server', {
      id: server.id,
      name: server.name,
      imageUrl: server.icon,
    });
  }
}

function toggleMenu(id: string) {
  closeContextMenu();
  const next = openMenuId.value === id ? null : id;
  openMenuId.value = next;
  if (!next) cardMenuPosition.value = null;
}

function onLeaveServer(serverId: string) {
  removeServerFromAllFolders(serverId);
  emit('leave-server', serverId);
  openMenuId.value = null;
  closeContextMenu();
}

function openServerInfo(serverId: string) {
  emit('open-server', serverId);
  openMenuId.value = null;
}

function inviteServer(serverId: string) {
  emit('invite-server', serverId);
  openMenuId.value = null;
}

function serverBannerStyle(server: MoreServersMockServer) {
  const heroSrc = server.bannerImageUrl?.trim() || server.icon;
  return {
    backgroundImage: `url(${safeImageUrl(serverGuildIconDisplayUrl(heroSrc))})`,
    backgroundPosition: `center ${server.bannerPositionY ?? 50}%`,
  };
}

function serverInviteLabel(vanityCode: string | undefined): string {
  const v = vanityCode?.trim();
  if (!v) return '';
  return echoInviteSharePageUrl(v);
}

function onCompactServerDragStart(serverId: string, e: DragEvent) {
  dismissCompactPreview();
  onServerDragStart(serverId, e);
}

function onCardServerDragStart(server: MoreServersMockServer, e: DragEvent) {
  const t = e.target;
  if (
    t instanceof Element &&
    t.closest('button, a, input, textarea, select, [data-no-card-drag]')
  ) {
    e.preventDefault();
    return;
  }
  onServerDragStart(server.id, e);
}

function compactFolderDropRing(
  folderId: string,
  folderOrderIndex: number,
): string {
  if (
    isDropTargetActive({
      kind: 'folder-order',
      index: folderOrderIndex,
    })
  ) {
    return 'ring-2 ring-sky-400/50';
  }
  if (
    isDropTargetActive({
      kind: 'folder',
      folderId,
      index: 0,
    })
  ) {
    return 'ring-2 ring-emerald-400/45';
  }
  return '';
}
</script>

<template>
  <aside
    class="more-servers-panel relative h-full min-w-0 overflow-hidden"
    :class="
      open
        ? 'pointer-events-auto more-servers-panel--open'
        : 'pointer-events-none'
    "
    @click.self="onPanelBackgroundClick"
  >
    <div
      class="more-servers-panel__inner flex h-full min-w-0 flex-col overflow-hidden"
      :class="
        open
          ? 'more-servers-panel__inner--open'
          : 'more-servers-panel__inner--closed'
      "
      :inert="!open"
    >
      <!-- ── CARD HEADER ── -->
      <template v-if="!props.compact">
        <div
          class="flex shrink-0 items-center justify-between gap-2 px-4 pt-3 pb-2"
        >
          <div class="min-w-0">
            <h2 class="truncate text-base font-bold text-foreground">
              Extra servers
            </h2>
            <p class="mt-0.5 text-[11px] leading-snug text-fg-subtle">
              Widget folders group this list only — stored on this device.
            </p>
          </div>
          <button
            type="button"
            class="more-icon-btn shrink-0"
            title="Close"
            @click="emit('close')"
          >
            <svg
              class="h-3.5 w-3.5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2.2"
              aria-hidden="true"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div class="flex shrink-0 flex-col gap-1 px-3 pb-3">
          <button
            type="button"
            class="view-tab view-tab--active"
            @click="emit('set-compact', false)"
          >
            <svg
              class="h-3.5 w-3.5 shrink-0"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              aria-hidden="true"
            >
              <rect x="4" y="5" width="16" height="14" rx="2.5" />
              <line x1="4" y1="11" x2="20" y2="11" />
            </svg>
            <span>Full Size</span>
          </button>
          <div class="flex items-stretch gap-1">
            <button
              type="button"
              class="view-tab flex-1"
              @click="emit('set-compact', true)"
            >
              <svg
                class="h-3.5 w-3.5 shrink-0"
                viewBox="0 0 24 24"
                fill="currentColor"
                aria-hidden="true"
              >
                <circle cx="12" cy="6" r="2" />
                <circle cx="12" cy="12" r="2" />
                <circle cx="12" cy="18" r="2" />
              </svg>
              <span>Compact</span>
            </button>
            <button
              type="button"
              class="view-tab-pin"
              :class="props.pinned ? 'view-tab-pin--active' : ''"
              :title="props.pinned ? 'Unpin panel' : 'Keep panel open'"
              @click="emit('toggle-pinned')"
            >
              <svg
                class="h-3.5 w-3.5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                aria-hidden="true"
              >
                <rect x="5" y="11" width="14" height="10" rx="2" />
                <path d="M8 11V7a4 4 0 0 1 8 0v4" />
              </svg>
            </button>
          </div>
          <button
            type="button"
            class="view-tab w-full justify-center text-[11px] font-semibold"
            title="Create a compact-style folder for organising overflow servers"
            @click="onCreateWidgetFolder"
          >
            <svg
              class="h-3.5 w-3.5 shrink-0"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              aria-hidden="true"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"
              />
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M12 11v6M9 14h6"
              />
            </svg>
            <span>New widget folder</span>
          </button>
        </div>

        <div class="h-px w-full shrink-0 bg-glass-1" />
      </template>

      <!-- ── COMPACT HEADER ── -->
      <template v-else>
        <div
          class="compact-header flex shrink-0 flex-col items-center gap-1.5 py-2.5"
        >
          <button
            type="button"
            class="more-icon-btn"
            title="Close"
            @click="emit('close')"
          >
            <svg
              class="h-3.5 w-3.5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2.2"
              aria-hidden="true"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
          <button
            type="button"
            class="more-icon-btn"
            :class="props.pinned ? 'more-icon-btn--active' : ''"
            :title="props.pinned ? 'Unpin panel' : 'Keep panel open'"
            @click="emit('toggle-pinned')"
          >
            <svg
              class="h-3.5 w-3.5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              aria-hidden="true"
            >
              <rect x="5" y="11" width="14" height="10" rx="2" />
              <path d="M8 11V7a4 4 0 0 1 8 0v4" />
            </svg>
          </button>
          <button
            type="button"
            class="more-icon-btn"
            title="Full size view"
            @click="emit('set-compact', false)"
          >
            <svg
              class="h-3.5 w-3.5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              aria-hidden="true"
            >
              <rect x="4" y="5" width="16" height="14" rx="2.5" />
              <line x1="4" y1="11" x2="20" y2="11" />
            </svg>
          </button>
          <button
            type="button"
            class="more-icon-btn"
            title="New widget folder"
            @click="onCreateWidgetFolder"
          >
            <svg
              class="h-3.5 w-3.5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              aria-hidden="true"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"
              />
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M12 11v6M9 14h6"
              />
            </svg>
          </button>
        </div>
        <div class="h-px w-full shrink-0 bg-glass-1" />
      </template>

      <!-- ── CARD VIEW ── -->
      <div
        v-if="!props.compact"
        class="custom-scrollbar flex-1 overflow-y-auto px-3 py-3"
        @click="onPanelBackgroundClick"
      >
        <div class="flex flex-col gap-2">
          <template v-for="item in cardStack" :key="item.key">
            <div
              v-if="item.type === 'folderLabel'"
              class="widget-folder-card-rail relative mt-2 flex flex-wrap items-center gap-2 rounded-lg border px-2 py-1.5 transition-colors"
              :class="[
                draggingFolderId === item.folder.id ? 'opacity-60' : '',
                isDropTargetActive({
                  kind: 'folder-order',
                  index: item.folderOrderIndex,
                })
                  ? 'border-sky-400/70 bg-sky-500/10'
                  : isDropTargetActive({
                        kind: 'folder',
                        folderId: item.folder.id,
                        index: 0,
                      })
                    ? 'border-emerald-400/50 bg-emerald-500/8'
                    : 'border-[color-mix(in_srgb,var(--border)_55%,transparent)] bg-[color-mix(in_srgb,var(--surface)_70%,transparent)]',
              ]"
              @dragover.prevent="
                onFolderDragOver(item.folder.id, 0, $event);
                onFolderOrderDragOver(item.folderOrderIndex, $event);
              "
              @drop.prevent="onDrop"
              @contextmenu.prevent="
                openFolderContextMenu(item.folder.id, $event)
              "
            >
              <button
                type="button"
                class="widget-folder-chevron"
                :title="
                  isFolderCollapsedInCard(item.folder.id)
                    ? 'Show servers in folder'
                    : 'Hide servers in folder'
                "
                :aria-expanded="
                  !isFolderCollapsedInCard(item.folder.id) ? 'true' : 'false'
                "
                @click.stop="toggleFolderCollapsedInCard(item.folder.id)"
              >
                <svg
                  class="h-4 w-4 transition-transform"
                  :class="
                    isFolderCollapsedInCard(item.folder.id)
                      ? '-rotate-90'
                      : 'rotate-0'
                  "
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  aria-hidden="true"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    d="M6 9l6 6 6-6"
                  />
                </svg>
              </button>
              <span
                class="widget-folder-drag-handle inline-flex cursor-grab items-center text-fg-subtle active:cursor-grabbing"
                title="Drag to reorder folders"
                draggable="true"
                @dragstart="onFolderDragStart(item.folder.id, $event)"
                @dragend="onDragEnd"
                @click.stop
              >
                <svg
                  class="h-4 w-4"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <circle cx="9" cy="6" r="1.5" />
                  <circle cx="15" cy="6" r="1.5" />
                  <circle cx="9" cy="12" r="1.5" />
                  <circle cx="15" cy="12" r="1.5" />
                  <circle cx="9" cy="18" r="1.5" />
                  <circle cx="15" cy="18" r="1.5" />
                </svg>
              </span>
              <span
                class="min-w-0 flex-1 truncate text-sm font-semibold text-fg"
                >{{ item.folder.name }}</span
              >
              <span
                class="rounded-md bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-fg-subtle"
                >{{ item.folder.serverIds.length }}</span
              >
              <div class="flex shrink-0 items-center gap-0.5">
                <button
                  type="button"
                  class="widget-folder-icon-btn"
                  title="Edit folder"
                  @click.stop="openEditFolderModal(item.folder.id)"
                >
                  <svg
                    class="h-3.5 w-3.5"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    aria-hidden="true"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"
                    />
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      d="M18.5 2.5a2.12 2.12 0 013 3L12 15l-4 1 1-4 9.5-9.5z"
                    />
                  </svg>
                </button>
                <button
                  type="button"
                  class="widget-folder-icon-btn widget-folder-icon-btn--danger"
                  title="Delete folder…"
                  @click.stop="openEditFolderModal(item.folder.id)"
                >
                  <svg
                    class="h-3.5 w-3.5"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    aria-hidden="true"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      d="M3 6h18M8 6V4h8v2m-1 0v14a2 2 0 01-2 2H9a2 2 0 01-2-2V6h10z"
                    />
                  </svg>
                </button>
              </div>
            </div>
            <div
              v-else-if="item.type === 'ungroupedLabel'"
              class="mt-3 flex items-center gap-2 rounded-lg border border-dashed px-2 py-1.5 transition-colors"
              :class="
                isDropTargetActive({ kind: 'ungrouped', index: 0 })
                  ? 'border-sky-400/60 bg-sky-500/8'
                  : 'border-[color-mix(in_srgb,var(--border)_40%,transparent)]'
              "
              @dragover.prevent="onUngroupedDragOver(0, $event)"
              @drop.prevent="onDrop"
            >
              <span
                class="text-[10px] font-bold uppercase tracking-wider text-fg-subtle"
                >Other servers</span
              >
              <span class="text-[10px] text-fg-subtle"
                >Drop here to remove from folders</span
              >
            </div>
            <article
              v-else
              class="more-server-card overflow-hidden rounded-xl transition-opacity"
              :class="[
                item.topSpacer ? 'mt-2' : '',
                draggingServerId === item.server.id ? 'opacity-50' : '',
                item.ungroupedIndex != null &&
                isDropTargetActive({
                  kind: 'ungrouped',
                  index: item.ungroupedIndex,
                })
                  ? 'ring-2 ring-sky-400/40'
                  : '',
              ]"
              draggable="true"
              title="Drag to move between folders"
              @dragstart="onCardServerDragStart(item.server, $event)"
              @dragend="onDragEnd"
              @dragover.prevent="
                item.ungroupedIndex != null
                  ? onUngroupedDragOver(item.ungroupedIndex, $event)
                  : item.folderId != null && item.serverIndexInFolder != null
                    ? onFolderDragOver(
                        item.folderId,
                        item.serverIndexInFolder + 1,
                        $event,
                      )
                    : undefined
              "
              @drop.prevent="onDrop"
              @contextmenu.prevent="openServerContextMenu(item.server, $event)"
            >
              <div
                class="more-server-card__banner h-[4.25rem] w-full shrink-0 bg-cover bg-no-repeat"
                :style="serverBannerStyle(item.server)"
              />
              <div class="more-server-card__body px-3 pb-3 pt-1.5">
                <div class="flex items-start gap-3">
                  <div
                    class="more-server-card__avatar-ring shrink-0 rounded-2xl p-0.5 shadow-md"
                    :class="
                      isDropTargetActive({
                        kind: 'folder',
                        folderId: item.folderId ?? '',
                        index: (item.serverIndexInFolder ?? 0) + 1,
                      }) && item.folderId
                        ? 'ring-2 ring-emerald-400/60'
                        : ''
                    "
                    @click.stop
                  >
                    <PausedGifAvatar
                      :src="serverGuildIconDisplayUrl(item.server.icon)"
                      :alt="item.server.name"
                      img-class="h-12 w-12 rounded-[0.875rem] object-cover pointer-events-none"
                    />
                  </div>
                  <div class="min-w-0 flex-1 pt-0.5">
                    <div
                      class="flex flex-wrap items-center gap-x-1.5 gap-y-0.5"
                    >
                      <span
                        class="truncate text-[0.9375rem] font-semibold tracking-tight text-fg leading-tight"
                        >{{ item.server.name }}</span
                      >
                      <span
                        v-if="item.inFolderName"
                        class="shrink-0 rounded-md bg-[color-mix(in_srgb,var(--accent)_14%,transparent)] px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-fg-soft"
                        :title="'In widget folder: ' + item.inFolderName"
                      >
                        Folder
                      </span>
                      <span
                        v-if="isPinned(item.server.id)"
                        class="shrink-0 rounded-md bg-[color-mix(in_srgb,var(--accent)_22%,transparent)] px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-[var(--accent-contrast-fg)]"
                      >
                        Pinned
                      </span>
                      <svg
                        v-if="item.server.verified"
                        class="h-3.5 w-3.5 shrink-0 text-sky-400"
                        viewBox="0 0 24 24"
                        fill="currentColor"
                        aria-label="Verified"
                      >
                        <path
                          d="M9 12l2 2 4-4m6 2a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
                        />
                      </svg>
                    </div>
                    <p
                      v-if="serverInviteLabel(item.server.vanityCode)"
                      class="mt-1 truncate text-[11px] text-fg-subtle"
                      :title="serverInviteLabel(item.server.vanityCode)"
                    >
                      {{ serverInviteLabel(item.server.vanityCode) }}
                    </p>
                    <div
                      v-if="item.server.online || item.server.members"
                      class="mt-1 flex items-center gap-1.5 text-[11px] text-fg-subtle"
                    >
                      <span class="flex items-center gap-1">
                        <span
                          class="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400"
                        />
                        {{ item.server.online }} online
                      </span>
                      <span class="text-fg-subtle">·</span>
                      <span>{{ item.server.members }} members</span>
                    </div>
                  </div>
                </div>
                <p
                  v-if="item.server.description?.trim()"
                  class="mt-2 text-[11.5px] leading-relaxed text-fg-soft line-clamp-2"
                >
                  {{ item.server.description }}
                </p>
                <div
                  v-if="item.server.tags.length > 0"
                  class="mt-2 flex flex-wrap gap-1"
                >
                  <span
                    v-for="tag in item.server.tags"
                    :key="tag"
                    class="server-tag"
                    >{{ tag }}</span
                  >
                </div>
                <div class="mt-2.5 flex items-center gap-1.5" data-no-card-drag>
                  <button
                    type="button"
                    class="open-btn flex-1"
                    data-no-card-drag
                    @click="emit('open-server', item.server.id)"
                  >
                    Open
                  </button>
                  <button
                    type="button"
                    class="card-icon-btn"
                    data-no-card-drag
                    :class="
                      isPinned(item.server.id) ? 'card-icon-btn--active' : ''
                    "
                    :title="
                      isPinned(item.server.id)
                        ? 'Unpin from server list'
                        : 'Pin to server list'
                    "
                    @click.stop="togglePin(item.server)"
                  >
                    <svg
                      class="h-3.5 w-3.5"
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                      :fill="isPinned(item.server.id) ? 'currentColor' : 'none'"
                      stroke="currentColor"
                      stroke-width="1.8"
                      stroke-linejoin="round"
                    >
                      <path
                        d="M12 2l2.9 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l7.1-1.01L12 2z"
                      />
                    </svg>
                  </button>
                  <div>
                    <button
                      :ref="(el) => setCardMenuTriggerRef(item.server.id, el)"
                      type="button"
                      class="card-icon-btn"
                      data-no-card-drag
                      :class="
                        openMenuId === item.server.id
                          ? 'card-icon-btn--active'
                          : ''
                      "
                      title="More options"
                      aria-haspopup="menu"
                      :aria-expanded="openMenuId === item.server.id"
                      @click.stop="toggleMenu(item.server.id)"
                    >
                      <svg
                        class="h-3.5 w-3.5"
                        viewBox="0 0 24 24"
                        fill="currentColor"
                        aria-hidden="true"
                      >
                        <circle cx="5" cy="12" r="2" />
                        <circle cx="12" cy="12" r="2" />
                        <circle cx="19" cy="12" r="2" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            </article>
          </template>
        </div>
      </div>

      <!-- ── COMPACT VIEW ── -->
      <div v-else class="compact-scroll flex-1 py-2">
        <div class="flex w-full flex-col items-center gap-2 px-0.5">
          <template
            v-for="(row, rowIdx) in compactRows"
            :key="
              row.kind === 'server'
                ? 's-' + row.server.id
                : row.kind === 'folder'
                  ? 'f-' + row.folder.id
                  : 'ungrouped-label'
            "
          >
            <div
              v-if="row.kind === 'ungroupedLabel'"
              class="mt-2 w-full rounded-md border border-dashed px-1 py-1 text-center transition-colors"
              :class="
                isDropTargetActive({ kind: 'ungrouped', index: 0 })
                  ? 'border-sky-400/60 bg-sky-500/8'
                  : 'border-[color-mix(in_srgb,var(--border)_35%,transparent)]'
              "
              @dragover.prevent="onUngroupedDragOver(0, $event)"
              @drop.prevent="onDrop"
            >
              <span
                class="text-[9px] font-bold uppercase tracking-wide text-fg-subtle"
                >Other</span
              >
            </div>
            <div
              v-else-if="row.kind === 'server'"
              class="compact-slot relative flex w-full items-center justify-center transition-opacity"
              :class="[
                rowIdx === 0 ? 'mt-3' : '',
                draggingServerId === row.server.id ? 'opacity-50' : '',
                isDropTargetActive({
                  kind: 'ungrouped',
                  index: row.ungroupedIndex,
                })
                  ? 'ring-2 ring-sky-400/40 rounded-full'
                  : '',
              ]"
              @dragover.prevent="
                onUngroupedDragOver(row.ungroupedIndex, $event)
              "
              @drop.prevent="onDrop"
            >
              <span
                v-if="isPinned(row.server.id)"
                class="compact-pinned-dot"
                title="Pinned to rail"
              />
              <button
                type="button"
                class="compact-circle overflow-hidden"
                draggable="true"
                :title="
                  row.server.name +
                  ' — drag to move · right-click for folder options'
                "
                @click="emit('open-server', row.server.id)"
                @contextmenu.prevent="openServerContextMenu(row.server, $event)"
                @pointerenter="onCompactServerPointerEnter(row.server, $event)"
                @pointerleave="onCompactServerPointerLeave"
                @pointerdown="onCompactServerPointerDown"
                @dragstart="onCompactServerDragStart(row.server.id, $event)"
                @dragend="onDragEnd"
              >
                <PausedGifAvatar
                  :src="serverGuildIconDisplayUrl(row.server.icon)"
                  :alt="row.server.name"
                  img-class="h-full w-full object-cover pointer-events-none"
                />
              </button>
            </div>
            <div
              v-else-if="row.kind === 'folder'"
              class="widget-folder-compact flex w-full flex-col items-center"
              :class="draggingFolderId === row.folder.id ? 'opacity-60' : ''"
            >
              <div
                v-if="!isFolderExpandedInCompact(row.folder.id)"
                class="relative flex w-full justify-center"
              >
                <span
                  class="widget-folder-drag-handle absolute -left-0.5 top-1/2 z-[1] -translate-y-1/2 cursor-grab text-fg-subtle active:cursor-grabbing"
                  title="Drag to reorder folders"
                  draggable="true"
                  @dragstart="onFolderDragStart(row.folder.id, $event)"
                  @dragend="onDragEnd"
                  @click.stop
                >
                  <svg
                    class="h-3 w-3"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    aria-hidden="true"
                  >
                    <circle cx="9" cy="8" r="1.5" />
                    <circle cx="15" cy="8" r="1.5" />
                    <circle cx="9" cy="16" r="1.5" />
                    <circle cx="15" cy="16" r="1.5" />
                  </svg>
                </span>
                <button
                  type="button"
                  class="widget-folder-compact-icon compact-circle transition-colors"
                  :class="
                    compactFolderDropRing(row.folder.id, row.folderOrderIndex)
                  "
                  :aria-expanded="false"
                  :aria-label="
                    row.folder.name +
                    ', ' +
                    row.servers.length +
                    ' servers. Click to expand.'
                  "
                  :title="
                    row.folder.name +
                    ' — ' +
                    row.servers.length +
                    ' server(s). Click to expand; drag servers here.'
                  "
                  @click="toggleFolderExpandedInCompact(row.folder.id)"
                  @contextmenu.prevent="
                    openFolderContextMenu(row.folder.id, $event)
                  "
                  @dragover.prevent="
                    onFolderDragOver(row.folder.id, 0, $event);
                    onFolderOrderDragOver(row.folderOrderIndex, $event);
                  "
                  @drop.prevent="onDrop"
                >
                  <svg
                    class="h-[1.15rem] w-[1.15rem] text-fg-subtle"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.75"
                    aria-hidden="true"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"
                    />
                  </svg>
                  <span
                    v-if="row.servers.length"
                    class="widget-folder-compact-badge"
                    >{{ row.servers.length }}</span
                  >
                </button>
              </div>
              <div
                v-else
                class="widget-folder-blob w-full transition-colors"
                :class="
                  compactFolderDropRing(row.folder.id, row.folderOrderIndex)
                "
                @dragover.prevent="
                  onFolderDragOver(row.folder.id, 0, $event);
                  onFolderOrderDragOver(row.folderOrderIndex, $event);
                "
                @drop.prevent="onDrop"
                @contextmenu.prevent="
                  openFolderContextMenu(row.folder.id, $event)
                "
              >
                <div class="widget-folder-blob__header">
                  <span
                    class="widget-folder-drag-handle cursor-grab text-fg-subtle active:cursor-grabbing"
                    title="Drag to reorder folders"
                    draggable="true"
                    @dragstart="onFolderDragStart(row.folder.id, $event)"
                    @dragend="onDragEnd"
                    @click.stop
                  >
                    <svg
                      class="h-3 w-3"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                      aria-hidden="true"
                    >
                      <circle cx="9" cy="8" r="1.5" />
                      <circle cx="15" cy="8" r="1.5" />
                      <circle cx="9" cy="16" r="1.5" />
                      <circle cx="15" cy="16" r="1.5" />
                    </svg>
                  </span>
                  <button
                    type="button"
                    class="widget-folder-compact-icon compact-circle shrink-0"
                    :aria-expanded="true"
                    :title="row.folder.name + ' — click to collapse'"
                    @click="toggleFolderExpandedInCompact(row.folder.id)"
                  >
                    <svg
                      class="h-[1.15rem] w-[1.15rem] text-fg-subtle"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="1.75"
                      aria-hidden="true"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"
                      />
                    </svg>
                  </button>
                  <p
                    class="widget-folder-blob__name min-w-0 flex-1 truncate text-center text-[10px] font-semibold text-fg-subtle"
                    :title="row.folder.name"
                  >
                    {{ row.folder.name }}
                  </p>
                </div>
                <p
                  v-if="!row.servers.length"
                  class="px-2 pb-2 text-center text-[10px] leading-snug text-fg-subtle"
                >
                  Empty — drag a server here.
                </p>
                <div class="widget-folder-blob__servers">
                  <div
                    v-for="(s, si) in row.servers"
                    :key="'fe-' + s.id"
                    class="compact-slot relative flex w-full items-center justify-center transition-opacity"
                    :class="[
                      draggingServerId === s.id ? 'opacity-50' : '',
                      isDropTargetActive({
                        kind: 'folder',
                        folderId: row.folder.id,
                        index: si + 1,
                      })
                        ? 'ring-2 ring-emerald-400/35 rounded-full'
                        : '',
                    ]"
                    @dragover.prevent="
                      onFolderDragOver(row.folder.id, si + 1, $event)
                    "
                    @drop.prevent="onDrop"
                  >
                    <span
                      v-if="isPinned(s.id)"
                      class="compact-pinned-dot"
                      title="Pinned to rail"
                    />
                    <button
                      type="button"
                      class="compact-circle overflow-hidden"
                      draggable="true"
                      :title="
                        s.name +
                        ' — drag to move · right-click for folder options'
                      "
                      @click="emit('open-server', s.id)"
                      @contextmenu.prevent="openServerContextMenu(s, $event)"
                      @pointerenter="onCompactServerPointerEnter(s, $event)"
                      @pointerleave="onCompactServerPointerLeave"
                      @pointerdown="onCompactServerPointerDown"
                      @dragstart="onCompactServerDragStart(s.id, $event)"
                      @dragend="onDragEnd"
                    >
                      <PausedGifAvatar
                        :src="serverGuildIconDisplayUrl(s.icon)"
                        :alt="s.name"
                        img-class="h-full w-full object-cover pointer-events-none"
                      />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </template>
        </div>
      </div>
    </div>
    <Teleport to="body">
      <div
        v-if="openMenuId && openMenuServer && cardMenuPosition"
        data-more-servers-card-menu
        class="ellipsis-menu fixed z-[200] min-w-[200px] py-1"
        :style="cardMenuStyle"
        role="menu"
        aria-label="Server options"
        @mousedown.stop
      >
        <button
          type="button"
          class="echo-menu-item flex w-full px-3 py-2 text-left text-sm"
          role="menuitem"
          @click="openServerInfo(openMenuServer.id)"
        >
          View server info
        </button>
        <button
          v-if="props.canOpenInviteForServer?.(openMenuServer.id) ?? false"
          type="button"
          class="echo-menu-item flex w-full px-3 py-2 text-left text-sm"
          role="menuitem"
          @click="inviteServer(openMenuServer.id)"
        >
          Invite people
        </button>
        <button
          type="button"
          class="echo-menu-item flex w-full px-3 py-2 text-left text-sm"
          role="menuitem"
          @click="togglePin(openMenuServer)"
        >
          {{ isPinned(openMenuServer.id) ? 'Remove from rail' : 'Pin to rail' }}
        </button>
        <div class="my-1 h-px bg-glass-2" role="separator" />
        <div
          class="px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-fg-subtle"
        >
          Widget folder
        </div>
        <button
          v-if="folderForServer(openMenuServer.id)"
          type="button"
          class="echo-menu-item flex w-full px-3 py-2 text-left text-sm"
          role="menuitem"
          @click="assignServerToFolder(openMenuServer.id, null)"
        >
          Remove from folder
        </button>
        <button
          v-for="f in folders"
          :key="'card-fm-' + f.id"
          type="button"
          class="echo-menu-item flex w-full px-3 py-2 text-left text-sm"
          role="menuitem"
          @click="assignServerToFolder(openMenuServer.id, f.id)"
        >
          Move to “{{ f.name }}”
        </button>
        <button
          type="button"
          class="echo-menu-item flex w-full px-3 py-2 text-left text-sm"
          role="menuitem"
          @click="newFolderWithServer(openMenuServer.id)"
        >
          New folder with this server…
        </button>
        <div class="my-1 h-px bg-glass-2" role="separator" />
        <button
          type="button"
          class="echo-menu-item echo-menu-item--destructive flex w-full px-3 py-2 text-left text-sm"
          role="menuitem"
          @click="onLeaveServer(openMenuServer.id)"
        >
          Leave server
        </button>
      </div>
      <div
        v-if="contextMenu"
        data-more-servers-folder-menu
        class="ellipsis-menu fixed z-[200] min-w-[200px] py-1"
        :style="contextMenuStyle"
        role="menu"
        @mousedown.stop
      >
        <template v-if="contextMenu.target === 'folder'">
          <div
            class="px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-fg-subtle truncate border-b border-border"
          >
            {{ contextMenuFolderName }}
          </div>
          <button
            type="button"
            class="echo-menu-item flex w-full px-3 py-2 text-left text-sm"
            role="menuitem"
            @click="contextMenuToggleFolderLayout"
          >
            {{ contextMenuFolderExpandedLabel }}
          </button>
          <button
            type="button"
            class="echo-menu-item flex w-full px-3 py-2 text-left text-sm"
            role="menuitem"
            @click="contextMenuEditFolder"
          >
            Edit folder…
          </button>
          <button
            type="button"
            class="echo-menu-item flex w-full px-3 py-2 text-left text-sm"
            role="menuitem"
            @click="openCreateFolderModal"
          >
            New folder…
          </button>
          <div class="my-1 h-px bg-glass-2" role="separator" />
          <button
            type="button"
            class="echo-menu-item echo-menu-item--destructive flex w-full px-3 py-2 text-left text-sm"
            role="menuitem"
            @click="contextMenuDeleteFolder"
          >
            Delete folder…
          </button>
        </template>
        <template v-else-if="contextMenu.target === 'server'">
          <div
            class="px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-fg-subtle border-b border-border"
          >
            Move to folder
          </div>
          <button
            v-if="folderForServer(contextMenu.serverId)"
            type="button"
            class="echo-menu-item flex w-full px-3 py-2 text-left text-sm"
            role="menuitem"
            @click="assignServerToFolderFromMenu(null)"
          >
            Remove from folder
          </button>
          <button
            v-for="f in folders"
            :key="'fm-' + f.id"
            type="button"
            class="echo-menu-item flex w-full px-3 py-2 text-left text-sm"
            role="menuitem"
            @click="assignServerToFolderFromMenu(f.id)"
          >
            Move to “{{ f.name }}”
          </button>
          <button
            type="button"
            class="echo-menu-item flex w-full px-3 py-2 text-left text-sm"
            role="menuitem"
            @click="newFolderFromContextMenu"
          >
            New folder with this server…
          </button>
        </template>
      </div>
    </Teleport>
    <Teleport to="body">
      <MoreServerCompactHoverPreview
        v-if="props.compact && compactPreviewServer && compactPreviewAnchor"
        :server="compactPreviewServer"
        :anchor="compactPreviewAnchor"
      />
    </Teleport>
    <MoreServerFolderModal
      v-model="folderModalOpen"
      :mode="folderModalMode"
      :initial-name="folderModalInitialName"
      :server-count="folderModalServerCount"
      @save="onFolderModalSave"
      @delete="onFolderModalDelete"
    />
  </aside>
</template>

<style scoped lang="scss">
$ease-out-expo: cubic-bezier(0.16, 1, 0.3, 1);

.more-servers-panel--open {
  background:
    radial-gradient(circle at top left, var(--vue-auto-022), transparent 26%),
    radial-gradient(
      circle at bottom right,
      var(--vue-auto-027),
      transparent 30%
    ),
    linear-gradient(180deg, var(--vue-auto-023), var(--vue-auto-024));
  backdrop-filter: blur(22px);
  -webkit-backdrop-filter: blur(22px);
}

:global([data-theme='light'] .more-servers-panel--open) {
  background: linear-gradient(180deg, var(--vue-auto-023), var(--vue-auto-024));
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
}

.more-servers-panel__inner {
  transition:
    transform 220ms $ease-out-expo,
    opacity 200ms ease-out;
}
.more-servers-panel__inner--open {
  opacity: 1;
  transform: translateX(0);
}
.more-servers-panel__inner--closed {
  opacity: 0;
  transform: translateX(-18px);
}

/* ── shared icon button ── */
.more-icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 2rem;
  border-radius: 6px;
  color: var(--vue-auto-086);
  transition:
    background-color 0.15s ease-out,
    color 0.15s ease-out;
  &:hover {
    background: var(--vue-auto-001);
    color: var(--vue-auto-009);
  }
}
.more-icon-btn--active {
  background: var(--vue-auto-034);
  color: var(--vue-auto-025);
}

/* ── view tabs ── */
.view-tab {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.4rem 0.65rem;
  border-radius: 8px;
  font-size: 0.75rem;
  font-weight: 500;
  color: var(--vue-auto-087);
  background: var(--vue-auto-007);
  border: 1px solid var(--vue-auto-002);
  transition:
    background-color 0.15s ease-out,
    color 0.15s ease-out,
    border-color 0.15s ease-out;
  &:hover {
    background: var(--vue-auto-001);
    color: var(--vue-auto-041);
    border-color: var(--vue-auto-034);
  }
}
.view-tab--active {
  background: var(--vue-auto-034);
  color: var(--vue-auto-012);
  border-color: var(--vue-auto-004);
}

.view-tab-pin {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0 0.6rem;
  border-radius: 8px;
  color: var(--vue-auto-087);
  background: var(--vue-auto-007);
  border: 1px solid var(--vue-auto-002);
  transition:
    background-color 0.15s ease-out,
    color 0.15s ease-out;
  &:hover {
    background: var(--vue-auto-001);
    color: var(--vue-auto-020);
  }
}
.view-tab-pin--active {
  background: var(--vue-auto-004);
  color: var(--vue-auto-025);
  border-color: var(--vue-auto-014);
}

/* ── card ── */
.more-server-card {
  background: linear-gradient(
    165deg,
    color-mix(in srgb, var(--bg-elevated, var(--bg)) 88%, white 6%),
    color-mix(in srgb, var(--bg) 92%, transparent)
  );
  border: 1px solid color-mix(in srgb, white 10%, transparent);
  box-shadow:
    inset 0 1px 0 color-mix(in srgb, white 12%, transparent),
    0 6px 20px rgb(0 0 0 / 18%);
  transition:
    transform 0.18s $ease-out-expo,
    box-shadow 0.18s ease-out,
    border-color 0.18s ease-out;
  &:hover {
    transform: translateY(-1px);
    border-color: color-mix(in srgb, white 16%, transparent);
    box-shadow:
      inset 0 1px 0 color-mix(in srgb, white 14%, transparent),
      0 10px 26px rgb(0 0 0 / 22%);
  }
}

.more-server-card__banner {
  position: relative;
  &::after {
    content: '';
    position: absolute;
    inset: 0;
    /* Light scrim: keep artwork visible; only deepen toward the fold for contrast */
    background: linear-gradient(
      180deg,
      rgb(0 0 0 / 0%) 0%,
      rgb(0 0 0 / 12%) 52%,
      color-mix(in srgb, var(--bg) 55%, rgb(0 0 0 / 35%)) 100%
    );
    pointer-events: none;
  }
}

.more-server-card__avatar-ring {
  margin-top: -1.75rem;
  position: relative;
  z-index: 2;
  background: linear-gradient(
    145deg,
    color-mix(in srgb, white 22%, transparent),
    color-mix(in srgb, var(--bg) 40%, transparent)
  );
  border: 1px solid color-mix(in srgb, white 14%, transparent);
}

.more-server-card__body {
  margin-top: -0.35rem;
  position: relative;
  z-index: 1;
}

/* tags */
.server-tag {
  font-size: 10px;
  font-weight: 500;
  padding: 0.15rem 0.45rem;
  border-radius: 99px;
  background: var(--vue-auto-008);
  color: var(--vue-auto-086);
  border: 1px solid var(--vue-auto-008);
}

/* open button */
.open-btn {
  padding: 0.35rem 0.75rem;
  border-radius: 8px;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--vue-auto-044);
  background: var(--vue-auto-206);
  border: 1px solid var(--vue-auto-008);
  transition: background-color 0.15s ease-out;
  &:hover {
    background: var(--vue-auto-207);
  }
}

/* card icon button (pin / ellipsis) */
.card-icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 2rem;
  border-radius: 7px;
  color: var(--vue-auto-028);
  background: var(--vue-auto-005);
  border: 1px solid var(--vue-auto-002);
  transition:
    background-color 0.15s ease-out,
    color 0.15s ease-out;
  &:hover {
    background: var(--vue-auto-034);
    color: var(--vue-auto-020);
  }
}
.card-icon-btn--active {
  background: var(--vue-auto-004);
  color: var(--vue-auto-025);
  border-color: var(--vue-auto-014);
}

/* ── Extra servers: widget folders (Discord-like compact stacks) ── */
.widget-folder-card-rail {
  background: linear-gradient(
    135deg,
    color-mix(in srgb, var(--accent) 6%, transparent),
    color-mix(in srgb, var(--surface) 88%, transparent)
  );
}

.widget-folder-chevron {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.65rem;
  height: 1.65rem;
  border-radius: 6px;
  color: var(--vue-auto-049);
  transition:
    background-color 0.12s ease-out,
    color 0.12s ease-out;
  &:hover {
    background: var(--vue-auto-001);
    color: var(--vue-auto-025);
  }
}

.widget-folder-icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.65rem;
  height: 1.65rem;
  border-radius: 6px;
  color: var(--vue-auto-049);
  border: 1px solid transparent;
  transition:
    background-color 0.12s ease-out,
    color 0.12s ease-out,
    border-color 0.12s ease-out;
  &:hover {
    background: var(--vue-auto-001);
    color: var(--vue-auto-025);
    border-color: var(--vue-auto-002);
  }
}
.widget-folder-icon-btn--danger {
  color: var(--vue-auto-210);
  &:hover {
    background: var(--vue-auto-211);
    color: var(--vue-auto-068);
  }
}

.widget-folder-chip-btn {
  font-size: 10px;
  font-weight: 600;
  padding: 0.15rem 0.45rem;
  border-radius: 6px;
  color: var(--vue-auto-049);
  background: transparent;
  border: 1px solid var(--vue-auto-002);
  transition:
    background-color 0.12s ease-out,
    color 0.12s ease-out;
  &:hover {
    background: var(--vue-auto-001);
    color: var(--vue-auto-025);
  }
}
.widget-folder-chip-btn--danger {
  color: var(--vue-auto-210);
  border-color: transparent;
  &:hover {
    background: var(--vue-auto-211);
    color: var(--vue-auto-068);
  }
}

.widget-folder-pill {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  width: 2.75rem;
  min-height: 3.5rem;
  padding: 0.35rem 0.25rem 0.4rem;
  border-radius: 1.35rem;
  background: linear-gradient(
    180deg,
    var(--vue-auto-007),
    color-mix(in srgb, var(--vue-auto-005) 88%, black 12%)
  );
  border: 1px solid var(--vue-auto-002);
  box-shadow: 0 6px 16px var(--vue-auto-089);
  color: var(--vue-auto-086);
  transition:
    transform 0.18s $ease-out-expo,
    border-color 0.15s ease-out;
  &:hover {
    transform: translateY(-1px);
    border-color: var(--vue-auto-034);
  }
}

.widget-folder-pill__stack {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  width: 2.1rem;
  height: 2.5rem;
  overflow: hidden;
}

.widget-folder-pill__peek {
  position: absolute;
  left: 50%;
  top: 0;
  width: 1.85rem;
  height: 1.85rem;
  border-radius: 999px;
  overflow: hidden;
  transform: translateX(-50%) translateY(var(--wf-nudge, 0px));
  border: 2px solid var(--vue-auto-001);
  box-sizing: border-box;
}

.widget-folder-pill__empty-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
}

.widget-folder-pill__count {
  margin-top: 0.1rem;
  font-size: 10px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: var(--vue-auto-025);
}

.widget-folder-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 0.25rem;
  max-width: 100%;
}

.widget-folder-tb {
  font-size: 10px;
  font-weight: 600;
  padding: 0.125rem 0.35rem;
  border-radius: 4px;
  color: var(--vue-auto-049);
  background: var(--vue-auto-007);
  border: 1px solid var(--vue-auto-002);
  transition:
    background-color 0.12s ease-out,
    color 0.12s ease-out;
  &:hover {
    background: var(--vue-auto-001);
    color: var(--vue-auto-025);
  }
}

.widget-folder-tb--danger {
  color: var(--vue-auto-210);
  &:hover {
    background: var(--vue-auto-211);
    color: var(--vue-auto-068);
  }
}

/* ── compact ── */
.compact-scroll {
  overflow-y: auto;
  /* Keep a small inset so the scrollbar never overlaps the server circles visually */
  padding-right: 4px;
  scrollbar-gutter: stable;
  scrollbar-width: thin;
  scrollbar-color: transparent transparent;

  &:hover {
    scrollbar-color: var(--vue-auto-088) transparent;
  }

  &::-webkit-scrollbar {
    width: 6px;
  }
  &::-webkit-scrollbar-track {
    background: transparent;
  }
  &::-webkit-scrollbar-thumb {
    background: transparent;
    border-radius: 3px;
  }
  &:hover::-webkit-scrollbar-thumb {
    background: var(--vue-auto-088);
  }
}

.compact-header {
  width: 100%;
}

.compact-slot {
  position: relative;
  height: 3.25rem;
}

.compact-pinned-dot {
  position: absolute;
  top: 6px;
  right: calc(50% - 1.65rem);
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--vue-auto-212);
  box-shadow: 0 0 6px var(--vue-auto-213);
  pointer-events: none;
}

.compact-circle {
  width: 2.5rem;
  height: 2.5rem;
  border-radius: 999px;
  background: var(--vue-auto-001);
  box-shadow:
    0 0 0 1.5px var(--vue-auto-214),
    0 6px 16px var(--vue-auto-089);
  transition:
    border-radius 0.25s $ease-out-expo,
    box-shadow 0.22s ease-out,
    transform 0.18s ease-out;
  &:hover {
    border-radius: 14px;
    transform: translateY(-1px);
    box-shadow:
      0 0 0 2px var(--vue-auto-215),
      0 10px 22px var(--vue-auto-216);
  }
}

/* Light theme: compact overflow rail — drop shadows read as muddy on pale chrome */
[data-theme='light'] .compact-circle {
  box-shadow: none;
  border: 1px solid color-mix(in srgb, var(--text) 14%, transparent);
  &:hover {
    box-shadow: none;
    border-color: color-mix(in srgb, var(--text) 22%, transparent);
  }
}
[data-theme='light'] .compact-pinned-dot {
  box-shadow: none;
}

[data-theme='light'] .widget-folder-pill {
  box-shadow: none;
  border-color: color-mix(in srgb, var(--text) 14%, transparent);
}

.widget-folder-compact-icon {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--vue-auto-049);
}

.widget-folder-compact-badge {
  position: absolute;
  right: -3px;
  bottom: -3px;
  min-width: 1rem;
  height: 1rem;
  padding: 0 0.2rem;
  border-radius: 999px;
  font-size: 9px;
  font-weight: 700;
  line-height: 1rem;
  text-align: center;
  font-variant-numeric: tabular-nums;
  color: var(--vue-auto-025);
  background: var(--vue-auto-007);
  border: 1.5px solid var(--vue-auto-001);
  box-shadow: 0 2px 6px var(--vue-auto-089);
}

.widget-folder-blob {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 0.35rem;
  padding: 0.45rem 0.35rem 0.5rem;
  border-radius: 1rem;
  border: 1px solid color-mix(in srgb, var(--border) 55%, transparent);
  background: linear-gradient(
    180deg,
    color-mix(in srgb, var(--accent) 5%, transparent),
    color-mix(in srgb, var(--surface) 82%, transparent)
  );
  box-shadow: inset 0 1px 0 color-mix(in srgb, white 6%, transparent);
}

.widget-folder-blob__header {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0 0.15rem;
}

.widget-folder-blob__servers {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.35rem;
}

[data-theme='light'] .widget-folder-blob {
  box-shadow: none;
  border-color: color-mix(in srgb, var(--text) 12%, transparent);
}
</style>
