import { nextTick, onUnmounted, ref, watch, type Ref } from 'vue';

interface UseChatInputMarkdownPreviewOptions {
  markdownPreviewState?: Ref<{ html: string; expanded: boolean }>;
  markdownPreviewHtml: Ref<string>;
  showMarkdownPreviewToggle: Ref<boolean>;
  hasComposerContent: Ref<boolean>;
  markdownPreviewExpanded: Ref<boolean>;
  markdownPreviewOpen: Ref<boolean>;
  markdownPreviewInline: Ref<boolean>;
  composerScrollRef: Ref<HTMLElement | null>;
  markdownPreviewContentRef: Ref<HTMLDivElement | null>;
  keepLatestMessageVisible?: (smooth?: boolean) => void;
}

export function useChatInputMarkdownPreview(
  options: UseChatInputMarkdownPreviewOptions,
) {
  const {
    markdownPreviewState,
    markdownPreviewHtml,
    showMarkdownPreviewToggle,
    hasComposerContent,
    markdownPreviewExpanded,
    markdownPreviewOpen,
    markdownPreviewInline,
    composerScrollRef,
    markdownPreviewContentRef,
    keepLatestMessageVisible,
  } = options;

  const previewContentOverflows = ref(false);
  let resizeObserver: ResizeObserver | null = null;
  /** Batches preview height churn (e.g. images) so we don’t spam scroll-to-bottom on the message list. */
  let keepMessagesVisibleDebounce: ReturnType<typeof setTimeout> | null = null;

  function scheduleKeepMessagesVisibleFromPreview(smooth = false) {
    if (keepMessagesVisibleDebounce) clearTimeout(keepMessagesVisibleDebounce);
    keepMessagesVisibleDebounce = setTimeout(() => {
      keepMessagesVisibleDebounce = null;
      keepLatestMessageVisible?.(smooth);
    }, 120);
  }

  function syncPreviewScrollWithTextarea() {
    const ta = composerScrollRef.value;
    const preview = markdownPreviewContentRef.value;
    if (
      !ta ||
      !preview ||
      !markdownPreviewOpen.value ||
      markdownPreviewExpanded.value
    )
      return;
    const taMax = Math.max(1, ta.scrollHeight - ta.clientHeight);
    const previewMax = Math.max(0, preview.scrollHeight - preview.clientHeight);
    const ratio = ta.scrollTop / taMax;
    preview.scrollTop = ratio * previewMax;
  }

  function keepPreviewFromCoveringLatestMessage(smooth = true) {
    if (!markdownPreviewOpen.value || markdownPreviewExpanded.value) return;
    keepLatestMessageVisible?.(smooth);
  }

  function expandMarkdownPreview() {
    if (markdownPreviewState) {
      markdownPreviewState.value = {
        ...markdownPreviewState.value,
        expanded: true,
      };
    }
  }

  watch(showMarkdownPreviewToggle, (showing) => {
    if (!showing) {
      markdownPreviewOpen.value = false;
      markdownPreviewInline.value = false;
      if (markdownPreviewState) {
        markdownPreviewState.value = {
          ...markdownPreviewState.value,
          expanded: false,
        };
      }
    } else {
      void nextTick(() => {
        syncPreviewScrollWithTextarea();
        keepPreviewFromCoveringLatestMessage();
      });
    }
  });

  watch(
    markdownPreviewHtml,
    (html) => {
      if (markdownPreviewState && markdownPreviewState.value.html !== html) {
        markdownPreviewState.value = { ...markdownPreviewState.value, html };
      }
      void nextTick(() => {
        syncPreviewScrollWithTextarea();
        scheduleKeepMessagesVisibleFromPreview(false);
      });
    },
    { immediate: true },
  );

  watch(
    () =>
      [
        markdownPreviewOpen.value,
        hasComposerContent.value,
        markdownPreviewContentRef.value,
      ] as const,
    ([open, hasContent, el]) => {
      resizeObserver?.disconnect();
      resizeObserver = null;
      if (!open || !hasContent || !el) return;
      const checkOverflow = () => {
        previewContentOverflows.value = el.scrollHeight > el.clientHeight;
        scheduleKeepMessagesVisibleFromPreview(false);
      };
      resizeObserver = new ResizeObserver(() => {
        void nextTick(checkOverflow);
      });
      resizeObserver.observe(el);
      void nextTick(checkOverflow);
    },
    { immediate: true },
  );

  onUnmounted(() => {
    resizeObserver?.disconnect();
    if (keepMessagesVisibleDebounce) clearTimeout(keepMessagesVisibleDebounce);
  });

  return {
    previewContentOverflows,
    syncPreviewScrollWithTextarea,
    keepPreviewFromCoveringLatestMessage,
    expandMarkdownPreview,
  };
}
