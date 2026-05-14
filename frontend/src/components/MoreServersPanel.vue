<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { safeImageUrl } from '@/utils/safeImageUrl';
import { serverGuildIconDisplayUrl } from '@/utils/serverGuildIconDisplayUrl';
import { echoInviteSharePageUrl } from '@/utils/echoInviteShareUrl';
import PausedGifAvatar from '@/components/PausedGifAvatar.vue';
import { useMoreServers } from '@/composables/useMoreServers';
import type { MoreServersMockServer } from '@/composables/useMoreServers';
import { useMoreServerFolders } from '@/composables/useMoreServerFolders';
import type { MoreServerWidgetFolder } from '@/composables/useMoreServerFolders';
import { useServerStore } from '@/stores/server';

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
  addFolder,
  removeFolder,
  renameFolder,
  setServerFolderMembership,
  folderForServer,
} = useMoreServerFolders();

const openMenuId = ref<string | null>(null);
/** Right-click / long-press target: assign server to a widget folder (compact). */
const folderAssignMenu = ref<{
  serverId: string;
  left: number;
  top: number;
} | null>(null);
const expandedFolders = ref<Record<string, boolean>>({});

const folderMenuStyle = computed(() => {
  const m = folderAssignMenu.value;
  if (!m) return {};
  const vw = typeof window !== 'undefined' ? window.innerWidth : 800;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 600;
  const left = Math.max(8, Math.min(m.left, vw - 196));
  const top = Math.max(8, Math.min(m.top, vh - 260));
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
    servers: folder.serverIds
      .map((id) => serverById.value.get(id))
      .filter((x): x is MoreServersMockServer => !!x),
  })),
);

type CardStackItem =
  | { type: 'folderLabel'; key: string; folder: MoreServerWidgetFolder }
  | {
      type: 'server';
      key: string;
      server: MoreServersMockServer;
      topSpacer: boolean;
      /** When this row sits under a widget folder header, show a subtle chip. */
      inFolderName?: string;
    };

const cardStack = computed((): CardStackItem[] => {
  const out: CardStackItem[] = [];
  let firstServer = true;
  for (const server of ungroupedServers.value) {
    out.push({
      type: 'server',
      key: `u-${server.id}`,
      server,
      topSpacer: firstServer,
    });
    firstServer = false;
  }
  for (const { folder, servers } of foldersWithServers.value) {
    out.push({ type: 'folderLabel', key: `h-${folder.id}`, folder });
    for (const server of servers) {
      out.push({
        type: 'server',
        key: `f-${folder.id}-${server.id}`,
        server,
        topSpacer: false,
        inFolderName: folder.name,
      });
    }
  }
  return out;
});

type CompactRow =
  | { kind: 'server'; server: MoreServersMockServer }
  | {
      kind: 'folder';
      folder: MoreServerWidgetFolder;
      servers: MoreServersMockServer[];
    };

const compactRows = computed((): CompactRow[] => {
  const rows: CompactRow[] = [];
  for (const server of ungroupedServers.value) {
    rows.push({ kind: 'server', server });
  }
  for (const folder of folders.value) {
    const servers = folder.serverIds
      .map((id) => serverById.value.get(id))
      .filter((x): x is MoreServersMockServer => !!x);
    rows.push({ kind: 'folder', folder, servers });
  }
  return rows;
});

function closeFolderAssignMenu() {
  folderAssignMenu.value = null;
}

function openFolderAssignMenu(server: MoreServersMockServer, e: MouseEvent) {
  e.preventDefault();
  e.stopPropagation();
  openMenuId.value = null;
  folderAssignMenu.value = {
    serverId: server.id,
    left: e.clientX,
    top: e.clientY,
  };
}

function onDocPointerDown(ev: MouseEvent) {
  const t = ev.target;
  if (!(t instanceof Node)) return;
  const el = document.querySelector('[data-more-servers-folder-menu]');
  if (el && !el.contains(t)) closeFolderAssignMenu();
}

onMounted(() => {
  document.addEventListener('pointerdown', onDocPointerDown, true);
});
onUnmounted(() => {
  document.removeEventListener('pointerdown', onDocPointerDown, true);
});

function toggleFolderExpanded(folderId: string) {
  expandedFolders.value = {
    ...expandedFolders.value,
    [folderId]: !expandedFolders.value[folderId],
  };
}

function onCreateWidgetFolder() {
  const name = window.prompt('Name for this widget folder', 'New folder');
  if (name === null) return;
  const f = addFolder(name);
  expandedFolders.value = { ...expandedFolders.value, [f.id]: true };
}

function onRenameWidgetFolder(folderId: string) {
  const cur = folders.value.find((x) => x.id === folderId)?.name ?? 'Folder';
  const name = window.prompt('Rename widget folder', cur);
  if (name === null) return;
  renameFolder(folderId, name);
}

function onPanelBackgroundClick() {
  openMenuId.value = null;
  closeFolderAssignMenu();
}

function onDeleteWidgetFolder(folderId: string) {
  if (
    !window.confirm(
      'Delete this folder? Servers inside stay in Extra servers — they are not removed from Echo.',
    )
  ) {
    return;
  }
  removeFolder(folderId);
  const next = { ...expandedFolders.value };
  delete next[folderId];
  expandedFolders.value = next;
}

function assignServerToFolder(serverId: string, folderId: string | null) {
  setServerFolderMembership(serverId, folderId);
  closeFolderAssignMenu();
}

function assignServerToFolderFromMenu(folderId: string | null) {
  const m = folderAssignMenu.value;
  if (!m) return;
  assignServerToFolder(m.serverId, folderId);
}

function newFolderFromAssignMenu() {
  const m = folderAssignMenu.value;
  if (!m) return;
  newFolderWithServer(m.serverId);
}

function newFolderWithServer(serverId: string) {
  const name = window.prompt('New widget folder name', 'New folder');
  if (name === null) return;
  const f = addFolder(name);
  setServerFolderMembership(serverId, f.id);
  expandedFolders.value = { ...expandedFolders.value, [f.id]: true };
  openMenuId.value = null;
  closeFolderAssignMenu();
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
  closeFolderAssignMenu();
  openMenuId.value = openMenuId.value === id ? null : id;
}

function onLeaveServer(serverId: string) {
  emit('leave-server', serverId);
  openMenuId.value = null;
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
              class="widget-folder-card-rail mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-[color-mix(in_srgb,var(--border)_55%,transparent)] bg-[color-mix(in_srgb,var(--surface)_70%,transparent)] px-2 py-1.5"
            >
              <span
                class="text-[10px] font-bold uppercase tracking-wider text-fg-subtle"
                >Folder</span
              >
              <span
                class="min-w-0 flex-1 truncate text-sm font-semibold text-fg"
                >{{ item.folder.name }}</span
              >
              <div class="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  class="widget-folder-chip-btn"
                  @click.stop="onRenameWidgetFolder(item.folder.id)"
                >
                  Rename
                </button>
                <button
                  type="button"
                  class="widget-folder-chip-btn widget-folder-chip-btn--danger"
                  @click.stop="onDeleteWidgetFolder(item.folder.id)"
                >
                  Delete
                </button>
              </div>
            </div>
            <article
              v-else
              class="more-server-card overflow-hidden rounded-xl"
              :class="item.topSpacer ? 'mt-2' : ''"
            >
              <div
                class="more-server-card__banner h-[4.25rem] w-full shrink-0 bg-cover bg-no-repeat"
                :style="serverBannerStyle(item.server)"
              />
              <div class="more-server-card__body px-3 pb-3 pt-1.5">
                <div class="flex items-start gap-3">
                  <div
                    class="more-server-card__avatar-ring shrink-0 rounded-2xl p-0.5 shadow-md"
                  >
                    <PausedGifAvatar
                      :src="serverGuildIconDisplayUrl(item.server.icon)"
                      :alt="item.server.name"
                      img-class="h-12 w-12 rounded-[0.875rem] object-cover"
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
                <div class="mt-2.5 flex items-center gap-1.5">
                  <button
                    type="button"
                    class="open-btn flex-1"
                    @click="emit('open-server', item.server.id)"
                  >
                    Open
                  </button>
                  <button
                    type="button"
                    class="card-icon-btn"
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
                  <div class="relative">
                    <button
                      type="button"
                      class="card-icon-btn"
                      :class="
                        openMenuId === item.server.id
                          ? 'card-icon-btn--active'
                          : ''
                      "
                      title="More options"
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
                    <Transition name="menu">
                      <div
                        v-if="openMenuId === item.server.id"
                        class="server-menu"
                        @click.stop
                      >
                        <button
                          type="button"
                          class="server-menu__item"
                          @click="openServerInfo(item.server.id)"
                        >
                          View server info
                        </button>
                        <button
                          v-if="
                            props.canOpenInviteForServer?.(item.server.id) ??
                            false
                          "
                          type="button"
                          class="server-menu__item"
                          @click="inviteServer(item.server.id)"
                        >
                          Invite people
                        </button>
                        <button
                          type="button"
                          class="server-menu__item"
                          @click="togglePin(item.server)"
                        >
                          {{
                            isPinned(item.server.id)
                              ? 'Remove from rail'
                              : 'Pin to rail'
                          }}
                        </button>
                        <div class="server-menu__divider" />
                        <div class="server-menu__heading">Widget folder</div>
                        <button
                          v-if="folderForServer(item.server.id)"
                          type="button"
                          class="server-menu__item"
                          @click="assignServerToFolder(item.server.id, null)"
                        >
                          Remove from folder
                        </button>
                        <button
                          v-for="f in folders"
                          :key="f.id"
                          type="button"
                          class="server-menu__item"
                          @click="assignServerToFolder(item.server.id, f.id)"
                        >
                          Move to “{{ f.name }}”
                        </button>
                        <button
                          type="button"
                          class="server-menu__item"
                          @click="newFolderWithServer(item.server.id)"
                        >
                          New folder with this server…
                        </button>
                        <div class="server-menu__divider" />
                        <button
                          type="button"
                          class="server-menu__item server-menu__item--danger"
                          @click="onLeaveServer(item.server.id)"
                        >
                          Leave server
                        </button>
                      </div>
                    </Transition>
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
                : 'f-' + row.folder.id
            "
          >
            <div
              v-if="row.kind === 'server'"
              class="compact-slot relative flex w-full items-center justify-center"
              :class="rowIdx === 0 ? 'mt-3' : ''"
            >
              <span
                v-if="isPinned(row.server.id)"
                class="compact-pinned-dot"
                title="Pinned to rail"
              />
              <button
                type="button"
                class="compact-circle overflow-hidden"
                :title="row.server.name + ' — right-click for folder options'"
                @click="emit('open-server', row.server.id)"
                @contextmenu.prevent="openFolderAssignMenu(row.server, $event)"
              >
                <PausedGifAvatar
                  :src="serverGuildIconDisplayUrl(row.server.icon)"
                  :alt="row.server.name"
                  img-class="h-full w-full object-cover"
                />
              </button>
            </div>
            <div
              v-else
              class="widget-folder-compact flex w-full flex-col items-center gap-1"
            >
              <button
                type="button"
                class="widget-folder-pill"
                :aria-expanded="
                  expandedFolders[row.folder.id] ? 'true' : 'false'
                "
                :title="
                  row.folder.name +
                  ' — ' +
                  row.servers.length +
                  ' server(s). Click to expand.'
                "
                @click="toggleFolderExpanded(row.folder.id)"
              >
                <div class="widget-folder-pill__stack" aria-hidden="true">
                  <template v-if="row.servers.length">
                    <div
                      v-for="(s, si) in row.servers.slice(0, 3)"
                      :key="s.id + '-peek'"
                      class="widget-folder-pill__peek"
                      :style="{ zIndex: 10 - si, '--wf-nudge': si * 5 + 'px' }"
                    >
                      <PausedGifAvatar
                        :src="serverGuildIconDisplayUrl(s.icon)"
                        alt=""
                        img-class="h-full w-full object-cover"
                      />
                    </div>
                  </template>
                  <div
                    v-else
                    class="widget-folder-pill__empty-icon"
                    aria-hidden="true"
                  >
                    <svg
                      class="h-5 w-5 opacity-55"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="1.6"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"
                      />
                    </svg>
                  </div>
                </div>
                <span class="widget-folder-pill__count">{{
                  row.servers.length || '0'
                }}</span>
              </button>
              <div
                v-if="expandedFolders[row.folder.id]"
                class="widget-folder-expanded flex w-full flex-col items-center gap-1.5 pb-1"
              >
                <div class="widget-folder-toolbar">
                  <span
                    class="truncate px-1 text-[10px] font-semibold text-fg-subtle"
                    >{{ row.folder.name }}</span
                  >
                  <button
                    type="button"
                    class="widget-folder-tb"
                    @click.stop="onRenameWidgetFolder(row.folder.id)"
                  >
                    Rename
                  </button>
                  <button
                    type="button"
                    class="widget-folder-tb widget-folder-tb--danger"
                    @click.stop="onDeleteWidgetFolder(row.folder.id)"
                  >
                    Delete
                  </button>
                </div>
                <p
                  v-if="!row.servers.length"
                  class="px-1 text-center text-[10px] leading-snug text-fg-subtle"
                >
                  Empty — use ⋮ in full view or right-click a server to add
                  here.
                </p>
                <div
                  v-for="s in row.servers"
                  :key="'fe-' + s.id"
                  class="compact-slot relative flex w-full items-center justify-center"
                >
                  <span
                    v-if="isPinned(s.id)"
                    class="compact-pinned-dot"
                    title="Pinned to rail"
                  />
                  <button
                    type="button"
                    class="compact-circle overflow-hidden"
                    :title="s.name + ' — right-click for folder options'"
                    @click="emit('open-server', s.id)"
                    @contextmenu.prevent="openFolderAssignMenu(s, $event)"
                  >
                    <PausedGifAvatar
                      :src="serverGuildIconDisplayUrl(s.icon)"
                      :alt="s.name"
                      img-class="h-full w-full object-cover"
                    />
                  </button>
                </div>
              </div>
            </div>
          </template>
        </div>
      </div>
    </div>
    <Teleport to="body">
      <div
        v-if="folderAssignMenu"
        data-more-servers-folder-menu
        class="server-menu fixed z-[200] min-w-[188px] p-1"
        :style="folderMenuStyle"
        @mousedown.stop
      >
        <div class="server-menu__heading px-2 py-1">Widget folder</div>
        <button
          v-if="folderAssignMenu && folderForServer(folderAssignMenu.serverId)"
          type="button"
          class="server-menu__item"
          @click="assignServerToFolderFromMenu(null)"
        >
          Remove from folder
        </button>
        <button
          v-for="f in folders"
          :key="'fm-' + f.id"
          type="button"
          class="server-menu__item"
          @click="assignServerToFolderFromMenu(f.id)"
        >
          Move to “{{ f.name }}”
        </button>
        <button
          type="button"
          class="server-menu__item"
          @click="newFolderFromAssignMenu"
        >
          New folder with this server…
        </button>
      </div>
    </Teleport>
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

/* dropdown menu */
.server-menu {
  position: absolute;
  right: 0;
  bottom: calc(100% + 6px);
  z-index: 50;
  min-width: 160px;
  border-radius: 10px;
  background: var(--vue-auto-208);
  border: 1px solid var(--vue-auto-048);
  box-shadow:
    0 16px 40px var(--vue-auto-209),
    inset 0 1px 0 var(--vue-auto-007);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  padding: 4px;
  overflow: hidden;
}

.server-menu__item {
  display: block;
  width: 100%;
  text-align: left;
  padding: 0.45rem 0.65rem;
  border-radius: 6px;
  font-size: 0.8rem;
  font-weight: 500;
  color: var(--vue-auto-049);
  transition:
    background-color 0.12s ease-out,
    color 0.12s ease-out;
  &:hover {
    background: var(--vue-auto-001);
    color: var(--vue-auto-025);
  }
}

.server-menu__item--danger {
  color: var(--vue-auto-210);
  &:hover {
    background: var(--vue-auto-211);
    color: var(--vue-auto-068);
  }
}

.server-menu__divider {
  height: 1px;
  background: var(--vue-auto-002);
  margin: 3px 0;
}

.server-menu__heading {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--vue-auto-086);
  opacity: 0.88;
}

/* ── Extra servers: widget folders (Discord-like compact stacks) ── */
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

.menu-enter-active {
  transition:
    opacity 0.14s ease-out,
    transform 0.14s $ease-out-expo;
}
.menu-leave-active {
  transition:
    opacity 0.1s ease-out,
    transform 0.1s ease-in;
}
.menu-enter-from {
  opacity: 0;
  transform: translateY(4px) scale(0.97);
}
.menu-leave-to {
  opacity: 0;
  transform: translateY(2px) scale(0.98);
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
</style>
