<script setup lang="ts">
import { safeImageUrl } from '@/utils/safeImageUrl';
import { serverGuildIconDisplayUrl } from '@/utils/serverGuildIconDisplayUrl';
import { echoInviteSharePageUrl } from '@/utils/echoInviteShareUrl';
import { useMoreServers } from '@/composables/useMoreServers';
import type { MoreServersMockServer } from '@/composables/useMoreServers';
import { useMoreServerFolders } from '@/composables/useMoreServerFolders';
import { useMoreServersLayout } from '@/composables/useMoreServersLayout';
import { useMoreServersMenus } from '@/composables/useMoreServersMenus';
import { useMoreServersFolders } from '@/composables/useMoreServersFolders';
import {
  useMoreServerFolderDrag,
  shouldAbortMoreServerNestedDrag,
  type MoreServerDropTarget,
} from '@/composables/useMoreServerFolderDrag';
import MoreServerFolderModal from '@/components/MoreServerFolderModal.vue';
import MoreServerCompactHoverPreview from '@/components/MoreServerCompactHoverPreview.vue';
import MoreServersCardStack from '@/components/MoreServersCardStack.vue';
import MoreServersCompactList from '@/components/MoreServersCompactList.vue';
import MoreServersContextMenus from '@/components/MoreServersContextMenus.vue';
import { useMoreServerCompactHoverPreview } from '@/composables/useMoreServerCompactHoverPreview';
import { useServerStore } from '@/stores/server';
import { MAX_STARRED_SERVERS } from '@/utils/serverRailReorder';
import { showStarredServerLimitAlert } from '@/utils/serverRailPinFeedback';
import { icons } from '@/assets/icons';

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
  setFolderCollapsedInCard,
  toggleFolderCollapsedInCard,
} = useMoreServerFolders();

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
  suppressClickAfterDrag,
  onServerDragStart,
  onFolderDragStart,
  onDragEnd,
  onPanelDragOverCapture,
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

const {
  serverById,
  otherServersSearchQuery,
  normalizedOtherServersSearch,
  filteredUngroupedServers,
  showOtherServersSearch,
  foldersWithServers,
  foldersWithServersMap,
  folderPeekServers,
  cardStack,
  compactRows,
} = useMoreServersLayout({
  servers: moreServersList,
  folders,
  validServerIds,
  isPinned,
  isFolderCollapsedInCard,
});

const {
  openMenuId,
  cardMenuPosition,
  contextMenu,
  openMenuServer,
  cardMenuStyle,
  contextMenuStyle,
  setCardMenuTriggerRef,
  closeContextMenu,
  openServerContextMenu,
  openFolderContextMenu,
  toggleMenu,
} = useMoreServersMenus({ serverById });

const {
  folderModalOpen,
  folderModalMode,
  folderModalInitialName,
  folderModalServerCount,
  openCreateFolderModal,
  onFolderModalSave,
  onFolderModalDelete,
  onCreateWidgetFolder,
  assignServerToFolder,
  assignServerToFolderFromMenu,
  newFolderFromContextMenu,
  newFolderWithServer,
  contextMenuToggleFolderLayout,
  contextMenuFolderExpandedLabel,
  contextMenuFolderName,
  contextMenuEditFolder,
  contextMenuDeleteFolder,
} = useMoreServersFolders({
  folders,
  addFolder,
  removeFolder,
  renameFolder,
  moveServerInFolder,
  setServerFolderMembership,
  setFolderExpandedInCompact,
  toggleFolderExpandedInCompact,
  toggleFolderCollapsedInCard,
  isFolderExpandedInCompact,
  isFolderCollapsedInCard,
  compact: () => props.compact,
  contextMenu,
  closeContextMenu,
  openMenuId,
});

function onPanelBackgroundClick() {
  openMenuId.value = null;
  cardMenuPosition.value = null;
  closeContextMenu();
  dismissCompactPreviewNow();
}

function isPinned(id: string) {
  return serverStore.pinnedMoreServers.some((s) => s.id === id);
}

function togglePin(server: MoreServersMockServer) {
  if (isPinned(server.id)) {
    emit('unpin-server', server.id);
    openMenuId.value = null;
    return;
  }
  if (serverStore.pinnedMoreServers.length >= MAX_STARRED_SERVERS) {
    openMenuId.value = null;
    cardMenuPosition.value = null;
    void showStarredServerLimitAlert();
    return;
  }
  emit('pin-server', {
    id: server.id,
    name: server.name,
    imageUrl: server.icon,
  });
  openMenuId.value = null;
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

function openServer(serverId: string) {
  emit('open-server', serverId);
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
  if (shouldAbortMoreServerNestedDrag(e)) {
    e.preventDefault();
    return;
  }
  onServerDragStart(server.id, e);
}

function openServerFromPanel(serverId: string) {
  if (suppressClickAfterDrag.value) return;
  openServer(serverId);
}

function toggleFolderExpandedInCompactFromPanel(folderId: string) {
  if (suppressClickAfterDrag.value) return;
  toggleFolderExpandedInCompact(folderId);
}

function toggleFolderCollapsedInCardFromPanel(folderId: string) {
  if (suppressClickAfterDrag.value) return;
  toggleFolderCollapsedInCard(folderId);
}

/** Expand collapsed folder headers while dragging an ungrouped server over them. */
function onFolderDragOverCard(folderId: string, index: number, e: DragEvent) {
  if (draggingServerId.value && isFolderCollapsedInCard(folderId)) {
    setFolderCollapsedInCard(folderId, false);
  }
  onFolderDragOver(folderId, index, e);
}

function onFolderDragOverCompact(
  folderId: string,
  index: number,
  e: DragEvent,
) {
  if (draggingServerId.value && !isFolderExpandedInCompact(folderId)) {
    setFolderExpandedInCompact(folderId, true);
  }
  onFolderDragOver(folderId, index, e);
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

        <div class="flex shrink-0 items-center gap-1 px-3 pb-2">
          <button
            type="button"
            class="view-tab-icon"
            title="Switch to compact view"
            aria-label="Switch to compact view"
            @click="emit('set-compact', true)"
          >
            <svg
              class="h-3.5 w-3.5"
              viewBox="0 0 24 24"
              fill="currentColor"
              aria-hidden="true"
            >
              <circle cx="12" cy="6" r="2" />
              <circle cx="12" cy="12" r="2" />
              <circle cx="12" cy="18" r="2" />
            </svg>
          </button>
          <button
            type="button"
            class="view-tab-icon"
            :class="props.pinned ? 'view-tab-icon--active' : ''"
            :title="props.pinned ? 'Unpin panel' : 'Keep panel open'"
            :aria-label="props.pinned ? 'Unpin panel' : 'Keep panel open'"
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
            class="view-tab-icon"
            title="New widget folder"
            aria-label="New widget folder"
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

        <div v-if="showOtherServersSearch" class="shrink-0 px-3 pb-2">
          <label class="sr-only" for="more-servers-other-search"
            >Search other servers</label
          >
          <div class="other-servers-search">
            <img
              :src="icons.search"
              alt=""
              class="other-servers-search__icon h-3.5 w-3.5 shrink-0 opacity-70 filter invert"
              aria-hidden="true"
            />
            <input
              id="more-servers-other-search"
              v-model="otherServersSearchQuery"
              type="search"
              class="other-servers-search__input"
              placeholder="Search other servers…"
              autocomplete="off"
            />
            <button
              v-if="normalizedOtherServersSearch"
              type="button"
              class="other-servers-search__clear"
              aria-label="Clear search"
              @click="otherServersSearchQuery = ''"
            >
              <svg
                class="h-3 w-3"
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
      <MoreServersCardStack
        v-if="!props.compact"
        :card-stack="cardStack"
        :folders="folders"
        :folders-with-servers="foldersWithServers"
        :folders-with-servers-map="foldersWithServersMap"
        :normalized-other-servers-search="normalizedOtherServersSearch"
        :other-servers-search-query="otherServersSearchQuery"
        :filtered-ungrouped-servers="filteredUngroupedServers"
        :dragging-folder-id="draggingFolderId"
        :dragging-server-id="draggingServerId"
        :is-drop-target-active="isDropTargetActive"
        :on-panel-background-click="onPanelBackgroundClick"
        :on-folder-drag-over-card="onFolderDragOverCard"
        :on-folder-order-drag-over="onFolderOrderDragOver"
        :on-drop="onDrop"
        :on-panel-drag-over-capture="onPanelDragOverCapture"
        :open-folder-context-menu="openFolderContextMenu"
        :on-folder-drag-start="onFolderDragStart"
        :on-drag-end="onDragEnd"
        :is-folder-collapsed-in-card="isFolderCollapsedInCard"
        :toggle-folder-collapsed-in-card="toggleFolderCollapsedInCardFromPanel"
        :folder-peek-servers="folderPeekServers"
        :on-ungrouped-drag-over="onUngroupedDragOver"
        :on-card-server-drag-start="onCardServerDragStart"
        :open-server-context-menu="openServerContextMenu"
        :server-banner-style="serverBannerStyle"
        :server-invite-label="serverInviteLabel"
        :is-pinned="isPinned"
        :open-server="openServerFromPanel"
        :toggle-pin="togglePin"
        :open-menu-id="openMenuId"
        :toggle-menu="toggleMenu"
        :set-card-menu-trigger-ref="setCardMenuTriggerRef"
      />

      <!-- ── COMPACT VIEW ── -->
      <MoreServersCompactList
        v-else
        :compact-rows="compactRows"
        :folders="folders"
        :dragging-folder-id="draggingFolderId"
        :dragging-server-id="draggingServerId"
        :is-drop-target-active="isDropTargetActive"
        :on-ungrouped-drag-over="onUngroupedDragOver"
        :on-folder-drag-over-compact="onFolderDragOverCompact"
        :on-folder-order-drag-over="onFolderOrderDragOver"
        :on-drop="onDrop"
        :is-pinned="isPinned"
        :open-server="openServerFromPanel"
        :open-server-context-menu="openServerContextMenu"
        :on-panel-drag-over-capture="onPanelDragOverCapture"
        :on-compact-server-pointer-enter="onCompactServerPointerEnter"
        :on-compact-server-pointer-leave="onCompactServerPointerLeave"
        :on-compact-server-pointer-down="onCompactServerPointerDown"
        :on-compact-server-drag-start="onCompactServerDragStart"
        :on-drag-end="onDragEnd"
        :is-folder-expanded-in-compact="isFolderExpandedInCompact"
        :toggle-folder-expanded-in-compact="
          toggleFolderExpandedInCompactFromPanel
        "
        :on-folder-drag-start="onFolderDragStart"
        :open-folder-context-menu="openFolderContextMenu"
        :compact-folder-drop-ring="compactFolderDropRing"
        :folder-peek-servers="folderPeekServers"
      />
    </div>
    <MoreServersContextMenus
      :open-menu-id="openMenuId"
      :open-menu-server="openMenuServer"
      :card-menu-position="cardMenuPosition"
      :card-menu-style="cardMenuStyle"
      :context-menu="contextMenu"
      :context-menu-style="contextMenuStyle"
      :folders="folders"
      :context-menu-folder-name="contextMenuFolderName"
      :context-menu-folder-expanded-label="contextMenuFolderExpandedLabel"
      :can-open-invite-for-server="props.canOpenInviteForServer"
      :is-pinned="isPinned"
      :folder-for-server="folderForServer"
      :open-server-info="openServerInfo"
      :invite-server="inviteServer"
      :toggle-pin="togglePin"
      :assign-server-to-folder="assignServerToFolder"
      :new-folder-with-server="newFolderWithServer"
      :on-leave-server="onLeaveServer"
      :context-menu-toggle-folder-layout="contextMenuToggleFolderLayout"
      :context-menu-edit-folder="contextMenuEditFolder"
      :open-create-folder-modal="openCreateFolderModal"
      :context-menu-delete-folder="contextMenuDeleteFolder"
      :assign-server-to-folder-from-menu="assignServerToFolderFromMenu"
      :new-folder-from-context-menu="newFolderFromContextMenu"
    />
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

/* ── header icon controls ── */
.view-tab-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 2rem;
  height: 2rem;
  border-radius: 8px;
  color: var(--vue-auto-087);
  background: var(--vue-auto-007);
  border: 1px solid var(--vue-auto-002);
  transition:
    background-color 0.15s ease-out,
    color 0.15s ease-out,
    border-color 0.15s ease-out;
  &:hover {
    background: var(--vue-auto-001);
    color: var(--vue-auto-020);
    border-color: var(--vue-auto-034);
  }
}
.view-tab-icon--active {
  background: var(--vue-auto-004);
  color: var(--vue-auto-025);
  border-color: var(--vue-auto-014);
}

.other-servers-search {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.35rem 0.5rem;
  border-radius: 8px;
  background: var(--vue-auto-007);
  border: 1px solid var(--vue-auto-002);
}
.other-servers-search__input {
  min-width: 0;
  flex: 1;
  border: 0;
  background: transparent;
  font-size: 0.6875rem;
  font-weight: 500;
  color: var(--vue-auto-009);
  outline: none;
  &::placeholder {
    color: var(--vue-auto-087);
  }
}
.other-servers-search__clear {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 1.25rem;
  height: 1.25rem;
  border-radius: 4px;
  color: var(--vue-auto-087);
  transition: background-color 0.15s ease-out;
  &:hover {
    background: var(--vue-auto-001);
    color: var(--vue-auto-009);
  }
}

.compact-header {
  width: 100%;
}
</style>
