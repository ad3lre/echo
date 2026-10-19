<script setup lang="ts">
import { echoT } from '@/i18n';
import { computed, inject, unref } from 'vue';
import { useCompactShell } from '@/features/layout/useCompactShell';
import { LAYOUT_CHAT_SURFACE_KEY } from '@/features/layout/layoutInjectionKeys';
import type { Editor } from '@tiptap/core';
import { icons } from '@/assets/icons';
import { copyToClipboard } from '@/features/chat/copyToClipboard';
import PaperChromeDropdown from '@/features/paper/components/PaperChromeDropdown.vue';
import type { MergedPaperWatchingPeer } from '@/features/paper/composables/mergePaperWatchingPeers';
import type { PaperConnectionPhase } from '@/features/paper/composables/usePaperSession';
import type { PaperSourceViewMode } from '@/features/paper/composables/usePaperSourceViewMode';
import type { PaperUiMode } from '@/features/paper/composables/usePaperUiMode';
import type { PaperShareSettingsPayload } from '@shared/types/paperShare';
import {
  PAPER_FONT_CATALOG,
  paperFontIdFromFamily,
} from '@/features/paper/editor/paperTypography';
import type { PaperShareVisibility } from '@shared/types/paperShare';
import { dispatchAppToast } from '@/features/layout/failures/controllerMissingAction';
import type { PaperAppearanceMode } from '@/features/paper/composables/usePaperAppearance';
import {
  paperAppearanceCanvasLabel,
  paperAppearanceShortLabel,
} from '@/features/paper/editor/paperPageAppearance';

const props = defineProps<{
  paperAppearance?: PaperAppearanceMode;
  channelName: string;
  connectionPhase: PaperConnectionPhase;
  connectionTooltip: string;
  viewOnlyHint?: string;
  conflict?: boolean;
  watchingPeers: MergedPaperWatchingPeer[];
  totalWatching: number;
  resolveUserAvatar: (userId: string) => string | undefined;
  editor: Editor | null;
  uiMode: PaperUiMode;
  modeLabel: string;
  modeOptions: { id: PaperUiMode; label: string; hint: string }[];
  share: {
    settings: PaperShareSettingsPayload | null;
    shareLink: string;
    saving: boolean;
    loading?: boolean;
    error?: string | null;
    setVisibility: (v: PaperShareVisibility) => void;
    load: () => void | Promise<void>;
  };
  showConnectionStatus?: boolean;
  canOpenSettings?: boolean;
  canCustomizeTypography?: boolean;
  canDownload?: boolean;
  paperPageColorLight?: string | null;
  paperPageColorDark?: string | null;
  documentFontFamily?: string;
  commentCount?: number;
  commentsVisible?: boolean;
  canToggleComments?: boolean;
  canReconnect?: boolean;
  floating?: boolean;
  sourceViewMode?: PaperSourceViewMode;
}>();

const emit = defineEmits<{
  openSettings: [];
  toggleComments: [];
  reconnect: [];
  documentFontChange: [fontId: string];
  setUiMode: [mode: PaperUiMode];
  downloadPdf: [];
  downloadJson: [];
  copyPlainText: [];
  togglePaperAppearance: [];
  paperPageColorLight: [hex: string];
  paperPageColorDark: [hex: string];
  toggleSourceView: [];
}>();

const layoutChat = inject(LAYOUT_CHAT_SURFACE_KEY, null);
const { isCompactShell } = useCompactShell();

const channelPanelCollapsed = computed(
  () => !!unref(layoutChat?.channelPanelCollapsed),
);

const compactGuildTriPaneNav = computed(
  () => !!unref(layoutChat?.compactGuildTriPaneNav),
);

const expandChannels = computed(() => {
  const fn = layoutChat?.expandChannels;
  return fn ? unref(fn) : undefined;
});

const showMobileBackToChannels = computed(
  () => isCompactShell.value && typeof expandChannels.value === 'function',
);

const showRevealChannelList = computed(
  () =>
    !compactGuildTriPaneNav.value &&
    !isCompactShell.value &&
    channelPanelCollapsed.value &&
    typeof expandChannels.value === 'function',
);

function revealChannelList() {
  expandChannels.value?.();
}

const TITLE_MAX = 32;

const displayTitle = computed(() => {
  const name = props.channelName.trim();
  if (name.length <= TITLE_MAX) return name;
  return `${name.slice(0, TITLE_MAX - 1)}…`;
});

const subtitle = computed(() => {
  if (props.viewOnlyHint) return props.viewOnlyHint;
  if (props.conflict) return echoT('b06.docChrome.updatedElsewhere');
  return null;
});

function peerAvatarUrl(peer: MergedPaperWatchingPeer) {
  return peer.avatarUrl || props.resolveUserAvatar(peer.userId);
}

const appearanceTitle = computed(() =>
  paperAppearanceCanvasLabel(props.paperAppearance ?? 'light'),
);

const appearanceLabel = computed(() =>
  paperAppearanceShortLabel(props.paperAppearance ?? 'light'),
);

const showCommentsToggle = computed(() => (props.commentCount ?? 0) > 0);

const sourceViewMode = computed(() => props.sourceViewMode ?? 'inline');

const sourceViewToggleTitle = computed(() =>
  sourceViewMode.value === 'inline'
    ? echoT('b06.docChrome.renderedPreviewTitle')
    : echoT('b06.docChrome.markdownSourceTitle'),
);

function modeIcon(id: PaperUiMode): string {
  if (id === 'edit') return icons.pen;
  if (id === 'comment') return icons.messageAlt;
  return icons.profileView;
}

const documentFontId = computed(() =>
  paperFontIdFromFamily(props.documentFontFamily),
);

const canUndo = computed(
  () => props.uiMode === 'edit' && !!props.editor?.can().undo(),
);
const canRedo = computed(
  () => props.uiMode === 'edit' && !!props.editor?.can().redo(),
);

const statusDotClass = computed(() => {
  switch (props.connectionPhase) {
    case 'synced':
      return 'paper-status-dot paper-status-dot--synced';
    case 'syncing':
      return 'paper-status-dot paper-status-dot--syncing';
    case 'conflict':
      return 'paper-status-dot paper-status-dot--error';
    case 'offline':
      return 'paper-status-dot paper-status-dot--offline';
    case 'error':
      return 'paper-status-dot paper-status-dot--error';
    default:
      return 'paper-status-dot';
  }
});

const shareVisibilityOptions = computed<
  { id: PaperShareVisibility; label: string }[]
>(() => [
  { id: 'server', label: echoT('b06.docChrome.visServer') },
  { id: 'private', label: echoT('b06.docChrome.visPrivate') },
  { id: 'global', label: echoT('b06.docChrome.visGlobal') },
]);

async function copyShareLink(link: string) {
  if (!link) return;
  const ok = await copyToClipboard(link);
  dispatchAppToast(
    ok
      ? echoT('b06.docChrome.linkCopied')
      : echoT('b06.docChrome.linkCopyFailed'),
    ok ? 'success' : 'warning',
  );
}

function onUndo() {
  props.editor?.chain().focus().undo().run();
}

function onRedo() {
  props.editor?.chain().focus().redo().run();
}
</script>

<template>
  <header
    class="paper-doc-chrome"
    :class="{ 'paper-doc-chrome--floating': floating !== false }"
  >
    <div class="paper-doc-chrome__left">
      <button
        v-if="showMobileBackToChannels"
        type="button"
        class="paper-chrome-btn shrink-0"
        :title="echoT('b06.docChrome.backToChannelList')"
        :aria-label="echoT('b06.docChrome.backToChannelList')"
        @click="revealChannelList"
      >
        <img
          :src="icons.arrowLeft"
          alt=""
          class="h-4 w-4 opacity-80 paper-chrome-icon"
        />
      </button>
      <button
        v-else-if="showRevealChannelList"
        type="button"
        class="paper-chrome-btn shrink-0"
        :title="echoT('b06.docChrome.showChannels')"
        :aria-label="echoT('b06.docChrome.showChannels')"
        @click="revealChannelList"
      >
        <img
          :src="icons.list"
          alt=""
          class="h-4 w-4 opacity-80 paper-chrome-icon"
        />
      </button>

      <!-- File -->
      <PaperChromeDropdown
        :label="echoT('b06.docChrome.file')"
        :title="echoT('b06.docChrome.fileActions')"
        align="left"
      >
        <template #icon>
          <img
            :src="icons.file"
            alt=""
            class="h-4 w-4 opacity-80 paper-chrome-icon"
          />
        </template>
        <template #default="{ close }">
          <button
            v-if="canDownload !== false"
            type="button"
            class="paper-chrome-menu-item paper-chrome-menu-item--icon"
            @click.stop="
              emit('downloadPdf');
              close();
            "
          >
            <svg
              class="paper-chrome-menu-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              aria-hidden="true"
            >
              <path
                d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"
              />
              <path d="M14 2v6h6M12 18v-6M9 15l3 3 3-3" />
            </svg>
            <span>
              <span class="font-medium">{{
                echoT('b06.docChrome.downloadPdf')
              }}</span>
              <span class="block text-[11px] paper-chrome-subtext">{{
                echoT('b06.docChrome.downloadPdfHint')
              }}</span>
            </span>
          </button>
          <button
            v-if="canDownload !== false"
            type="button"
            class="paper-chrome-menu-item paper-chrome-menu-item--icon"
            @click.stop="
              emit('downloadJson');
              close();
            "
          >
            <svg
              class="paper-chrome-menu-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              aria-hidden="true"
            >
              <path
                d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"
              />
              <path d="M14 2v6h6M8 13h2M8 17h8M8 9h1" />
            </svg>
            <span>
              <span class="font-medium">{{
                echoT('b06.docChrome.downloadJson')
              }}</span>
              <span class="block text-[11px] paper-chrome-subtext">{{
                echoT('b06.docChrome.downloadJsonHint')
              }}</span>
            </span>
          </button>
          <button
            v-if="canDownload !== false"
            type="button"
            class="paper-chrome-menu-item paper-chrome-menu-item--icon"
            @click.stop="
              emit('copyPlainText');
              close();
            "
          >
            <svg
              class="paper-chrome-menu-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              aria-hidden="true"
            >
              <rect x="9" y="9" width="13" height="13" rx="2" />
              <path
                d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"
              />
            </svg>
            <span>
              <span class="font-medium">{{
                echoT('b06.docChrome.copyPlainText')
              }}</span>
              <span class="block text-[11px] paper-chrome-subtext">{{
                echoT('b06.docChrome.copyPlainTextHint')
              }}</span>
            </span>
          </button>
        </template>
      </PaperChromeDropdown>

      <div
        class="paper-chrome-history"
        role="group"
        :aria-label="echoT('b06.docChrome.undoRedo')"
      >
        <button
          type="button"
          class="paper-chrome-btn"
          :title="echoT('b06.docChrome.undo')"
          :aria-label="echoT('b06.docChrome.undo')"
          :disabled="!canUndo"
          @click="onUndo"
        >
          <svg
            class="h-4 w-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path d="M3 10h13a4 4 0 0 1 0 8H7" />
            <path d="M3 10l4-4M3 10l4 4" />
          </svg>
        </button>
        <button
          type="button"
          class="paper-chrome-btn"
          :title="echoT('b06.docChrome.redo')"
          :aria-label="echoT('b06.docChrome.redo')"
          :disabled="!canRedo"
          @click="onRedo"
        >
          <svg
            class="h-4 w-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path d="M21 10H8a4 4 0 0 0 0 8h9" />
            <path d="M21 10l-4-4M21 10l-4 4" />
          </svg>
        </button>
      </div>

      <div
        class="paper-chrome-toolbar hidden md:flex"
        :aria-label="echoT('b06.docChrome.canvasView')"
      >
        <button
          type="button"
          class="paper-chrome-pill"
          :title="appearanceTitle"
          :aria-label="appearanceTitle"
          @click="emit('togglePaperAppearance')"
        >
          <svg
            v-if="paperAppearance === 'dark' || paperAppearance === 'amoled'"
            class="paper-chrome-pill__icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            aria-hidden="true"
          >
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
          </svg>
          <svg
            v-else-if="paperAppearance === 'sunny'"
            class="paper-chrome-pill__icon paper-chrome-pill__icon--sunny"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="5" />
            <line x1="12" y1="1" x2="12" y2="3" />
            <line x1="12" y1="21" x2="12" y2="23" />
            <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
            <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
            <line x1="1" y1="12" x2="3" y2="12" />
            <line x1="21" y1="12" x2="23" y2="12" />
          </svg>
          <svg
            v-else
            class="paper-chrome-pill__icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="5" />
            <line x1="12" y1="1" x2="12" y2="3" />
            <line x1="12" y1="21" x2="12" y2="23" />
            <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
            <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
            <line x1="1" y1="12" x2="3" y2="12" />
            <line x1="21" y1="12" x2="23" y2="12" />
          </svg>
          <span class="paper-chrome-pill__label">{{ appearanceLabel }}</span>
        </button>

        <button
          type="button"
          class="paper-chrome-pill"
          :class="{ 'paper-chrome-pill--active': sourceViewMode === 'raw' }"
          :title="sourceViewToggleTitle"
          :aria-label="sourceViewToggleTitle"
          @click="emit('toggleSourceView')"
        >
          <svg
            v-if="sourceViewMode === 'inline'"
            class="paper-chrome-pill__icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            aria-hidden="true"
          >
            <path
              d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"
            />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
          </svg>
          <svg
            v-else
            class="paper-chrome-pill__icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            aria-hidden="true"
          >
            <polyline points="16 18 22 12 16 6" />
            <polyline points="8 6 2 12 8 18" />
          </svg>
          <span class="paper-chrome-pill__label">{{
            sourceViewMode === 'inline'
              ? echoT('b06.docChrome.rendered')
              : echoT('b06.docChrome.raw')
          }}</span>
        </button>
      </div>
    </div>

    <div class="paper-doc-chrome__center">
      <h1 class="paper-doc-chrome__title" :title="channelName">
        {{ displayTitle }}
      </h1>
      <p v-if="subtitle" class="paper-doc-chrome__subtitle">{{ subtitle }}</p>
    </div>

    <div class="paper-doc-chrome__right">
      <button
        v-if="canToggleComments && showCommentsToggle"
        type="button"
        class="paper-chrome-btn paper-chrome-btn--comments"
        :class="{ 'paper-chrome-btn--active': commentsVisible }"
        :title="
          commentsVisible
            ? echoT('b06.docChrome.hideComments')
            : echoT('b06.docChrome.showComments')
        "
        :aria-pressed="commentsVisible"
        @click="emit('toggleComments')"
      >
        <span class="paper-chrome-btn__glyph" aria-hidden="true">
          <svg
            class="h-4 w-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path
              d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"
            />
          </svg>
        </span>
        <span
          v-if="commentCount && commentCount > 0"
          class="paper-chrome-btn__badge"
        >
          {{ commentCount > 9 ? '9+' : commentCount }}
        </span>
      </button>

      <div
        v-if="watchingPeers.length"
        class="paper-doc-chrome__presence"
        :title="
          totalWatching > watchingPeers.length
            ? echoT('b06.docChrome.peopleViewing', { count: totalWatching })
            : echoT('b06.docChrome.viewing', { count: totalWatching })
        "
      >
        <div class="paper-doc-chrome__presence-stack">
          <div
            v-for="(peer, index) in watchingPeers"
            :key="peer.userId"
            class="paper-doc-chrome__presence-avatar"
            :class="{
              'paper-doc-chrome__presence-avatar--authoring': peer.isAuthoring,
            }"
            :style="{
              zIndex: watchingPeers.length - index,
              '--presence-ring': peer.color,
            }"
            :title="peer.name"
          >
            <img
              v-if="peerAvatarUrl(peer)"
              :src="peerAvatarUrl(peer)"
              alt=""
              class="paper-doc-chrome__presence-photo"
            />
            <div
              v-else
              class="paper-doc-chrome__presence-initial"
              :style="{ backgroundColor: peer.color }"
            >
              {{ peer.name.slice(0, 1).toUpperCase() }}
            </div>
          </div>
          <span
            v-if="totalWatching > watchingPeers.length"
            class="paper-doc-chrome__presence-overflow"
            :style="{ zIndex: 0 }"
          >
            +{{ totalWatching - watchingPeers.length }}
          </span>
        </div>
      </div>

      <PaperChromeDropdown
        v-if="modeOptions.length > 1"
        class="hidden md:block"
        :label="modeLabel"
        :title="echoT('b06.docChrome.documentMode')"
        align="right"
      >
        <template #icon>
          <img
            :src="modeIcon(uiMode)"
            alt=""
            class="h-4 w-4 opacity-80 paper-chrome-icon"
          />
        </template>
        <template #default="{ close }">
          <button
            v-for="opt in modeOptions"
            :key="opt.id"
            type="button"
            class="paper-chrome-menu-item paper-chrome-menu-item--icon"
            :class="{ 'paper-chrome-menu-item--active': uiMode === opt.id }"
            @click.stop="
              emit('setUiMode', opt.id);
              close();
            "
          >
            <img
              :src="modeIcon(opt.id)"
              alt=""
              class="paper-chrome-menu-icon-img"
            />
            <span>
              <span class="font-medium">{{ opt.label }}</span>
              <span class="block text-[11px] paper-chrome-subtext">{{
                opt.hint
              }}</span>
            </span>
          </button>
        </template>
      </PaperChromeDropdown>

      <PaperChromeDropdown
        class="hidden md:block"
        :label="echoT('paperUi.share')"
        :title="echoT('b06.docChrome.shareDocument')"
        align="right"
      >
        <template #icon>
          <img
            :src="icons.globe"
            alt=""
            class="h-4 w-4 opacity-80 paper-chrome-icon"
          />
        </template>
        <template #default>
          <div class="px-3 py-2" @click.stop>
            <p
              class="text-[11px] font-medium uppercase tracking-wide paper-chrome-subtext"
            >
              {{ echoT('b06.docChrome.whoCanOpen') }}
            </p>
            <p
              v-if="share.loading"
              class="mt-2 flex items-center gap-2 text-xs paper-chrome-subtext"
            >
              <span
                class="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-[color:var(--paper-surface-muted)] border-t-transparent"
                aria-hidden="true"
              />
              {{ echoT('b06.docChrome.loadingShare') }}
            </p>
            <p v-else-if="share.error" class="mt-2 text-xs text-red-400">
              {{ share.error }}
              <button
                type="button"
                class="ml-1 underline"
                @click.stop="share.load()"
              >
                {{ echoT('b06.docChrome.retry') }}
              </button>
            </p>
            <template v-else-if="share.settings?.canManageShare">
              <label
                v-for="opt in shareVisibilityOptions"
                :key="opt.id"
                class="mt-2 flex cursor-pointer items-start gap-2 rounded-lg px-2 py-1.5 hover:bg-glass-hover"
              >
                <input
                  type="radio"
                  name="paper-share-vis"
                  class="mt-0.5"
                  :value="opt.id"
                  :checked="share.settings?.visibility === opt.id"
                  :disabled="share.saving"
                  @change="share.setVisibility(opt.id)"
                />
                <span class="text-xs text-fg">{{ opt.label }}</span>
              </label>
            </template>
            <p
              v-else-if="share.settings"
              class="mt-2 rounded-lg bg-glass-2 px-2 py-1.5 text-xs text-fg"
            >
              <strong>{{ share.settings.audience.headline }}</strong>
              — {{ share.settings.audience.detail }}
            </p>
            <div
              v-if="!share.loading && !share.error"
              class="mt-3 flex flex-col gap-1.5"
            >
              <input
                type="text"
                readonly
                class="w-full rounded-lg border border-border bg-glass-2 px-2 py-1.5 text-[11px] text-fg"
                :value="share.shareLink"
                @click.stop
              />
              <button
                type="button"
                class="paper-chrome-menu-action paper-chrome-menu-action--icon"
                :disabled="!share.shareLink"
                @click.stop="copyShareLink(share.shareLink)"
              >
                <svg
                  class="h-4 w-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  aria-hidden="true"
                >
                  <rect x="9" y="9" width="13" height="13" rx="2" />
                  <path
                    d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"
                  />
                </svg>
                {{ echoT('b06.docChrome.copyLink') }}
              </button>
            </div>
          </div>
        </template>
      </PaperChromeDropdown>

      <PaperChromeDropdown
        class="md:hidden"
        :label="echoT('b06.docChrome.more')"
        :title="echoT('b06.docChrome.moreActions')"
        align="right"
      >
        <template #default="{ close }">
          <div
            v-if="modeOptions.length > 1"
            class="border-b border-border px-3 py-2 md:hidden"
            @click.stop
          >
            <p
              class="text-[11px] font-medium uppercase tracking-wide paper-chrome-subtext"
            >
              {{ echoT('b06.docChrome.documentMode') }}
            </p>
            <button
              v-for="opt in modeOptions"
              :key="`more-mode-${opt.id}`"
              type="button"
              class="paper-chrome-menu-item paper-chrome-menu-item--icon mt-1 w-full"
              :class="{ 'paper-chrome-menu-item--active': uiMode === opt.id }"
              @click.stop="
                emit('setUiMode', opt.id);
                close();
              "
            >
              <img
                :src="modeIcon(opt.id)"
                alt=""
                class="paper-chrome-menu-icon-img"
              />
              <span>
                <span class="font-medium">{{ opt.label }}</span>
                <span class="block text-[11px] paper-chrome-subtext">{{
                  opt.hint
                }}</span>
              </span>
            </button>
          </div>
          <button
            type="button"
            class="paper-chrome-menu-item paper-chrome-menu-item--icon md:hidden"
            @click.stop="
              emit('toggleSourceView');
              close();
            "
          >
            <svg
              v-if="sourceViewMode === 'inline'"
              class="paper-chrome-menu-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              aria-hidden="true"
            >
              <path
                d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"
              />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
            </svg>
            <svg
              v-else
              class="paper-chrome-menu-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              aria-hidden="true"
            >
              <polyline points="16 18 22 12 16 6" />
              <polyline points="8 6 2 12 8 18" />
            </svg>
            <span>
              <span class="font-medium">{{
                sourceViewMode === 'inline'
                  ? echoT('b06.docChrome.rendered')
                  : echoT('b06.docChrome.raw')
              }}</span>
              <span class="block text-[11px] paper-chrome-subtext">{{
                sourceViewMode === 'inline'
                  ? echoT('b06.docChrome.tapMarkdown')
                  : echoT('b06.docChrome.tapRendered')
              }}</span>
            </span>
          </button>
          <div class="border-t border-border px-3 py-2 md:hidden" @click.stop>
            <p
              class="text-[11px] font-medium uppercase tracking-wide paper-chrome-subtext"
            >
              {{ echoT('paperUi.share') }}
            </p>
            <p v-if="share.loading" class="mt-1 text-xs paper-chrome-subtext">
              {{ echoT('b06.docChrome.loading') }}
            </p>
            <p v-else-if="share.error" class="mt-1 text-xs text-red-400">
              {{ share.error }}
            </p>
            <template v-else-if="share.settings?.canManageShare">
              <label
                v-for="opt in shareVisibilityOptions"
                :key="`m-${opt.id}`"
                class="mt-1 flex cursor-pointer items-start gap-2 text-xs"
              >
                <input
                  type="radio"
                  name="paper-share-vis-m"
                  class="mt-0.5"
                  :value="opt.id"
                  :checked="share.settings?.visibility === opt.id"
                  :disabled="share.saving"
                  @change="share.setVisibility(opt.id)"
                />
                {{ opt.label }}
              </label>
            </template>
            <p
              v-else-if="share.settings"
              class="mt-1 text-xs paper-chrome-subtext"
            >
              {{ share.settings.audience.detail }}
            </p>
            <button
              type="button"
              class="paper-chrome-menu-action mt-2"
              :disabled="!share.shareLink"
              @click.stop="copyShareLink(share.shareLink)"
            >
              {{ echoT('b06.docChrome.copyLink') }}
            </button>
          </div>
          <template v-if="canDownload !== false">
            <button
              type="button"
              class="paper-chrome-menu-item paper-chrome-menu-item--icon"
              @click.stop="
                emit('downloadPdf');
                close();
              "
            >
              {{ echoT('b06.docChrome.downloadPdfEllipsis') }}
            </button>
            <button
              type="button"
              class="paper-chrome-menu-item paper-chrome-menu-item--icon"
              @click.stop="
                emit('downloadJson');
                close();
              "
            >
              {{ echoT('b06.docChrome.downloadJson') }}
            </button>
            <button
              type="button"
              class="paper-chrome-menu-item paper-chrome-menu-item--icon"
              @click.stop="
                emit('copyPlainText');
                close();
              "
            >
              {{ echoT('b06.docChrome.copyPlainText') }}
            </button>
          </template>
        </template>
      </PaperChromeDropdown>

      <span
        v-if="showConnectionStatus !== false"
        class="inline-flex items-center gap-1"
      >
        <button
          v-if="canReconnect"
          type="button"
          class="paper-chrome-btn"
          :title="echoT('b06.docChrome.retryConnection')"
          :aria-label="echoT('b06.docChrome.retryConnection')"
          @click="emit('reconnect')"
        >
          <svg
            class="h-4 w-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path d="M21 12a9 9 0 1 1-2.64-6.36" />
            <path d="M21 3v6h-6" />
          </svg>
        </button>
        <span
          class="inline-flex items-center gap-1.5"
          :title="connectionTooltip"
          :aria-label="connectionTooltip"
        >
          <span :class="statusDotClass" aria-hidden="true" />
        </span>
      </span>

      <button
        v-if="canOpenSettings"
        type="button"
        class="paper-chrome-btn"
        :title="echoT('b06.docChrome.channelSettings')"
        :aria-label="echoT('b06.docChrome.channelSettings')"
        @click="emit('openSettings')"
      >
        <img
          :src="icons.settings"
          alt=""
          class="h-4 w-4 opacity-80 paper-chrome-icon"
        />
      </button>
    </div>

    <p class="sr-only" aria-live="polite" aria-atomic="true">
      {{ connectionTooltip }}
    </p>
  </header>
</template>

<style scoped src="./styles/PaperDocChrome.scss"></style>
