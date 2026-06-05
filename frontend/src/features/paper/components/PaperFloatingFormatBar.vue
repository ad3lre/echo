<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref, watch } from 'vue';
import type { Editor } from '@tiptap/core';
import type { usePaperImageUpload } from '@/features/paper/composables/usePaperImageUpload';
import { usePaperSelectionFormat } from '@/features/paper/composables/usePaperSelectionFormat';
import { usePaperFormatActions } from '@/features/paper/composables/usePaperFormatActions';
import type { TriState } from '@/features/paper/editor/paperSelectionFormat';
import {
  PAPER_FONT_CATALOG,
  PAPER_FONT_SIZE_PRESETS,
  PAPER_HIGHLIGHT_COLORS,
  PAPER_TEXT_COLORS,
  paperFontFamilyCss,
} from '@/features/paper/editor/paperTypography';
import { ensurePaperFontLoaded } from '@/features/paper/editor/paperFontLoader';
import PaperPromptDialog from '@/features/paper/components/PaperPromptDialog.vue';
import PaperColorControl from '@/features/paper/components/PaperColorControl.vue';
import PaperFontPicker from '@/features/paper/components/PaperFontPicker.vue';
import EchoDropdown from '@/components/EchoDropdown.vue';
import type { EchoDropdownOption } from '@/components/EchoDropdown.vue';
import type { PaperPageLayout } from '@/features/paper/composables/usePaperPageLayout';
import type { PaperAppearanceMode } from '@/features/paper/composables/usePaperAppearance';
import { readPaperDefaultFont } from '@/features/paper/editor/paperDocumentAttributes';
import {
  onPaperFormatBarMouseDown,
  runPaperFormatCommand,
  snapshotPaperEditorSelection,
  syncStoredPaperEditorSelection,
} from '@/features/paper/editor/paperFormatSelection';

const props = defineProps<{
  editor: Editor | null;
  imageUpload: ReturnType<typeof usePaperImageUpload>;
  visible?: boolean;
  pageLayout?: PaperPageLayout;
  paperAppearance?: 'light' | 'dark' | 'amber';
}>();

const ed = computed(() => props.editor);
const show = computed(() => props.visible !== false && !!ed.value);
const fileInput = ref<HTMLInputElement | null>(null);
const linkDialogOpen = ref(false);
const imageUrlDialogOpen = ref(false);
const imageUrlError = ref<string | null>(null);
const moreMenuOpen = ref(false);
const moreMenuRef = ref<HTMLElement | null>(null);
const moreMenuPanelStyle = ref<Record<string, string> | null>(null);

const { format: fmt, colors: fmtColors } = usePaperSelectionFormat(ed);
const formatActions = usePaperFormatActions(ed);

const barStyle = computed(() => {
  const layout = props.pageLayout;
  if (!layout || layout.width <= 0) {
    return { left: '50%', transform: 'translateX(-50%)' };
  }
  return {
    left: `${layout.viewportCenterX}px`,
    transform: 'translateX(-50%)',
  };
});

const fontSizeDisplay = computed(() => {
  if (fmt.value.fontSizeMixed) return 'Mixed';
  if (fmt.value.fontSizePx != null) {
    return String(fmt.value.fontSizePx);
  }
  return '';
});

const fontSizeTitle = computed(() => {
  if (fmt.value.fontSizeMixed) return 'Font size: mixed · Shift+↑↓';
  const px = fmt.value.fontSizePx;
  return px != null ? `Font size: ${px}px · Shift+↑↓` : 'Font size · Shift+↑↓';
});

const headingOptions: EchoDropdownOption[] = [
  { label: 'Title', value: '1' },
  { label: 'Heading 2', value: '2' },
  { label: 'Heading 3', value: '3' },
  { label: 'Body', value: '0' },
];

const letterSpacingPresetOptions: EchoDropdownOption[] = [
  { label: 'Normal', value: '' },
  { label: '0.5px', value: '0.5px' },
  { label: '1px', value: '1px' },
  { label: '2px', value: '2px' },
  { label: '4px', value: '4px' },
];

const lineHeightPresetOptions: EchoDropdownOption[] = [
  { label: '1.0', value: '1' },
  { label: '1.15', value: '1.15' },
  { label: '1.35', value: '1.35' },
  { label: '1.5', value: '1.5' },
  { label: '2.0', value: '2' },
];

const textOutlinePresetOptions: EchoDropdownOption[] = [
  { label: 'Off', value: '' },
  { label: 'Thin', value: 'thin' },
  { label: 'Medium', value: 'medium' },
];

const fontSizePresetOptions = computed<EchoDropdownOption[]>(() =>
  PAPER_FONT_SIZE_PRESETS.map((px) => ({
    label: `${px}px`,
    value: String(px),
  })),
);

const currentHeadingValue = computed(() => {
  if (fmt.value.heading === 'h1') return '1';
  if (fmt.value.heading === 'h2') return '2';
  if (fmt.value.heading === 'h3') return '3';
  return '0';
});

function onHeadingSelect(value: string) {
  const level = Number.parseInt(value, 10) as 0 | 1 | 2 | 3;
  setHeading(level);
}

function onFontSizePresetSelect(value: string) {
  const n = Number.parseInt(value, 10);
  if (Number.isFinite(n)) onFontSizePreset(n);
}

const docDefaultFont = computed(() =>
  readPaperDefaultFont(ed.value?.getJSON() as Record<string, unknown>),
);

function closeMoreMenu() {
  moreMenuOpen.value = false;
}

async function positionMoreMenuPanel() {
  await nextTick();
  const root = moreMenuRef.value;
  if (!root) {
    moreMenuPanelStyle.value = null;
    return;
  }
  const rect = root.getBoundingClientRect();
  moreMenuPanelStyle.value = {
    position: 'fixed',
    left: `${Math.max(8, rect.right - 140)}px`,
    bottom: `${window.innerHeight - rect.top + 8}px`,
    minWidth: '140px',
    zIndex: '100',
  };
}

function onDocumentPointerDown(ev: PointerEvent) {
  if (!moreMenuOpen.value) return;
  const target = ev.target as Node;
  const root = moreMenuRef.value;
  if (root?.contains(target)) return;
  const panel = document.getElementById('paper-format-more-menu-panel');
  if (panel?.contains(target)) return;
  closeMoreMenu();
}

watch(moreMenuOpen, (open) => {
  if (open) {
    void positionMoreMenuPanel();
    document.addEventListener('pointerdown', onDocumentPointerDown);
    window.addEventListener('resize', positionMoreMenuPanel);
    window.addEventListener('scroll', positionMoreMenuPanel, true);
  } else {
    document.removeEventListener('pointerdown', onDocumentPointerDown);
    window.removeEventListener('resize', positionMoreMenuPanel);
    window.removeEventListener('scroll', positionMoreMenuPanel, true);
    moreMenuPanelStyle.value = null;
  }
});

function onEditorSelectionUpdate() {
  const editor = ed.value;
  if (!editor) return;
  syncStoredPaperEditorSelection(editor);
}

function onFormatBarMouseDown(ev: MouseEvent) {
  onPaperFormatBarMouseDown(ed.value, ev);
}

watch(
  ed,
  (editor, prev) => {
    prev?.off('selectionUpdate', onEditorSelectionUpdate);
    editor?.on('selectionUpdate', onEditorSelectionUpdate);
  },
  { immediate: true },
);

onUnmounted(() => {
  document.removeEventListener('pointerdown', onDocumentPointerDown);
  window.removeEventListener('resize', positionMoreMenuPanel);
  window.removeEventListener('scroll', positionMoreMenuPanel, true);
  ed.value?.off('selectionUpdate', onEditorSelectionUpdate);
});

async function onPickImage() {
  fileInput.value?.click();
}

async function onImageFileChange(ev: Event) {
  const editor = ed.value;
  const input = ev.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!editor || !file) return;
  await props.imageUpload.insertImageFile(editor, file);
}

function onLinkConfirm(href: string) {
  linkDialogOpen.value = false;
  const editor = ed.value;
  if (!editor) return;
  if (!href) {
    runPaperFormatCommand(editor, (chain) =>
      chain.extendMarkRange('link').unsetLink(),
    );
    return;
  }
  runPaperFormatCommand(editor, (chain) =>
    chain.extendMarkRange('link').setLink({ href }),
  );
}

function onImageUrlConfirm(src: string) {
  imageUrlDialogOpen.value = false;
  const editor = ed.value;
  if (!editor || !src) return;
  imageUrlError.value = null;
  if (!props.imageUpload.insertImageUrl(editor, src)) {
    imageUrlError.value = 'That URL is not allowed for images.';
    imageUrlDialogOpen.value = true;
  }
}

function setHeading(level: 0 | 1 | 2 | 3) {
  formatActions.setHeading(level);
}

function headingBtnClass(level: 1 | 2 | 3) {
  const h = fmt.value.heading;
  if (h === 'mixed') {
    return 'paper-format-heading-btn paper-format-heading-btn--mixed';
  }
  const key = level === 1 ? 'h1' : level === 2 ? 'h2' : 'h3';
  return h === key
    ? 'paper-format-heading-btn paper-format-heading-btn--active'
    : 'paper-format-heading-btn';
}

function triBtnClass(state: TriState) {
  if (state === 'mixed') {
    return 'paper-format-btn paper-format-btn--mixed';
  }
  return state
    ? 'paper-format-btn paper-format-btn--active'
    : 'paper-format-btn';
}

function btnActive(active: boolean) {
  return active
    ? 'paper-format-btn paper-format-btn--active'
    : 'paper-format-btn';
}

async function onFontPick(fontId: string) {
  const font = PAPER_FONT_CATALOG.find((f) => f.id === fontId);
  const editor = ed.value;
  if (!font || !editor) return;
  snapshotPaperEditorSelection(editor);
  await ensurePaperFontLoaded(font.id);
  runPaperFormatCommand(editor, (chain) =>
    chain.extendMarkRange('textStyle').setFontFamily(font.family),
  );
}

function onFontClear() {
  const editor = ed.value;
  if (!editor) return;
  runPaperFormatCommand(editor, (chain) =>
    chain.extendMarkRange('textStyle').unsetFontFamily(),
  );
}

function onFontSizeInput(ev: Event) {
  const raw = (ev.target as HTMLInputElement).value.trim();
  const editor = ed.value;
  if (!editor) return;
  if (!raw) {
    runPaperFormatCommand(editor, (chain) =>
      chain.extendMarkRange('textStyle').unsetFontSize(),
    );
    return;
  }
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 6 || n > 400) return;
  runPaperFormatCommand(editor, (chain) =>
    chain.extendMarkRange('textStyle').setFontSize(`${n}px`),
  );
}

function onFontSizePreset(px: number) {
  const editor = ed.value;
  if (!editor) return;
  runPaperFormatCommand(editor, (chain) =>
    chain.extendMarkRange('textStyle').setFontSize(`${px}px`),
  );
}

function setTextColor(color: string) {
  formatActions.setTextColor(color);
}

function setHighlight(color: string | null) {
  formatActions.setHighlight(color);
}

function setAlign(align: 'left' | 'center' | 'right' | 'justify') {
  formatActions.setAlign(align);
}

function setLetterSpacing(value: string) {
  formatActions.setLetterSpacing(value || null);
}

function setLineHeight(value: string) {
  formatActions.setLineHeight(value || null);
}

function setTextOutline(preset: string) {
  if (!preset) {
    formatActions.setTextOutline(null);
    return;
  }
  const width = preset === 'thin' ? '1px' : '2px';
  formatActions.setTextOutline(width);
}

function runIndent() {
  formatActions.indent();
}

function runOutdent() {
  formatActions.outdent();
}

function cycleAlign() {
  const current = fmt.value.textAlign;
  const order: Array<'left' | 'center' | 'right' | 'justify'> = [
    'left',
    'center',
    'right',
    'justify',
  ];
  const idx = order.indexOf(current === 'mixed' ? 'left' : current);
  const next = order[(idx + 1) % order.length];
  setAlign(next);
}

const alignCycleIcon = computed(() => {
  const align = fmt.value.textAlign === 'mixed' ? 'left' : fmt.value.textAlign;
  return align;
});

function runMarkToggle(cmd: 'toggleBold' | 'toggleItalic' | 'toggleStrike') {
  formatActions.toggleMark(cmd);
}

function runListToggle(cmd: 'toggleBulletList') {
  formatActions.toggleList(cmd);
}

function runUndo() {
  runPaperFormatCommand(ed.value, (chain) => chain.undo());
}

function alignBtnClass(align: 'left' | 'center' | 'right') {
  const a = fmt.value.textAlign;
  if (a === 'mixed') return 'paper-format-btn paper-format-btn--mixed';
  return a === align
    ? 'paper-format-btn paper-format-btn--active'
    : 'paper-format-btn';
}
</script>

<template>
  <div
    v-if="show"
    class="paper-format-bar paper-floating-format-bar pointer-events-none fixed bottom-6 z-40"
    :style="barStyle"
    role="toolbar"
    aria-label="Formatting"
  >
    <div
      class="pointer-events-auto flex max-w-[min(100vw-1.5rem,56rem)] items-center gap-0.5 overflow-x-auto overflow-y-visible rounded-full border border-border px-1.5 py-1 shadow-lg backdrop-blur-md"
      style="background: var(--paper-format-bar-bg)"
      @mousedown.capture="onFormatBarMouseDown"
    >
      <EchoDropdown
        :model-value="currentHeadingValue"
        :options="headingOptions"
        label="Style"
        compact
        @update:model-value="onHeadingSelect"
      />

      <span class="paper-format-divider" aria-hidden="true" />

      <PaperFontPicker
        :model-value="fmt.fontFamilyMixed ? '' : fmt.fontFamily"
        :mixed="fmt.fontFamilyMixed"
        :document-default-family="docDefaultFont"
        :paper-appearance="paperAppearance ?? 'light'"
        @update:model-value="onFontPick"
        @clear="onFontClear"
      />

      <div class="paper-format-size-wrap" :title="fontSizeTitle">
        <input
          type="text"
          class="paper-format-size-input"
          :readonly="fmt.fontSizeMixed"
          :placeholder="fmt.fontSizeMixed ? 'Mixed' : 'px'"
          :value="fontSizeDisplay"
          aria-label="Font size in pixels"
          @change="onFontSizeInput"
        />
        <EchoDropdown
          :model-value="''"
          :options="fontSizePresetOptions"
          label="Size"
          compact
          menu-match-trigger-width
          @update:model-value="onFontSizePresetSelect"
        />
      </div>

      <PaperColorControl
        label="Text color"
        :color="fmtColors.textColor"
        :mixed="fmtColors.textMixed"
        :is-default="fmtColors.textIsDefault"
        :palette="PAPER_TEXT_COLORS"
        :page-layout="pageLayout"
        :paper-appearance="paperAppearance"
        @input="setTextColor"
        @clear="setTextColor('')"
      />

      <PaperColorControl
        label="Highlight"
        variant="highlight"
        :color="fmtColors.highlightColor"
        :mixed="fmtColors.highlightMixed"
        :is-default="!fmtColors.hasHighlight && !fmtColors.highlightMixed"
        :palette="PAPER_HIGHLIGHT_COLORS"
        :page-layout="pageLayout"
        :paper-appearance="paperAppearance"
        @input="(v) => setHighlight(v)"
        @clear="setHighlight(null)"
      />

      <button
        type="button"
        class="paper-format-btn"
        :class="{ 'paper-format-btn--active': fmt.textAlign !== 'left' }"
        :title="`Align: ${fmt.textAlign === 'mixed' ? 'left' : fmt.textAlign} (click to cycle)`"
        aria-label="Cycle alignment"
        @click="cycleAlign"
      >
        <svg
          v-if="alignCycleIcon === 'left'"
          class="paper-format-icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <line x1="4" y1="6" x2="20" y2="6" />
          <line x1="4" y1="12" x2="14" y2="12" />
          <line x1="4" y1="18" x2="18" y2="18" />
        </svg>
        <svg
          v-else-if="alignCycleIcon === 'center'"
          class="paper-format-icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <line x1="4" y1="6" x2="20" y2="6" />
          <line x1="7" y1="12" x2="17" y2="12" />
          <line x1="5" y1="18" x2="19" y2="18" />
        </svg>
        <svg
          v-else-if="alignCycleIcon === 'right'"
          class="paper-format-icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <line x1="4" y1="6" x2="20" y2="6" />
          <line x1="10" y1="12" x2="20" y2="12" />
          <line x1="6" y1="18" x2="20" y2="18" />
        </svg>
        <svg
          v-else
          class="paper-format-icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <line x1="4" y1="6" x2="20" y2="6" />
          <line x1="4" y1="12" x2="20" y2="12" />
          <line x1="4" y1="18" x2="20" y2="18" />
        </svg>
      </button>

      <span class="paper-format-divider" aria-hidden="true" />

      <button
        type="button"
        :class="triBtnClass(fmt.bold)"
        :title="`Bold${fmt.bold === 'mixed' ? ': mixed' : ''}`"
        aria-label="Bold"
        @click="runMarkToggle('toggleBold')"
      >
        <svg
          class="paper-format-icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2.5"
        >
          <path d="M6 4h8a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z" />
          <path d="M6 12h9a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z" />
        </svg>
      </button>
      <button
        type="button"
        :class="triBtnClass(fmt.italic)"
        :title="`Italic${fmt.italic === 'mixed' ? ': mixed' : ''}`"
        aria-label="Italic"
        @click="runMarkToggle('toggleItalic')"
      >
        <svg
          class="paper-format-icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <line x1="19" y1="4" x2="10" y2="4" />
          <line x1="14" y1="20" x2="5" y2="20" />
          <line x1="15" y1="4" x2="9" y2="20" />
        </svg>
      </button>
      <button
        type="button"
        :class="triBtnClass(fmt.strike)"
        :title="`Strikethrough${fmt.strike === 'mixed' ? ': mixed' : ''}`"
        aria-label="Strikethrough"
        @click="runMarkToggle('toggleStrike')"
      >
        <svg
          class="paper-format-icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <path d="M16 4H9a3 3 0 0 0-2.83 4" />
          <path d="M14 12a4 4 0 0 1 0 8H6" />
          <line x1="4" y1="12" x2="20" y2="12" />
        </svg>
      </button>

      <span
        class="paper-format-divider paper-format-divider--hide-sm"
        aria-hidden="true"
      />

      <button
        type="button"
        class="paper-format-btn paper-format-divider--hide-sm"
        title="Insert image"
        aria-label="Insert image"
        :disabled="imageUpload.uploading.value"
        @click="onPickImage()"
      >
        <svg
          class="paper-format-icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <circle cx="8.5" cy="8.5" r="1.5" fill="currentColor" />
          <path d="M21 15l-5-5L5 21" />
        </svg>
      </button>

      <button
        type="button"
        :class="[
          btnActive(!!ed?.isActive('bulletList')),
          'paper-format-divider--hide-sm',
        ]"
        title="Bullet list"
        aria-label="Bullet list"
        @click="runListToggle('toggleBulletList')"
      >
        <svg
          class="paper-format-icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <line x1="9" y1="6" x2="20" y2="6" />
          <line x1="9" y1="12" x2="20" y2="12" />
          <line x1="9" y1="18" x2="20" y2="18" />
          <circle cx="4" cy="6" r="1.5" fill="currentColor" />
          <circle cx="4" cy="12" r="1.5" fill="currentColor" />
          <circle cx="4" cy="18" r="1.5" fill="currentColor" />
        </svg>
      </button>

      <div ref="moreMenuRef" class="relative paper-format-divider--hide-sm">
        <button
          type="button"
          class="paper-format-btn"
          title="More"
          aria-label="More formatting"
          :aria-expanded="moreMenuOpen"
          @mousedown.prevent
          @click="moreMenuOpen = !moreMenuOpen"
        >
          <svg
            class="paper-format-icon"
            viewBox="0 0 24 24"
            fill="currentColor"
          >
            <circle cx="5" cy="12" r="2" />
            <circle cx="12" cy="12" r="2" />
            <circle cx="19" cy="12" r="2" />
          </svg>
        </button>
        <Teleport to="body">
          <div
            v-if="moreMenuOpen && moreMenuPanelStyle"
            id="paper-format-more-menu-panel"
            class="paper-format-more-menu paper-teleport-surface flex flex-col rounded-xl border border-border py-1"
            :data-paper-appearance="paperAppearance ?? 'light'"
            :style="moreMenuPanelStyle"
            @click.stop
            @mousedown.prevent
          >
            <button
              type="button"
              class="paper-heading-item"
              @click="
                linkDialogOpen = true;
                closeMoreMenu();
              "
            >
              Link…
            </button>
            <button
              type="button"
              class="paper-heading-item"
              :disabled="imageUpload.uploading.value"
              @click="
                onPickImage();
                closeMoreMenu();
              "
            >
              Upload image
            </button>
            <button
              type="button"
              class="paper-heading-item"
              @click="
                imageUrlDialogOpen = true;
                closeMoreMenu();
              "
            >
              Image from URL…
            </button>
            <div class="my-1 border-t border-border" />
            <div
              class="paper-heading-item paper-heading-item--disabled text-xs text-fg-subtle"
            >
              Letter spacing
            </div>
            <div class="flex gap-1 px-2 pb-2">
              <button
                v-for="opt in letterSpacingPresetOptions"
                :key="opt.value"
                type="button"
                class="px-2 py-1 text-xs rounded hover:bg-glass-hover"
                :class="{
                  'bg-accent/20':
                    fmt.letterSpacing === opt.value ||
                    (!opt.value && !fmt.letterSpacing),
                }"
                @click="
                  setLetterSpacing(opt.value);
                  closeMoreMenu();
                "
              >
                {{ opt.label }}
              </button>
            </div>
            <div
              class="paper-heading-item paper-heading-item--disabled text-xs text-fg-subtle"
            >
              Line height
            </div>
            <div class="flex gap-1 px-2 pb-2">
              <button
                v-for="opt in lineHeightPresetOptions"
                :key="opt.value"
                type="button"
                class="px-2 py-1 text-xs rounded hover:bg-glass-hover"
                :class="{
                  'bg-accent/20':
                    fmt.lineHeight === opt.value ||
                    (!opt.value && !fmt.lineHeight),
                }"
                @click="
                  setLineHeight(opt.value);
                  closeMoreMenu();
                "
              >
                {{ opt.label }}
              </button>
            </div>
            <div
              class="paper-heading-item paper-heading-item--disabled text-xs text-fg-subtle"
            >
              Text outline
            </div>
            <div class="flex gap-1 px-2 pb-2">
              <button
                v-for="opt in textOutlinePresetOptions"
                :key="opt.value"
                type="button"
                class="px-2 py-1 text-xs rounded hover:bg-glass-hover"
                :class="{
                  'bg-accent/20':
                    fmt.textOutlineWidth ===
                      (opt.value === 'thin'
                        ? '1px'
                        : opt.value === 'medium'
                          ? '2px'
                          : '') ||
                    (!opt.value && !fmt.textOutlineWidth),
                }"
                @click="
                  setTextOutline(opt.value);
                  closeMoreMenu();
                "
              >
                {{ opt.label }}
              </button>
            </div>
            <div class="my-1 border-t border-border" />
            <div class="flex gap-1 px-2 pb-2">
              <button
                type="button"
                class="paper-heading-item flex-1"
                :disabled="fmt.indent <= 0"
                @click="
                  runOutdent();
                  closeMoreMenu();
                "
              >
                ← Outdent
              </button>
              <button
                type="button"
                class="paper-heading-item flex-1"
                :disabled="fmt.indent >= 4"
                @click="
                  runIndent();
                  closeMoreMenu();
                "
              >
                Indent →
              </button>
            </div>
          </div>
        </Teleport>
      </div>

      <span
        class="paper-format-divider paper-format-divider--hide-sm"
        aria-hidden="true"
      />
      <button
        type="button"
        class="paper-format-btn paper-format-divider--hide-sm"
        title="Undo"
        aria-label="Undo"
        :disabled="!ed?.can().undo()"
        @click="runUndo()"
      >
        <svg
          class="paper-format-icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <path d="M3 10h13a4 4 0 0 1 0 8H7" />
          <path d="M3 10l4-4M3 10l4 4" />
        </svg>
      </button>

      <input
        ref="fileInput"
        type="file"
        accept="image/png,image/jpeg,image/gif,image/webp"
        class="hidden"
        @change="onImageFileChange"
      />
    </div>
  </div>

  <PaperPromptDialog
    :open="linkDialogOpen"
    title="Insert link"
    label="URL"
    placeholder="https://"
    :initial-value="(ed?.getAttributes('link').href as string) ?? 'https://'"
    @confirm="onLinkConfirm"
    @cancel="linkDialogOpen = false"
  />
  <PaperPromptDialog
    :open="imageUrlDialogOpen"
    title="Image from URL"
    label="Image URL"
    placeholder="https://"
    :error="imageUrlError"
    @confirm="onImageUrlConfirm"
    @cancel="
      imageUrlDialogOpen = false;
      imageUrlError = null;
    "
  />
</template>

<style scoped>
.paper-format-bar {
  max-width: calc(100vw - 1rem);
}

.paper-format-btn {
  display: inline-flex;
  height: 2rem;
  width: 2rem;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  border-radius: 9999px;
  color: var(--text);
  transition:
    background 0.15s ease,
    color 0.15s ease;
}

.paper-format-btn:focus {
  outline: none;
}

.paper-format-btn:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.paper-format-btn:hover:not(:disabled) {
  background: color-mix(in srgb, var(--accent) 18%, transparent);
}

.paper-format-btn--active {
  background: color-mix(in srgb, var(--accent) 28%, transparent);
  color: var(--accent);
}

.paper-format-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.paper-format-heading-group {
  display: inline-flex;
  flex-shrink: 0;
  gap: 0.125rem;
  padding: 0.125rem;
  border-radius: 9999px;
  background: color-mix(in srgb, var(--text) 6%, transparent);
}

.paper-format-heading-btn {
  min-width: 2rem;
  height: 1.75rem;
  padding: 0 0.4rem;
  border-radius: 9999px;
  font-size: 0.6875rem;
  font-weight: 700;
  letter-spacing: 0.02em;
  color: var(--muted);
  transition:
    background 0.15s ease,
    color 0.15s ease;
}

.paper-format-heading-btn--active {
  background: var(--accent);
  color: #fff;
}

.paper-format-heading-btn--mixed,
.paper-format-btn--mixed {
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--accent) 55%, transparent);
  opacity: 0.85;
}

.paper-format-size-hint {
  font-size: 0.5625rem;
  font-weight: 600;
  text-transform: uppercase;
  color: var(--muted);
  padding-right: 0.25rem;
}

.paper-format-size-input {
  font-variant-numeric: tabular-nums;
}

.paper-format-btn,
.paper-format-heading-btn {
  transition:
    background 0.15s ease,
    color 0.15s ease,
    box-shadow 0.15s ease;
}

@media (prefers-reduced-motion: reduce) {
  .paper-format-btn,
  .paper-format-heading-btn {
    transition: none;
  }
}

.paper-format-select {
  max-width: 6.5rem;
  height: 2rem;
  flex-shrink: 0;
  border-radius: 8px;
  border: none;
  background: transparent;
  padding: 0 0.35rem;
  font-size: 0.75rem;
  color: var(--text);
  cursor: pointer;
}

.paper-format-select--compact {
  max-width: 5.5rem;
}

.paper-format-size-wrap {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  gap: 0;
  border-radius: 8px;
  background: color-mix(in srgb, var(--text) 6%, transparent);
}

.paper-format-size-input {
  width: 2.75rem;
  height: 2rem;
  border: none;
  background: transparent;
  padding: 0 0.25rem 0 0.5rem;
  font-size: 0.75rem;
  color: var(--text);
  text-align: right;
}

.paper-format-size-input:focus {
  outline: none;
}

.paper-format-size-preset {
  width: 1.25rem;
  height: 2rem;
  border: none;
  background: transparent;
  font-size: 0.625rem;
  color: var(--muted);
  cursor: pointer;
}

.paper-format-color {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 2rem;
  border-radius: 9999px;
  cursor: pointer;
}

.paper-format-color-input {
  width: 1.25rem;
  height: 1.25rem;
  padding: 0;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  background: transparent;
}

.paper-format-align-group {
  display: inline-flex;
  flex-shrink: 0;
  gap: 0.0625rem;
}

.paper-format-icon {
  width: 1.125rem;
  height: 1.125rem;
}

.paper-format-divider {
  width: 1px;
  height: 1.25rem;
  margin: 0 0.1rem;
  flex-shrink: 0;
  background: var(--border);
}

.paper-heading-item {
  display: block;
  width: 100%;
  padding: 0.4rem 0.75rem;
  text-align: left;
  font-size: 0.8125rem;
  color: var(--text);
}

.paper-heading-item:hover {
  background: var(--ui-glass-hover);
}

.paper-format-more-menu {
  background: var(--elevated);
  color: var(--text);
  box-shadow: var(--paper-dropdown-shadow);
}

@media (max-width: 640px) {
  .paper-format-divider--hide-sm {
    display: none;
  }
}
</style>
