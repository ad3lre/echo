<script setup lang="ts">
import { computed } from 'vue';
import type { Editor } from '@tiptap/core';
import { icons } from '@/assets/icons';
import { copyToClipboard } from '@/features/chat/composables/useMessageLinkActions';
import PaperChromeDropdown from '@/features/paper/components/PaperChromeDropdown.vue';
import type { MergedPaperWatchingPeer } from '@/features/paper/composables/mergePaperWatchingPeers';
import type { PaperConnectionPhase } from '@/features/paper/composables/usePaperSession';
import type { PaperSourceViewMode } from '@/features/paper/composables/usePaperSourceViewMode';
import { paperSourceViewKeybindLabel } from '@/features/paper/composables/usePaperSourceViewKeybind';
import type { PaperUiMode } from '@/features/paper/composables/usePaperUiMode';
import type { PaperShareSettingsPayload } from '@shared/types/paperShare';
import {
  PAPER_FONT_CATALOG,
  paperFontIdFromFamily,
} from '@/features/paper/editor/paperTypography';
import type { PaperShareVisibility } from '@shared/types/paperShare';
import { dispatchAppToast } from '@/utils/controllerMissingAction';

const props = defineProps<{
  paperAppearance?: 'light' | 'dark';
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

const TITLE_MAX = 32;

const displayTitle = computed(() => {
  const name = props.channelName.trim();
  if (name.length <= TITLE_MAX) return name;
  return `${name.slice(0, TITLE_MAX - 1)}…`;
});

const subtitle = computed(() => {
  if (props.viewOnlyHint) return props.viewOnlyHint;
  if (props.conflict) return 'Updated elsewhere — showing latest version';
  return null;
});

const appearanceTitle = computed(() =>
  props.paperAppearance === 'dark'
    ? 'Paper dark preview (canvas only)'
    : 'Paper light preview (canvas only)',
);

const sourceViewMode = computed(() => props.sourceViewMode ?? 'inline');

const sourceViewKeybind = paperSourceViewKeybindLabel();

const sourceViewTitle = computed(() =>
  sourceViewMode.value === 'inline'
    ? `Rendered preview — formatted document. Click or ${sourceViewKeybind} for markdown source.`
    : `Markdown source — full document as text. Click or ${sourceViewKeybind} for rendered preview.`,
);

const sourceViewLabel = computed(() =>
  sourceViewMode.value === 'inline' ? 'Rendered' : 'Raw',
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

const shareVisibilityOptions: {
  id: PaperShareVisibility;
  label: string;
}[] = [
  { id: 'server', label: 'Server members (RBAC)' },
  { id: 'private', label: 'Authors only' },
  { id: 'global', label: 'Anyone with link' },
];

async function copyShareLink(link: string) {
  if (!link) return;
  const ok = await copyToClipboard(link);
  dispatchAppToast(
    ok ? 'Link copied to clipboard' : 'Could not copy link',
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
        type="button"
        class="paper-chrome-btn"
        :title="appearanceTitle"
        :aria-label="appearanceTitle"
        @click="emit('togglePaperAppearance')"
      >
        <img
          :src="paperAppearance === 'dark' ? icons.sun : icons.moon"
          alt=""
          class="h-4 w-4 opacity-85 paper-chrome-icon"
        />
      </button>

      <button
        type="button"
        class="paper-chrome-btn paper-chrome-btn--source-view hidden sm:inline-flex"
        :class="{ 'paper-chrome-btn--active': sourceViewMode === 'inline' }"
        :title="sourceViewTitle"
        :aria-label="sourceViewTitle"
        :aria-pressed="sourceViewMode === 'inline'"
        @click="emit('toggleSourceView')"
      >
        <span class="paper-chrome-btn__source-label">{{
          sourceViewLabel
        }}</span>
      </button>

      <PaperChromeDropdown label="File" title="File actions" align="left">
        <template #icon>
          <img
            :src="icons.file"
            alt=""
            class="h-4 w-4 opacity-80 paper-chrome-icon"
          />
        </template>
        <template #default="{ close }">
          <template v-if="canCustomizeTypography">
            <div class="border-b border-border px-3 py-2" @click.stop>
              <p class="text-[11px] font-medium text-fg-subtle">Page colors</p>
              <label
                class="mt-2 flex items-center justify-between gap-2 text-xs"
              >
                Light mode
                <input
                  type="color"
                  class="h-7 w-10 cursor-pointer rounded border border-border"
                  :value="paperPageColorLight ?? '#ffffff'"
                  @input="
                    emit(
                      'paperPageColorLight',
                      ($event.target as HTMLInputElement).value,
                    )
                  "
                />
              </label>
              <label
                class="mt-1.5 flex items-center justify-between gap-2 text-xs"
              >
                Dark mode
                <input
                  type="color"
                  class="h-7 w-10 cursor-pointer rounded border border-border"
                  :value="paperPageColorDark ?? '#16161c'"
                  @input="
                    emit(
                      'paperPageColorDark',
                      ($event.target as HTMLInputElement).value,
                    )
                  "
                />
              </label>
            </div>
          </template>
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
              <span class="font-medium">Download as PDF</span>
              <span class="block text-[11px] text-fg-subtle"
                >Print or save as PDF</span
              >
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
              <span class="font-medium">Download JSON</span>
              <span class="block text-[11px] text-fg-subtle"
                >Full document data</span
              >
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
              <span class="font-medium">Copy plain text</span>
              <span class="block text-[11px] text-fg-subtle"
                >Text only, no formatting</span
              >
            </span>
          </button>
          <label
            v-if="canCustomizeTypography"
            class="paper-chrome-menu-item flex flex-col gap-1 border-t border-border"
            @click.stop
          >
            <span class="text-[11px] font-medium text-fg-subtle"
              >Document font</span
            >
            <select
              class="paper-chrome-font-select w-full"
              :value="documentFontId"
              @change="
                emit(
                  'documentFontChange',
                  ($event.target as HTMLSelectElement).value,
                )
              "
            >
              <option
                v-for="font in PAPER_FONT_CATALOG"
                :key="font.id"
                :value="font.id"
                v-bind="font.attributes"
                :style="{ fontFamily: font.family }"
              >
                {{ font.label }}
              </option>
            </select>
          </label>
        </template>
      </PaperChromeDropdown>

      <div class="paper-chrome-history" role="group" aria-label="Undo and redo">
        <button
          type="button"
          class="paper-chrome-btn"
          title="Undo"
          aria-label="Undo"
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
          title="Redo"
          aria-label="Redo"
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
    </div>

    <div class="paper-doc-chrome__center">
      <h1 class="paper-doc-chrome__title" :title="channelName">
        {{ displayTitle }}
      </h1>
      <p v-if="subtitle" class="paper-doc-chrome__subtitle">{{ subtitle }}</p>
    </div>

    <div class="paper-doc-chrome__right">
      <button
        v-if="canToggleComments"
        type="button"
        class="paper-chrome-btn paper-chrome-btn--comments"
        :class="{ 'paper-chrome-btn--active': commentsVisible }"
        :title="commentsVisible ? 'Hide comments' : 'Show comments'"
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
        class="paper-doc-chrome__presence hidden lg:flex"
        :title="
          totalWatching > watchingPeers.length
            ? `${totalWatching} people here`
            : `${totalWatching} here now`
        "
      >
        <div class="flex items-center -space-x-1.5">
          <div
            v-for="peer in watchingPeers"
            :key="peer.userId"
            class="h-6 w-6 overflow-hidden rounded-full border-2"
            :style="{
              borderColor: peer.color,
              boxShadow: `0 0 0 1px ${peer.color}44`,
            }"
            :title="peer.name"
          >
            <img
              v-if="resolveUserAvatar(peer.userId)"
              :src="resolveUserAvatar(peer.userId)"
              alt=""
              class="h-full w-full object-cover"
            />
            <div
              v-else
              class="flex h-full w-full items-center justify-center text-[8px] font-semibold text-white"
              :style="{ backgroundColor: peer.color }"
            >
              {{ peer.name.slice(0, 1).toUpperCase() }}
            </div>
          </div>
          <span
            v-if="totalWatching > watchingPeers.length"
            class="flex h-6 min-w-6 items-center justify-center rounded-full border border-border bg-elevated px-1 text-[9px] font-semibold text-fg-subtle"
          >
            +{{ totalWatching - watchingPeers.length }}
          </span>
        </div>
      </div>

      <PaperChromeDropdown
        v-if="modeOptions.length > 1"
        class="hidden md:block"
        :label="modeLabel"
        title="Document mode"
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
              <span class="block text-[11px] text-fg-subtle">{{
                opt.hint
              }}</span>
            </span>
          </button>
        </template>
      </PaperChromeDropdown>

      <PaperChromeDropdown
        class="hidden md:block"
        label="Share"
        title="Share document"
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
              class="text-[11px] font-medium uppercase tracking-wide text-fg-subtle"
            >
              Who can open this link
            </p>
            <p
              v-if="share.loading"
              class="mt-2 flex items-center gap-2 text-xs text-fg-subtle"
            >
              <span
                class="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-fg-subtle border-t-transparent"
                aria-hidden="true"
              />
              Loading share settings…
            </p>
            <p v-else-if="share.error" class="mt-2 text-xs text-red-400">
              {{ share.error }}
              <button
                type="button"
                class="ml-1 underline"
                @click.stop="share.load()"
              >
                Retry
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
                Copy link
              </button>
            </div>
          </div>
        </template>
      </PaperChromeDropdown>

      <PaperChromeDropdown
        class="md:hidden"
        label="More"
        title="More actions"
        align="right"
      >
        <template #default="{ close }">
          <button
            v-for="opt in modeOptions"
            :key="`more-mode-${opt.id}`"
            type="button"
            class="paper-chrome-menu-item md:hidden"
            :class="{ 'paper-chrome-menu-item--active': uiMode === opt.id }"
            @click.stop="
              emit('setUiMode', opt.id);
              close();
            "
          >
            {{ opt.label }}
          </button>
          <button
            type="button"
            class="paper-chrome-menu-item md:hidden"
            @click.stop="
              emit('toggleSourceView');
              close();
            "
          >
            <span class="font-medium">{{ sourceViewLabel }} view</span>
            <span class="block text-[11px] text-fg-subtle">{{
              sourceViewMode === 'inline'
                ? 'Switch to full markdown source'
                : 'Switch to rendered preview'
            }}</span>
          </button>
          <div class="border-t border-border px-3 py-2 md:hidden" @click.stop>
            <p
              class="text-[11px] font-medium uppercase tracking-wide text-fg-subtle"
            >
              Share
            </p>
            <p v-if="share.loading" class="mt-1 text-xs text-fg-subtle">
              Loading…
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
            <p v-else-if="share.settings" class="mt-1 text-xs text-fg-subtle">
              {{ share.settings.audience.detail }}
            </p>
            <button
              type="button"
              class="paper-chrome-menu-action mt-2"
              :disabled="!share.shareLink"
              @click.stop="copyShareLink(share.shareLink)"
            >
              Copy link
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
              Download as PDF…
            </button>
            <button
              type="button"
              class="paper-chrome-menu-item paper-chrome-menu-item--icon"
              @click.stop="
                emit('downloadJson');
                close();
              "
            >
              Download JSON
            </button>
            <button
              type="button"
              class="paper-chrome-menu-item paper-chrome-menu-item--icon"
              @click.stop="
                emit('copyPlainText');
                close();
              "
            >
              Copy plain text
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
          title="Retry connection"
          aria-label="Retry connection"
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
        title="Channel settings"
        aria-label="Channel settings"
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

<style scoped>
.paper-doc-chrome {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  gap: 0.5rem 0.75rem;
  min-height: 3rem;
  padding: 0.375rem 0.75rem;
}

@media (min-width: 768px) {
  .paper-doc-chrome {
    padding: 0.375rem 1.25rem;
    gap: 0.5rem 1rem;
  }
}

.paper-doc-chrome--floating {
  z-index: 30;
  flex-shrink: 0;
  border-bottom: 1px solid color-mix(in srgb, var(--border) 45%, transparent);
  background: var(--paper-chrome-bg);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
}

.paper-doc-chrome__left {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  justify-self: start;
  min-width: 0;
}

.paper-doc-chrome__center {
  justify-self: center;
  min-width: 0;
  max-width: min(100%, 20rem);
  text-align: center;
}

.paper-doc-chrome__right {
  display: flex;
  flex-wrap: nowrap;
  align-items: center;
  gap: 0.25rem;
  justify-self: end;
  min-width: 0;
}

.paper-doc-chrome__title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.875rem;
  font-weight: 600;
  letter-spacing: -0.01em;
  color: var(--text);
}

@media (min-width: 768px) {
  .paper-doc-chrome__title {
    font-size: 0.9375rem;
  }
}

.paper-doc-chrome__subtitle {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  margin-top: 0.125rem;
  font-size: 0.6875rem;
  color: var(--muted);
}

.paper-doc-chrome__presence {
  align-items: center;
  margin-right: 0.125rem;
}

.paper-chrome-history {
  display: inline-flex;
  gap: 0.125rem;
  padding: 0.125rem;
  border-radius: 8px;
  background: color-mix(in srgb, var(--text) 5%, transparent);
}

.paper-chrome-menu-item {
  display: block;
  width: 100%;
  padding: 0.5rem 0.75rem;
  text-align: left;
  font-size: 0.8125rem;
  color: var(--text);
}

.paper-chrome-menu-item--icon {
  display: flex;
  align-items: flex-start;
  gap: 0.625rem;
}

.paper-chrome-menu-icon {
  width: 1.125rem;
  height: 1.125rem;
  flex-shrink: 0;
  margin-top: 0.125rem;
  opacity: 0.85;
}

.paper-chrome-menu-icon-img {
  width: 1.125rem;
  height: 1.125rem;
  flex-shrink: 0;
  margin-top: 0.125rem;
  opacity: 0.85;
}

.paper-chrome-menu-item:hover {
  background: color-mix(in srgb, var(--text) 6%, transparent);
}

.paper-chrome-menu-item--active {
  background: color-mix(in srgb, var(--accent) 15%, transparent);
  color: var(--accent);
}

.paper-chrome-menu-action {
  width: 100%;
  border-radius: 8px;
  background: var(--accent);
  padding: 0.4rem 0.75rem;
  font-size: 0.75rem;
  font-weight: 600;
  color: #fff;
}

.paper-chrome-menu-action--icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.375rem;
}

.paper-chrome-menu-action:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.paper-chrome-font-select {
  height: 2rem;
  border-radius: 8px;
  border: 1px solid color-mix(in srgb, var(--border) 80%, transparent);
  background: color-mix(
    in srgb,
    var(--paper-surface-bg, var(--bg)) 65%,
    transparent
  );
  padding: 0 0.5rem;
  font-size: 0.75rem;
  color: var(--text);
}

.paper-chrome-btn {
  display: inline-flex;
  height: 2rem;
  width: 2rem;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  color: var(--muted);
  transition:
    background 0.15s ease,
    color 0.15s ease;
}

.paper-chrome-btn:hover:not(:disabled) {
  background: color-mix(in srgb, var(--text) 8%, transparent);
  color: var(--text);
}

.paper-chrome-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.paper-chrome-btn:focus {
  outline: none;
}

.paper-chrome-btn:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.paper-chrome-btn--active {
  background: color-mix(in srgb, var(--accent) 20%, transparent);
  color: var(--accent);
}

.paper-chrome-btn--source-view {
  width: auto;
  min-width: 2rem;
  padding: 0 0.45rem;
}

.paper-chrome-btn__source-label {
  font-size: 0.625rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  line-height: 1;
}

.paper-chrome-btn--comments {
  position: relative;
  overflow: visible;
}

.paper-chrome-btn--comments.paper-chrome-btn--active {
  background: color-mix(
    in srgb,
    var(--accent) 24%,
    var(--paper-chrome-bg, var(--bg))
  );
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--accent) 38%, transparent);
}

.paper-chrome-btn__glyph {
  position: relative;
  z-index: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.paper-chrome-btn__badge {
  position: absolute;
  right: -0.2rem;
  top: -0.2rem;
  z-index: 2;
  display: flex;
  height: 1rem;
  min-width: 1rem;
  align-items: center;
  justify-content: center;
  border-radius: 9999px;
  background: var(--accent);
  padding: 0 0.2rem;
  font-size: 9px;
  font-weight: 700;
  line-height: 1;
  color: #fff;
  pointer-events: none;
}

.paper-status-dot {
  display: inline-block;
  height: 0.5rem;
  width: 0.5rem;
  border-radius: 9999px;
  background: var(--muted);
}

.paper-status-dot--synced {
  background: var(--paper-status-synced);
}

.paper-status-dot--syncing {
  background: var(--paper-status-synced);
  animation: paper-status-pulse 1s ease-in-out infinite;
}

.paper-status-dot--pending {
  background: var(--paper-status-pending);
  animation: paper-status-pulse 1.2s ease-in-out infinite;
}

.paper-status-dot--offline {
  background: var(--paper-status-offline);
}

.paper-status-dot--error {
  background: var(--paper-status-error);
}

@keyframes paper-status-pulse {
  0%,
  100% {
    opacity: 1;
    transform: scale(1);
  }
  50% {
    opacity: 0.45;
    transform: scale(0.85);
  }
}

@media (prefers-reduced-motion: reduce) {
  .paper-status-dot--syncing,
  .paper-status-dot--pending {
    animation: none;
  }
}
</style>
