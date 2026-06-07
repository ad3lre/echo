<script setup lang="ts">
import type { CSSProperties } from 'vue';
import PausedGifAvatar from '@/components/PausedGifAvatar.vue';
import type { MoreServersMockServer } from '@/composables/useMoreServers';
import type { MoreServerWidgetFolder } from '@/composables/useMoreServerFolders';
import type { MoreServerDropTarget } from '@/composables/useMoreServerFolderDrag';
import type { MoreServersCardStackItem } from '@/composables/useMoreServersLayout';
import { serverGuildIconDisplayUrl } from '@/utils/serverGuildIconDisplayUrl';

type FolderWithServers = {
  folder: MoreServerWidgetFolder;
  servers: MoreServersMockServer[];
};

defineProps<{
  cardStack: MoreServersCardStackItem[];
  folders: MoreServerWidgetFolder[];
  foldersWithServers: FolderWithServers[];
  foldersWithServersMap: ReadonlyMap<string, FolderWithServers>;
  normalizedOtherServersSearch: string;
  otherServersSearchQuery: string;
  filteredUngroupedServers: MoreServersMockServer[];
  draggingFolderId: string | null;
  draggingServerId: string | null;
  isDropTargetActive: (target: MoreServerDropTarget) => boolean;
  onPanelBackgroundClick: () => void;
  onFolderDragOverCard: (folderId: string, index: number, e: DragEvent) => void;
  onFolderOrderDragOver: (index: number, e: DragEvent) => void;
  onDrop: (e: DragEvent) => void;
  openFolderContextMenu: (folderId: string, e: MouseEvent) => void;
  onFolderDragStart: (folderId: string, e: DragEvent) => void;
  onDragEnd: () => void;
  isFolderCollapsedInCard: (folderId: string) => boolean;
  toggleFolderCollapsedInCard: (folderId: string) => void;
  folderPeekServers: (
    servers: MoreServersMockServer[],
  ) => MoreServersMockServer[];
  onUngroupedDragOver: (index: number, e: DragEvent) => void;
  onCardServerDragStart: (server: MoreServersMockServer, e: DragEvent) => void;
  openServerContextMenu: (server: MoreServersMockServer, e: MouseEvent) => void;
  serverBannerStyle: (server: MoreServersMockServer) => CSSProperties;
  serverInviteLabel: (vanityCode: string | undefined) => string;
  isPinned: (id: string) => boolean;
  openServer: (id: string) => void;
  togglePin: (server: MoreServersMockServer) => void;
  openMenuId: string | null;
  toggleMenu: (id: string) => void;
  setCardMenuTriggerRef: (serverId: string, el: unknown) => void;
}>();
</script>

<template>
  <div
    class="custom-scrollbar flex-1 overflow-y-auto px-3 py-3"
    @click="onPanelBackgroundClick"
  >
    <div class="flex flex-col gap-2">
      <p
        v-if="
          foldersWithServers.length === 0 &&
          normalizedOtherServersSearch &&
          filteredUngroupedServers.length === 0
        "
        class="rounded-lg border border-dashed border-[color-mix(in_srgb,var(--border)_40%,transparent)] px-3 py-4 text-center text-[11px] text-fg-subtle"
      >
        No servers match “{{ otherServersSearchQuery.trim() }}”.
      </p>
      <template v-for="item in cardStack" :key="item.key">
        <div
          v-if="item.type === 'folderLabel'"
          data-ms-drop="folder"
          :data-ms-drop-folder="item.folder.id"
          data-ms-drop-index="0"
          class="widget-folder-card-rail group relative mt-3 overflow-hidden rounded-xl border transition-all duration-200"
          :class="[
            draggingFolderId === item.folder.id ? 'opacity-60' : '',
            draggingServerId ? 'min-h-[3rem]' : '',
            isDropTargetActive({
              kind: 'folder-order',
              index: item.folderOrderIndex,
            })
              ? 'widget-folder-card-rail--drop-order'
              : isDropTargetActive({
                    kind: 'folder',
                    folderId: item.folder.id,
                    index: 0,
                  })
                ? 'widget-folder-card-rail--drop-in'
                : draggingServerId
                  ? 'widget-folder-card-rail--drop-hint'
                  : '',
          ]"
          @dragover.prevent="
            onFolderDragOverCard(item.folder.id, 0, $event);
            onFolderOrderDragOver(item.folderOrderIndex, $event);
          "
          @drop.prevent="onDrop"
          @contextmenu.prevent="openFolderContextMenu(item.folder.id, $event)"
        >
          <div class="widget-folder-card-rail__shine" aria-hidden="true" />
          <div class="widget-folder-card-rail__accent" aria-hidden="true" />
          <div
            class="widget-folder-card-rail__inner flex min-h-[2.5rem] items-center gap-1.5 px-2.5 py-1.5"
          >
            <span
              class="widget-folder-drag-handle inline-flex shrink-0 cursor-grab items-center text-fg-subtle opacity-0 transition-opacity duration-150 group-hover:opacity-50 active:cursor-grabbing"
              title="Drag to reorder folders"
              draggable="true"
              @dragstart="onFolderDragStart(item.folder.id, $event)"
              @dragend="onDragEnd"
              @click.stop
            >
              <svg
                class="h-3.5 w-3.5"
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
            <button
              type="button"
              class="widget-folder-chevron shrink-0"
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
                class="h-4 w-4 transition-transform duration-200"
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
            <p
              class="widget-folder-card-rail__name min-w-0 flex-1 truncate text-[13px] font-semibold leading-tight text-fg"
            >
              {{ item.folder.name }}
            </p>
            <div
              v-if="
                isFolderCollapsedInCard(item.folder.id) &&
                (foldersWithServersMap.get(item.folder.id)?.servers.length ??
                  0) > 0
              "
              class="folder-peek-avatars shrink-0"
              aria-hidden="true"
            >
              <span
                v-for="(peek, pi) in folderPeekServers(
                  foldersWithServersMap.get(item.folder.id)?.servers ?? [],
                )"
                :key="peek.id"
                class="folder-peek-avatar"
                :style="{ '--pi': String(pi) }"
              >
                <PausedGifAvatar
                  :src="serverGuildIconDisplayUrl(peek.icon)"
                  :alt="''"
                  img-class="h-full w-full object-cover pointer-events-none"
                />
              </span>
            </div>
            <span class="widget-folder-card-rail__count shrink-0">{{
              item.folder.serverIds.length
            }}</span>
            <button
              type="button"
              class="widget-folder-icon-btn shrink-0 opacity-0 transition-opacity duration-150 group-hover:opacity-100"
              title="Folder options"
              @click.stop="openFolderContextMenu(item.folder.id, $event)"
            >
              <svg
                class="h-3.5 w-3.5"
                viewBox="0 0 24 24"
                fill="currentColor"
                aria-hidden="true"
              >
                <circle cx="5" cy="12" r="1.75" />
                <circle cx="12" cy="12" r="1.75" />
                <circle cx="19" cy="12" r="1.75" />
              </svg>
            </button>
          </div>
        </div>
        <div
          v-else-if="item.type === 'ungroupedLabel'"
          data-ms-drop="ungrouped"
          data-ms-drop-index="0"
          class="ungrouped-section mt-4 transition-all"
          :class="
            isDropTargetActive({ kind: 'ungrouped', index: 0 })
              ? 'ungrouped-section--drop'
              : ''
          "
          @dragover.prevent="onUngroupedDragOver(0, $event)"
          @drop.prevent="onDrop"
        >
          <div class="ungrouped-section__rule">
            <span class="ungrouped-section__label">Other servers</span>
          </div>
          <div
            v-if="draggingServerId && folders.length > 0"
            class="mt-2 flex flex-wrap items-center gap-1.5 px-1"
            role="group"
            aria-label="Drop into widget folder"
          >
            <span class="w-full text-[10px] font-medium text-fg-subtle"
              >Move into folder:</span
            >
            <button
              v-for="f in folders"
              :key="'ungrouped-folder-drop-' + f.id"
              type="button"
              data-ms-drop="folder"
              :data-ms-drop-folder="f.id"
              data-ms-drop-index="0"
              class="rounded-md border px-2 py-1 text-[11px] font-semibold transition-colors"
              :class="
                isDropTargetActive({
                  kind: 'folder',
                  folderId: f.id,
                  index: 0,
                })
                  ? 'border-emerald-400/60 bg-emerald-500/12 text-fg'
                  : 'border-[color-mix(in_srgb,var(--border)_55%,transparent)] bg-[color-mix(in_srgb,var(--surface)_65%,transparent)] text-fg-subtle hover:text-fg'
              "
              @dragover.prevent="onFolderDragOverCard(f.id, 0, $event)"
              @drop.prevent="onDrop"
            >
              {{ f.name }}
            </button>
          </div>
          <p
            v-if="
              normalizedOtherServersSearch &&
              filteredUngroupedServers.length === 0
            "
            class="mt-2 px-1 text-[10px] text-fg-subtle"
          >
            No other servers match “{{ otherServersSearchQuery.trim() }}”.
          </p>
        </div>
        <article
          v-else
          class="more-server-card overflow-hidden rounded-xl transition-opacity"
          :data-ms-drop="
            item.ungroupedIndex != null
              ? 'ungrouped'
              : item.folderId
                ? 'folder'
                : undefined
          "
          :data-ms-drop-folder="item.folderId"
          :data-ms-drop-index="
            item.ungroupedIndex != null
              ? String(item.ungroupedIndex)
              : item.serverIndexInFolder != null
                ? String(item.serverIndexInFolder + 1)
                : undefined
          "
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
                ? onFolderDragOverCard(
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
                <div class="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
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
                @click="openServer(item.server.id)"
              >
                Open
              </button>
              <button
                type="button"
                class="card-icon-btn"
                data-no-card-drag
                :class="isPinned(item.server.id) ? 'card-icon-btn--active' : ''"
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
                    openMenuId === item.server.id ? 'card-icon-btn--active' : ''
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
</template>

<style scoped lang="scss">
@use './MoreServersCardStack.scss';
</style>
