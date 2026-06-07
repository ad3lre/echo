<script setup lang="ts">
import PausedGifAvatar from '@/components/PausedGifAvatar.vue';
import type { MoreServersMockServer } from '@/composables/useMoreServers';
import type { MoreServerWidgetFolder } from '@/composables/useMoreServerFolders';
import type { MoreServerDropTarget } from '@/composables/useMoreServerFolderDrag';
import type { MoreServersCompactRow } from '@/composables/useMoreServersLayout';
import iconFolder from '@/assets/icons/folder.svg?url';
import { serverGuildIconDisplayUrl } from '@/utils/serverGuildIconDisplayUrl';

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
  <div class="compact-scroll flex-1 py-2">
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
              data-ms-drop="folder"
              :data-ms-drop-folder="row.folder.id"
              data-ms-drop-index="0"
              class="widget-folder-compact-trigger compact-circle transition-all duration-200"
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
                onFolderDragOverCompact(row.folder.id, 0, $event);
                onFolderOrderDragOver(row.folderOrderIndex, $event);
              "
              @drop.prevent="onDrop"
            >
              <div class="widget-folder-compact-trigger__body">
                <div
                  v-if="row.servers.length"
                  class="widget-folder-compact-stack"
                  aria-hidden="true"
                >
                  <span
                    v-for="(peek, si) in folderPeekServers(row.servers)"
                    :key="peek.id"
                    class="widget-folder-compact-peek"
                    :style="{ '--wf-peek': String(si) }"
                  >
                    <PausedGifAvatar
                      :src="serverGuildIconDisplayUrl(peek.icon)"
                      :alt="''"
                      img-class="h-full w-full object-cover pointer-events-none"
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
                v-if="row.servers.length"
                class="widget-folder-compact-badge"
                >{{ row.servers.length }}</span
              >
            </button>
          </div>
          <div
            v-else
            data-ms-drop="folder"
            :data-ms-drop-folder="row.folder.id"
            data-ms-drop-index="0"
            class="widget-folder-blob w-full transition-all duration-200"
            :class="compactFolderDropRing(row.folder.id, row.folderOrderIndex)"
            @dragover.prevent="
              onFolderDragOverCompact(row.folder.id, 0, $event);
              onFolderOrderDragOver(row.folderOrderIndex, $event);
            "
            @drop.prevent="onDrop"
            @contextmenu.prevent="openFolderContextMenu(row.folder.id, $event)"
          >
            <div class="widget-folder-blob__glow" aria-hidden="true" />
            <div
              class="widget-folder-blob__header cursor-grab active:cursor-grabbing"
              draggable="true"
              @dragstart="onFolderDragStart(row.folder.id, $event)"
              @dragend="onDragEnd"
            >
              <p
                class="widget-folder-blob__name min-w-0 flex-1 truncate text-center text-[10px] font-semibold tracking-wide text-fg"
                :title="row.folder.name"
              >
                {{ row.folder.name }}
              </p>
              <span class="widget-folder-blob__count">{{
                row.servers.length
              }}</span>
              <button
                type="button"
                class="widget-folder-blob__collapse-btn"
                :aria-expanded="true"
                :title="row.folder.name + ' — click to collapse'"
                @click.stop="toggleFolderExpandedInCompact(row.folder.id)"
              >
                <svg
                  class="h-3 w-3"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2.5"
                  aria-hidden="true"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    d="M5 15l7-7 7 7"
                  />
                </svg>
              </button>
            </div>
            <p
              v-if="!row.servers.length"
              class="widget-folder-blob__empty px-2 pb-2.5 text-center text-[10px] leading-snug text-fg-subtle"
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

.widget-folder-compact-trigger {
  position: relative;
  width: 2.65rem;
  height: 2.65rem;
  padding: 0;
  overflow: visible;
  background: linear-gradient(
    165deg,
    color-mix(in srgb, var(--accent) 18%, transparent),
    color-mix(in srgb, var(--bg-elevated, var(--bg)) 90%, transparent)
  );
  border: 1.5px solid color-mix(in srgb, var(--accent) 32%, var(--border));
  box-shadow:
    inset 0 1px 0 color-mix(in srgb, white 10%, transparent),
    0 8px 20px rgb(0 0 0 / 22%);
  &:hover {
    border-color: color-mix(in srgb, var(--accent) 50%, var(--border));
    transform: translateY(-2px);
    box-shadow:
      inset 0 1px 0 color-mix(in srgb, white 12%, transparent),
      0 12px 26px rgb(0 0 0 / 28%);
  }
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

.widget-folder-compact-stack {
  position: relative;
  width: 2rem;
  height: 2.15rem;
}
.widget-folder-compact-stack--sm {
  width: 1.55rem;
  height: 1.55rem;
}
.widget-folder-compact-peek {
  --wf-nudge: calc(var(--wf-peek, 0) * 5px);
  position: absolute;
  left: 50%;
  top: 0;
  width: 1.65rem;
  height: 1.65rem;
  border-radius: 999px;
  overflow: hidden;
  transform: translateX(-50%) translateY(var(--wf-nudge));
  border: 2px solid color-mix(in srgb, var(--bg) 88%, transparent);
  box-shadow: 0 4px 10px rgb(0 0 0 / 28%);
  z-index: calc(3 - var(--wf-peek, 0));
}
.widget-folder-compact-stack--sm .widget-folder-compact-peek {
  width: 1.25rem;
  height: 1.25rem;
  --wf-nudge: calc(var(--wf-peek, 0) * 4px);
  border-width: 1.5px;
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
  right: -4px;
  bottom: -4px;
  z-index: 4;
  min-width: 1.05rem;
  height: 1.05rem;
  padding: 0 0.22rem;
  border-radius: 999px;
  font-size: 9px;
  font-weight: 800;
  line-height: 1.05rem;
  text-align: center;
  font-variant-numeric: tabular-nums;
  color: var(--accent-contrast-fg, #fff);
  background: linear-gradient(
    180deg,
    var(--accent),
    color-mix(in srgb, var(--accent) 75%, #312e81)
  );
  border: 1.5px solid color-mix(in srgb, var(--bg) 90%, transparent);
  box-shadow: 0 2px 8px color-mix(in srgb, var(--accent) 45%, transparent);
}

.widget-folder-blob {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 0.4rem;
  padding: 0.5rem 0.4rem 0.55rem;
  border-radius: 1.15rem;
  border: 1px solid color-mix(in srgb, var(--accent) 28%, var(--border));
  background: linear-gradient(
    180deg,
    color-mix(in srgb, var(--accent) 12%, transparent),
    color-mix(in srgb, var(--bg-elevated, var(--bg)) 94%, transparent) 38%,
    color-mix(in srgb, var(--surface) 90%, transparent)
  );
  box-shadow:
    inset 0 1px 0 color-mix(in srgb, white 8%, transparent),
    0 10px 28px rgb(0 0 0 / 20%);
}
.widget-folder-blob__glow {
  pointer-events: none;
  position: absolute;
  inset: -1px;
  border-radius: inherit;
  background: radial-gradient(
    120% 80% at 50% 0%,
    color-mix(in srgb, var(--accent) 22%, transparent),
    transparent 68%
  );
  opacity: 0.9;
}
.widget-folder-blob__header {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.2rem 0.3rem 0.2rem 0.4rem;
  border-radius: 0.65rem;
  background: color-mix(in srgb, var(--bg) 35%, transparent);
  border: 1px solid color-mix(in srgb, var(--border) 40%, transparent);
  user-select: none;
}
.widget-folder-blob__collapse-btn {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.4rem;
  height: 1.4rem;
  border-radius: 6px;
  color: var(--vue-auto-049);
  transition:
    background-color 0.12s ease-out,
    color 0.12s ease-out;
  cursor: pointer;
  &:hover {
    background: var(--vue-auto-001);
    color: var(--vue-auto-025);
  }
}
.widget-folder-blob__name {
  text-shadow: 0 1px 2px rgb(0 0 0 / 25%);
}
.widget-folder-blob__count {
  flex-shrink: 0;
  min-width: 1.1rem;
  padding: 0.1rem 0.35rem;
  border-radius: 999px;
  font-size: 9px;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  color: var(--accent-contrast-fg, #fff);
  background: var(--accent);
  box-shadow: 0 1px 6px color-mix(in srgb, var(--accent) 35%, transparent);
}
.widget-folder-blob__empty {
  position: relative;
  z-index: 1;
  font-style: italic;
  opacity: 0.9;
}
.widget-folder-blob__servers {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.35rem;
  padding-top: 0.1rem;
}

[data-theme='light'] .widget-folder-compact-trigger {
  box-shadow: none;
  border-color: color-mix(in srgb, var(--text) 14%, transparent);
  &:hover {
    box-shadow: none;
    border-color: color-mix(in srgb, var(--accent) 40%, var(--border));
  }
}
[data-theme='light'] .widget-folder-compact-empty__icon {
  filter: none;
  opacity: 0.55;
}
[data-theme='light'] .widget-folder-blob {
  box-shadow: none;
  border-color: color-mix(in srgb, var(--text) 12%, transparent);
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
