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

<style scoped lang="scss">
$ease-out-expo: cubic-bezier(0.16, 1, 0.3, 1);

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

.widget-folder-compact-stack--open {
  position: relative;
  padding-left: 0.35rem;

  &::before {
    content: '';
    position: absolute;
    left: 0.2rem;
    top: 2.75rem;
    bottom: 0.65rem;
    width: 2px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--border) 55%, transparent);
    pointer-events: none;
  }
}

.widget-folder-compact-trigger {
  position: relative;
  width: 2.5rem;
  height: 2.5rem;
  padding: 0;
  overflow: hidden;
  border: none;
  border-radius: 12px;
  background: var(--vue-auto-001);
  box-shadow: 0 6px 16px var(--vue-auto-089);
  transition:
    border-radius 0.25s $ease-out-expo,
    box-shadow 0.22s ease-out,
    transform 0.18s ease-out;
  &:hover {
    border-radius: 14px;
    transform: translateY(-1px);
    box-shadow: 0 10px 22px var(--vue-auto-216);
  }
}
.widget-folder-compact-trigger--open {
  border-radius: 14px;
  box-shadow: 0 8px 18px var(--vue-auto-089);
}

.widget-folder-compact-servers {
  width: 100%;
}
.widget-folder-compact-trigger__body {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  border-radius: inherit;
  overflow: hidden;
}

.widget-folder-compact-grid {
  display: grid;
  width: 100%;
  height: 100%;
  gap: 0;
  padding: 0;
  border-radius: inherit;
  overflow: hidden;
  background: var(--vue-auto-001);

  &[data-count='1'] {
    grid-template: 1fr / 1fr;
  }
  &[data-count='2'] {
    grid-template: 1fr / 1fr 1fr;
  }
  &[data-count='3'] {
    grid-template: 1fr 1fr / 1fr 1fr;
    .widget-folder-compact-grid__cell--slot-1 {
      grid-area: 1 / 1;
    }
    .widget-folder-compact-grid__cell--slot-2 {
      grid-area: 1 / 2;
    }
    .widget-folder-compact-grid__cell--slot-3 {
      grid-area: 2 / 1;
    }
  }
  &[data-count='4'] {
    grid-template: 1fr 1fr / 1fr 1fr;
  }
}
.widget-folder-compact-grid__cell {
  position: relative;
  overflow: hidden;
  min-width: 0;
  min-height: 0;
  background: var(--vue-auto-001);

  &::after {
    content: '';
    position: absolute;
    inset: 0;
    box-shadow: inset 0 0 0 1px
      color-mix(in srgb, var(--border) 14%, transparent);
    pointer-events: none;
  }
}
:deep(.widget-folder-compact-grid__media) {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  transform: scale(1.42);
  transform-origin: center;
}

.widget-folder-compact-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
}
.widget-folder-compact-empty__icon {
  width: 1.35rem;
  height: 1.35rem;
  opacity: 0.72;
  filter: invert(1) brightness(1.05);
}

.widget-folder-compact-badge {
  position: absolute;
  right: 3px;
  bottom: 3px;
  z-index: 4;
  padding: 0 0.18rem;
  border-radius: 3px;
  font-size: 7px;
  font-weight: 700;
  line-height: 1.15;
  letter-spacing: 0.01em;
  text-align: center;
  font-variant-numeric: tabular-nums;
  color: color-mix(in srgb, white 82%, transparent);
  background: color-mix(in srgb, black 58%, transparent);
  border: none;
  box-shadow: none;
  opacity: 0.78;
  pointer-events: none;
}

[data-theme='light'] .widget-folder-compact-trigger {
  box-shadow: none;
  &:hover {
    box-shadow: none;
  }
}
[data-theme='light'] .widget-folder-compact-badge {
  color: color-mix(in srgb, white 92%, transparent);
  background: color-mix(in srgb, black 48%, transparent);
}
[data-theme='light'] .widget-folder-compact-empty__icon {
  filter: none;
  opacity: 0.55;
}

.compact-ungrouped-rule {
  height: 1px;
  margin: 0.15rem 0.25rem 0.25rem;
  background: color-mix(in srgb, var(--border) 35%, transparent);
  border-radius: 1px;
  transition: background 0.2s;
}
.compact-ungrouped--drop .compact-ungrouped-rule {
  background: rgb(56 189 248 / 45%);
  box-shadow: 0 0 6px rgb(56 189 248 / 18%);
}
</style>
