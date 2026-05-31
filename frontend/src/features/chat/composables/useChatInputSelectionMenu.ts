import {
  computed,
  nextTick,
  onMounted,
  onUnmounted,
  ref,
  watch,
  type Ref,
  type ShallowRef,
} from 'vue';
import type { Editor } from '@tiptap/core';
import {
  isComposerContentEffectivelyEmpty,
  rawOffsetToEditorPos,
} from '@/features/chat/editor/composerModel';

interface UseChatInputSelectionMenuOptions {
  chatInputFocused: Ref<boolean>;
  composerContent: Ref<string>;
  composerEditor: ShallowRef<Editor | null>;
  composerSurfaceRef: Ref<HTMLElement | null>;
  selectionMenuRef: Ref<HTMLElement | null>;
  selectionStart: Ref<number>;
  selectionEnd: Ref<number>;
  getSelectionStart: () => number;
  getSelectionEnd: () => number;
  flushComposerSync: () => void;
  wrapSelection: (prefix: string, suffix?: string) => void;
}

export function useChatInputSelectionMenu(
  options: UseChatInputSelectionMenuOptions,
) {
  const {
    chatInputFocused,
    composerContent,
    composerEditor,
    composerSurfaceRef,
    selectionMenuRef,
    selectionStart,
    selectionEnd,
    getSelectionStart,
    getSelectionEnd,
    flushComposerSync,
    wrapSelection,
  } = options;

  const selectionMenuPosition = ref({ top: 0, left: 0 });

  function syncSelectionFromComposer() {
    if (!chatInputFocused.value) return;
    flushComposerSync();
    const start = getSelectionStart();
    const end = getSelectionEnd();
    if (selectionStart.value !== start) selectionStart.value = start;
    if (selectionEnd.value !== end) selectionEnd.value = end;
  }

  const showSelectionMenu = computed(
    () =>
      chatInputFocused.value &&
      selectionEnd.value > selectionStart.value &&
      !isComposerContentEffectivelyEmpty(composerContent.value),
  );

  function hideSelectionMenu() {
    selectionMenuPosition.value = { top: 0, left: 0 };
  }

  function positionMenuFromEditorSelection(
    start: number,
    end: number,
    menu: HTMLElement,
  ): boolean {
    const editor = composerEditor.value;
    if (!editor || end <= start) return false;

    const view = editor.view;
    const fromPos = rawOffsetToEditorPos(view.state.doc, start);
    const toPos = rawOffsetToEditorPos(view.state.doc, end);
    const fromCoords = view.coordsAtPos(fromPos);
    const toCoords = view.coordsAtPos(toPos);
    const leftEdge = Math.min(fromCoords.left, toCoords.left);
    const rightEdge = Math.max(fromCoords.right, toCoords.right);
    const topEdge = Math.min(fromCoords.top, toCoords.top);

    const menuHeight = menu.offsetHeight || 44;
    const menuWidth = menu.offsetWidth || 200;
    const gap = 10;
    const padding = 12;
    let top = topEdge - menuHeight - gap;
    let left = leftEdge + (rightEdge - leftEdge) / 2;
    const minLeft = padding + menuWidth / 2;
    const maxLeft = window.innerWidth - padding - menuWidth / 2;
    left = Math.max(minLeft, Math.min(maxLeft, left));
    top = Math.max(padding, top);
    selectionMenuPosition.value = { top, left };
    return true;
  }

  function positionMenuFromDomSelection(
    root: HTMLElement,
    menu: HTMLElement,
  ): boolean {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
      return false;
    }
    const range = selection.getRangeAt(0);
    const common = range.commonAncestorContainer;
    if (
      !root.contains(
        common.nodeType === Node.ELEMENT_NODE ? common : common.parentElement,
      )
    ) {
      return false;
    }
    const rect = range.getBoundingClientRect();
    if (!rect.width && !rect.height) return false;

    const menuHeight = menu.offsetHeight || 44;
    const menuWidth = menu.offsetWidth || 200;
    const gap = 10;
    const padding = 12;
    let top = rect.top - menuHeight - gap;
    let left = rect.left + rect.width / 2;
    const minLeft = padding + menuWidth / 2;
    const maxLeft = window.innerWidth - padding - menuWidth / 2;
    left = Math.max(minLeft, Math.min(maxLeft, left));
    top = Math.max(padding, top);
    selectionMenuPosition.value = { top, left };
    return true;
  }

  function updateSelectionMenuPosition() {
    const root = composerSurfaceRef.value;
    const menu = selectionMenuRef.value;
    if (
      !root ||
      !menu ||
      !showSelectionMenu.value ||
      selectionEnd.value <= selectionStart.value
    ) {
      return;
    }

    flushComposerSync();
    const start = getSelectionStart();
    const end = getSelectionEnd();
    if (
      positionMenuFromEditorSelection(start, end, menu) ||
      positionMenuFromDomSelection(root, menu)
    ) {
      return;
    }
  }

  function scheduleSelectionMenuSync() {
    syncSelectionFromComposer();
    void nextTick(() => {
      updateSelectionMenuPosition();
      void nextTick(updateSelectionMenuPosition);
    });
  }

  function applyWrappedFormatting(wrapper: {
    prefix: string;
    suffix?: string;
  }) {
    syncSelectionFromComposer();
    if (selectionStart.value === selectionEnd.value) return;
    wrapSelection(wrapper.prefix, wrapper.suffix);
    scheduleSelectionMenuSync();
  }

  function formatBold() {
    applyWrappedFormatting({ prefix: '**' });
  }
  function formatItalic() {
    applyWrappedFormatting({ prefix: '*' });
  }
  function formatCode() {
    applyWrappedFormatting({ prefix: '`' });
  }
  function formatSpoiler() {
    applyWrappedFormatting({ prefix: '||' });
  }
  function formatStrike() {
    applyWrappedFormatting({ prefix: '~~' });
  }

  watch(showSelectionMenu, (visible) => {
    if (visible) scheduleSelectionMenuSync();
  });

  watch([selectionStart, selectionEnd], () => {
    if (showSelectionMenu.value) scheduleSelectionMenuSync();
  });

  const handleSelectionChange = () => {
    if (!chatInputFocused.value) return;
    syncSelectionFromComposer();
    if (showSelectionMenu.value) scheduleSelectionMenuSync();
  };

  onMounted(() => {
    document.addEventListener('selectionchange', handleSelectionChange);
  });

  onUnmounted(() => {
    document.removeEventListener('selectionchange', handleSelectionChange);
  });

  return {
    selectionStart,
    selectionEnd,
    selectionMenuPosition,
    showSelectionMenu,
    syncSelectionFromComposer,
    hideSelectionMenu,
    updateSelectionMenuPosition,
    handleComposerSelectionSync: scheduleSelectionMenuSync,
    formatBold,
    formatItalic,
    formatCode,
    formatSpoiler,
    formatStrike,
  };
}
