/**
 * Generic suggestion session: trigger detection, list filtering, keyboard nav.
 * Shared by emoji, mentions, channels, and future providers (e.g. slash commands).
 */

import { ref, computed, watch } from 'vue';
import type {
  SuggestableConfig,
  SuggestableInputContext,
  SuggestableSession,
} from '@/suggestables/types';

function inputContext(
  getText: () => string,
  getCursorOffset: () => number,
): SuggestableInputContext {
  return { text: getText(), cursor: getCursorOffset() };
}

function defaultSelectionRange(
  ctx: SuggestableInputContext,
  triggerStart: number,
): { start: number; end: number } {
  return { start: triggerStart, end: ctx.cursor };
}

export function useSuggestable<TItem>(
  getText: () => string,
  getCursorOffset: () => number,
  config: SuggestableConfig<TItem>,
): SuggestableSession<TItem> {
  const triggerStart = ref<number | null>(null);
  const query = ref('');
  const selectedIndex = ref(0);

  const suggestions = computed<TItem[]>(() => {
    if (triggerStart.value === null) return [];
    const q = query.value;
    if (!q && !config.showWithEmptyQuery) return [];
    return config.getSuggestions(q, inputContext(getText, getCursorOffset));
  });

  const showPopup = computed(
    () => triggerStart.value !== null && suggestions.value.length > 0,
  );

  watch([query, suggestions], () => {
    if (triggerStart.value !== null) selectedIndex.value = 0;
  });

  function updateFromInput() {
    const ctx = inputContext(getText, getCursorOffset);
    const trigger = config.detectTrigger(ctx);
    if (trigger) {
      const changed =
        triggerStart.value !== trigger.start || query.value !== trigger.query;
      if (changed) config.onTriggerOpen?.(ctx);
      triggerStart.value = trigger.start;
      query.value = trigger.query;
      if (changed) selectedIndex.value = 0;
    } else {
      triggerStart.value = null;
      query.value = '';
    }
  }

  function close() {
    triggerStart.value = null;
    query.value = '';
  }

  function select(item: TItem) {
    const start = triggerStart.value;
    if (start === null) return;
    const ctx = inputContext(getText, getCursorOffset);
    const range =
      config.resolveSelectionRange?.(ctx, start) ??
      defaultSelectionRange(ctx, start);
    if (!range) return;
    config.applySelection(item, range, ctx);
    close();
  }

  function selectCurrent() {
    const list = suggestions.value;
    if (list.length === 0) return;
    const idx = Math.min(selectedIndex.value, list.length - 1);
    select(list[idx]!);
  }

  function handleKeydown(e: KeyboardEvent): boolean {
    updateFromInput();
    if (!showPopup.value) return false;

    if (e.key === 'Escape') {
      close();
      return true;
    }
    if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) {
      e.preventDefault();
      selectCurrent();
      return true;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      selectedIndex.value = Math.min(
        selectedIndex.value + 1,
        suggestions.value.length - 1,
      );
      return true;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      selectedIndex.value = Math.max(selectedIndex.value - 1, 0);
      return true;
    }

    if (config.handleKeydownExtra) {
      return config.handleKeydownExtra(e, {
        query: query.value,
        suggestions: suggestions.value,
        select,
        close,
      });
    }

    return false;
  }

  return {
    triggerStart,
    query,
    selectedIndex,
    suggestions,
    showPopup,
    updateFromInput,
    close,
    select,
    selectCurrent,
    handleKeydown,
  };
}
