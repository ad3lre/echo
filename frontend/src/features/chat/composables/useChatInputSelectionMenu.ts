import {
  computed,
  nextTick,
  onMounted,
  onUnmounted,
  ref,
  watch,
  type Ref,
} from 'vue';
import { isComposerContentEffectivelyEmpty } from '@/features/chat/editor/composerModel';

interface UseChatInputSelectionMenuOptions {
  chatInputFocused: Ref<boolean>;
  composerContent: Ref<string>;
  composerSurfaceRef: Ref<HTMLElement | null>;
  selectionMenuRef: Ref<HTMLElement | null>;
  selectionStart: Ref<number>;
  selectionEnd: Ref<number>;
  wrapSelection: (prefix: string, suffix?: string) => void;
}

export function useChatInputSelectionMenu(
  options: UseChatInputSelectionMenuOptions,
) {
  const {
    chatInputFocused,
    composerContent,
    composerSurfaceRef,
    selectionMenuRef,
    selectionStart,
    selectionEnd,
    wrapSelection,
  } = options;

  const selectionMenuPosition = ref({ top: 0, left: 0 });

  const showSelectionMenu = computed(
    () =>
      chatInputFocused.value &&
      selectionEnd.value > selectionStart.value &&
      !isComposerContentEffectivelyEmpty(composerContent.value),
  );

  function updateSelectionFromTextarea() {
    if (!chatInputFocused.value) return;
  }

  function hideSelectionMenu() {
    selectionMenuPosition.value = { top: 0, left: 0 };
  }

  function updateSelectionMenuPosition() {
    const root = composerSurfaceRef.value;
    const menu = selectionMenuRef.value;
    if (
      !root ||
      !menu ||
      !showSelectionMenu.value ||
      selectionEnd.value <= selectionStart.value
    )
      return;
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed)
      return;
    const range = selection.getRangeAt(0);
    const common = range.commonAncestorContainer;
    if (
      !root.contains(
        common.nodeType === Node.ELEMENT_NODE ? common : common.parentElement,
      )
    )
      return;
    const rect = range.getBoundingClientRect();
    if (!rect.width && !rect.height) return;

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
  }

  function handleTextareaSelect() {
    updateSelectionFromTextarea();
    void nextTick(updateSelectionMenuPosition);
  }

  function handleTextareaMouseup() {
    updateSelectionFromTextarea();
    void nextTick(updateSelectionMenuPosition);
  }

  function handleTextareaKeyup() {
    updateSelectionFromTextarea();
    void nextTick(updateSelectionMenuPosition);
  }

  function applyWrappedFormatting(wrapper: {
    prefix: string;
    suffix?: string;
  }) {
    if (selectionStart.value === selectionEnd.value) return;
    wrapSelection(wrapper.prefix, wrapper.suffix);
    void nextTick(updateSelectionMenuPosition);
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
    if (visible) void nextTick(updateSelectionMenuPosition);
  });

  watch([selectionStart, selectionEnd], () => {
    if (showSelectionMenu.value) void nextTick(updateSelectionMenuPosition);
  });

  const handleSelectionChange = () => {
    if (showSelectionMenu.value) void nextTick(updateSelectionMenuPosition);
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
    updateSelectionFromTextarea,
    hideSelectionMenu,
    updateSelectionMenuPosition,
    handleTextareaSelect,
    handleTextareaMouseup,
    handleTextareaKeyup,
    formatBold,
    formatItalic,
    formatCode,
    formatSpoiler,
    formatStrike,
  };
}
