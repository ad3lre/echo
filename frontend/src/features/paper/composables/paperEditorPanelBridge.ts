import {
  computed,
  ref,
  shallowRef,
  watch,
  type Ref,
  type ShallowRef,
} from 'vue';
import type { Editor } from '@tiptap/core';
import type { usePaperImageUpload } from '@/features/paper/composables/usePaperImageUpload';
import type { PaperAppearanceMode } from '@/features/paper/composables/usePaperAppearance';

export type PaperEditorPanelTab = 'design' | 'text' | 'assets' | 'structure';

export type PaperEditorPanelBridgeContext = {
  channelId: string;
  channelName: string;
  editor: ShallowRef<Editor | null>;
  appearance: Readonly<{ value: PaperAppearanceMode }>;
  canCustomize: Readonly<{ value: boolean }>;
  editorEditable: Readonly<{ value: boolean }>;
  paperPageColorLight: Readonly<{ value: string | null | undefined }>;
  paperPageColorDark: Readonly<{ value: string | null | undefined }>;
  documentFontFamily: Readonly<{ value: string | undefined }>;
  contentJson: Readonly<{ value: Record<string, unknown> | null | undefined }>;
  imageUpload: ReturnType<typeof usePaperImageUpload>;
  onPageColorLight: (hex: string | null) => void;
  onPageColorDark: (hex: string | null) => void;
  onDocumentFontChange: (fontId: string) => void;
  toggleAppearance: () => void;
  onScrollToBlock?: (blockId: string) => void;
};

const PAPER_EDITOR_PANEL_WIDTH = 360;
const SESSION_PREFIX = 'echo-paper-editor-panel:';

type SessionState = {
  open?: boolean;
  tab?: PaperEditorPanelTab;
};

function readSession(channelId: string): SessionState {
  if (typeof sessionStorage === 'undefined') return {};
  try {
    const raw = sessionStorage.getItem(`${SESSION_PREFIX}${channelId}`);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as SessionState & { pinned?: boolean };
    return {
      open: parsed.open ?? parsed.pinned,
      tab: parsed.tab,
    };
  } catch {
    return {};
  }
}

function writeSession(channelId: string, state: SessionState) {
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.setItem(
      `${SESSION_PREFIX}${channelId}`,
      JSON.stringify(state),
    );
  } catch {
    /* quota */
  }
}

const registeredContext = shallowRef<PaperEditorPanelBridgeContext | null>(
  null,
);
/** Editor tools panel is open (click to toggle; no hover). */
const panelOpen = ref(false);
const activeTab = ref<PaperEditorPanelTab>('design');
/** Bound from layout; plain let avoids shallowRef unwrapping a nested Ref<number>. */
let channelPanelWidthBinding: Ref<number> | null = null;
const savedChannelPanelWidth = ref<number | null>(null);

export const paperEditorPanelOpen = computed(() => panelOpen.value);

function persistPanelState() {
  const id = registeredContext.value?.channelId;
  if (!id) return;
  writeSession(id, {
    open: panelOpen.value,
    tab: activeTab.value,
  });
}

function restorePanelState(channelId: string) {
  const saved = readSession(channelId);
  if (saved.tab) activeTab.value = saved.tab;
  if (saved.open) panelOpen.value = true;
}

function applyChannelPanelWidth(open: boolean) {
  const widthRef = channelPanelWidthBinding;
  if (!widthRef) return;
  if (open) {
    if (savedChannelPanelWidth.value === null) {
      savedChannelPanelWidth.value = widthRef.value;
    }
    widthRef.value = Math.max(widthRef.value, PAPER_EDITOR_PANEL_WIDTH);
  } else if (savedChannelPanelWidth.value !== null) {
    widthRef.value = savedChannelPanelWidth.value;
    savedChannelPanelWidth.value = null;
  }
}

watch(paperEditorPanelOpen, (open) => {
  applyChannelPanelWidth(open);
});

export function bindPaperEditorChannelPanelWidth(widthRef: Ref<number>) {
  channelPanelWidthBinding = widthRef;
}

export function usePaperEditorPanelBridge() {
  function register(ctx: PaperEditorPanelBridgeContext) {
    const prevId = registeredContext.value?.channelId;
    if (prevId && prevId !== ctx.channelId) {
      panelOpen.value = false;
      applyChannelPanelWidth(false);
    }
    registeredContext.value = ctx;
    restorePanelState(ctx.channelId);
    if (paperEditorPanelOpen.value) applyChannelPanelWidth(true);
  }

  function unregister(channelId: string) {
    if (registeredContext.value?.channelId !== channelId) return;
    registeredContext.value = null;
    panelOpen.value = false;
    applyChannelPanelWidth(false);
  }

  function openPanel() {
    panelOpen.value = true;
    persistPanelState();
  }

  function closePanel() {
    panelOpen.value = false;
    persistPanelState();
  }

  function togglePanel() {
    if (panelOpen.value) closePanel();
    else openPanel();
  }

  /** @deprecated use openPanel */
  function pinPanel() {
    openPanel();
  }

  /** @deprecated use closePanel */
  function unpinPanel() {
    closePanel();
  }

  function setActiveTab(tab: PaperEditorPanelTab) {
    activeTab.value = tab;
    persistPanelState();
  }

  return {
    registeredContext,
    panelOpen,
    /** Alias — editor open state (click toggled, not hover). */
    panelPinned: panelOpen,
    activeTab,
    register,
    unregister,
    openPanel,
    closePanel,
    togglePanel,
    pinPanel,
    unpinPanel,
    setActiveTab,
  };
}
