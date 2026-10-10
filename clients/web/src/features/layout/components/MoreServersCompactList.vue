<script setup lang="ts">
import PausedGifAvatar from '@/components/PausedGifAvatar.vue';
import type { MoreServersMockServer } from '@/features/layout/composables/more-servers/useMoreServers';
import type { MoreServerWidgetFolder } from '@/features/layout/composables/more-servers/useMoreServerFolders';
import type { MoreServerDropTarget } from '@/features/layout/composables/more-servers/useMoreServerFolderDrag';
import type { MoreServersCompactRow } from '@/features/layout/composables/more-servers/useMoreServersLayout';
import iconFolder from '@/assets/icons/folder.svg?url';
import { serverGuildIconDisplayUrl } from '@/features/layout/display/serverGuildIconDisplayUrl';

defineProps<{
  compactRows: MoreServersCompactRow[];
  folders: MoreServerWidgetFolder[];
  draggingFolderId: string | null;
  draggingServerId: string | null;
  isDropTargetActive: (target: MoreServerDropTarget) => boolean;
  onUngroupedDragOver: (index: number, e: DragEvent) => void;
  onFolderDragOverCompact: (
    folderId: string,
    index: number,
    e: DragEvent,
  ) => void;
  onFolderOrderDragOver: (index: number, e: DragEvent) => void;
  onDrop: (e: DragEvent) => void;
  onPanelDragOverCapture: (e: DragEvent) => void;
  isPinned: (id: string) => boolean;
  openServer: (id: string) => void;
  openServerContextMenu: (server: MoreServersMockServer, e: MouseEvent) => void;
  onCompactServerPointerEnter: (
    server: MoreServersMockServer,
    e: PointerEvent,
  ) => void;
  onCompactServerPointerLeave: () => void;
  onCompactServerPointerDown: () => void;
  onCompactServerDragStart: (serverId: string, e: DragEvent) => void;
  onDragEnd: () => void;
  isFolderExpandedInCompact: (folderId: string) => boolean;
  toggleFolderExpandedInCompact: (folderId: string) => void;
  onFolderDragStart: (folderId: string, e: DragEvent) => void;
  openFolderContextMenu: (folderId: string, e: MouseEvent) => void;
  compactFolderDropRing: (folderId: string, folderOrderIndex: number) => string;
  folderPeekServers: (
    servers: MoreServersMockServer[],
  ) => MoreServersMockServer[];
}>();
</script>

<template>
  <div
    class="compact-scroll flex-1 py-2"
    @dragover.capture="onPanelDragOverCapture"
  >
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
          data-ms-drop="ungrouped"
          data-ms-drop-index="0"
          class="compact-ungrouped mt-2 w-full px-1 transition-all"
          :class="
            isDropTargetActive({ kind: 'ungrouped', index: 0 })
              ? 'compact-ungrouped--drop'
              : ''
          "
          @dragover.prevent="onUngroupedDragOver(0, $event)"
          @drop.prevent="onDrop"
        >
          <div class="compact-ungrouped-rule" />
          <div
            v-if="draggingServerId && folders.length > 0"
            class="mt-1.5 flex flex-wrap justify-center gap-1"
            role="group"
            aria-label="Drop into widget folder"
          >
            <button
              v-for="f in folders"
              :key="'compact-ungrouped-drop-' + f.id"
              type="button"
              data-ms-drop="folder"
              :data-ms-drop-folder="f.id"
              data-ms-drop-index="0"
              class="max-w-full truncate rounded border px-1.5 py-0.5 text-[9px] font-semibold transition-colors"
              :class="
                isDropTargetActive({
                  kind: 'folder',
                  folderId: f.id,
                  index: 0,
                })
                  ? 'border-emerald-400/60 bg-emerald-500/12 text-fg'
                  : 'border-[color-mix(in_srgb,var(--border)_50%,transparent)] text-fg-subtle'
              "
              :title="'Drop into ' + f.name"
              @dragover.prevent="onFolderDragOverCompact(f.id, 0, $event)"
              @drop.prevent="onDrop"
            >
              {{ f.name }}
            </button>
          </div>
        </div>
        <div
          v-else-if="row.kind === 'server'"
          data-ms-drop="ungrouped"
          :data-ms-drop-index="String(row.ungroupedIndex)"
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
          @dragover.prevent="onUngroupedDragOver(row.ungroupedIndex, $event)"
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
            @click="openServer(row.server.id)"
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
            class="widget-folder-compact-stack flex w-full flex-col items-center gap-2"
            data-ms-drop="folder"
            :data-ms-drop-folder="row.folder.id"
            data-ms-drop-index="0"
            :data-ms-folder-order-index="String(row.folderOrderIndex)"
            :class="
              isFolderExpandedInCompact(row.folder.id)
                ? 'widget-folder-compact-stack--open'
                : ''
            "
            @dragover.prevent="
              onFolderDragOverCompact(row.folder.id, 0, $event);
              onFolderOrderDragOver(row.folderOrderIndex, $event);
            "
            @drop.prevent="onDrop"
          >
            <div class="relative flex w-full justify-center">
              <button
                type="button"
                data-ms-drop="folder"
                :data-ms-drop-folder="row.folder.id"
                data-ms-drop-index="0"
                class="widget-folder-compact-trigger cursor-grab transition-all duration-200 active:cursor-grabbing"
                :class="[
                  compactFolderDropRing(row.folder.id, row.folderOrderIndex),
                  isFolderExpandedInCompact(row.folder.id)
                    ? 'widget-folder-compact-trigger--open'
                    : '',
                ]"
                draggable="true"
                :aria-expanded="
                  isFolderExpandedInCompact(row.folder.id) ? 'true' : 'false'
                "
                :aria-label="
                  row.folder.name +
                  ', ' +
                  row.servers.length +
                  ' servers. ' +
                  (isFolderExpandedInCompact(row.folder.id)
                    ? 'Click to collapse.'
                    : 'Click to expand.')
                "
                :title="
                  row.folder.name +
                  ' — ' +
                  row.servers.length +
                  ' server(s). Click to ' +
                  (isFolderExpandedInCompact(row.folder.id)
                    ? 'collapse'
                    : 'expand') +
                  '; drag to reorder folder.'
                "
                @click="toggleFolderExpandedInCompact(row.folder.id)"
                @contextmenu.prevent="
                  openFolderContextMenu(row.folder.id, $event)
                "
                @dragstart="onFolderDragStart(row.folder.id, $event)"
                @dragend="onDragEnd"
                @dragover.prevent="
                  onFolderDragOverCompact(row.folder.id, 0, $event);
                  onFolderOrderDragOver(row.folderOrderIndex, $event);
                "
                @drop.prevent="onDrop"
              >
                <div class="widget-folder-compact-trigger__body">
                  <div
                    v-if="row.servers.length"
                    class="widget-folder-compact-grid"
                    :data-count="
                      Math.min(
                        row.servers.length,
                        folderPeekServers(row.servers).length,
                      )
                    "
                    aria-hidden="true"
                  >
                    <span
                      v-for="(peek, peekIdx) in folderPeekServers(row.servers)"
                      :key="peek.id"
                      class="widget-folder-compact-grid__cell"
                      :class="
                        'widget-folder-compact-grid__cell--slot-' +
                        (peekIdx + 1)
                      "
                    >
                      <PausedGifAvatar
                        :src="serverGuildIconDisplayUrl(peek.icon)"
                        :alt="''"
                        img-class="widget-folder-compact-grid__media pointer-events-none"
                      />
                    </span>
                  </div>
                  <div v-else class="widget-folder-compact-empty">
                    <img
                      :src="iconFolder"
                      alt=""
                      class="widget-folder-compact-empty__icon"
                    />
                  </div>
                </div>
                <span
                  v-if="row.servers.length > 4"
                  class="widget-folder-compact-badge"
                  >{{ row.servers.length }}</span
                >
              </button>
            </div>
            <div
              v-if="isFolderExpandedInCompact(row.folder.id)"
              class="widget-folder-compact-servers flex w-full flex-col items-center gap-2"
            >
              <p
                v-if="!row.servers.length"
                class="px-1 text-center text-[10px] leading-snug text-fg-subtle"
              >
                Empty — drag a server here.
              </p>
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
                data-ms-drop="folder"
                :data-ms-drop-folder="row.folder.id"
                :data-ms-drop-index="String(si + 1)"
                @dragover.prevent="
                  onFolderDragOverCompact(row.folder.id, si + 1, $event)
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
                    s.name + ' — drag to move · right-click for folder options'
                  "
                  @click="openServer(s.id)"
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
</template>

<style scoped lang="scss" src="./styles/MoreServersCompactList.scss"></style>
