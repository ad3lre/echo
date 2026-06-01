/**
 * #channel autocomplete for chat input.
 * Detects #query pattern, shows channel suggestions, replaces on select.
 */

import { ref, computed, watch, type Ref } from 'vue';
import type { EchoChannelType } from '@shared/types';
import { channelMentionRefLabel } from '@/utils/channelMentionLabel';

export interface ChannelOption {
  id: string;
  name: string;
  type?: EchoChannelType;
  iconKey?: string;
}

export type ChannelTriggerSpan = { start: number; end: number };

/**
 * Channel mention trigger: require at least one non-space character after `#`
 * (so bare `#` / `# ` do not open the menu; `#1` / `#general` do). Query is
 * dash-safe alphanumerics after the first character.
 */
const CHANNEL_TRIGGER = /(?:^|\s)#([a-zA-Z0-9][a-zA-Z0-9_-]*)$/;
const QUERY_TAIL = /[a-zA-Z0-9_-]/;
const SUGGESTION_LIMIT = 6;

function channelMatchesQuery(ch: ChannelOption, qLower: string): boolean {
  if (!qLower) return true;
  const name = ch.name.toLowerCase();
  const refLabel = channelMentionRefLabel(ch.name).toLowerCase();
  const id = ch.id.toLowerCase();
  return (
    name.includes(qLower) || refLabel.includes(qLower) || id.includes(qLower)
  );
}

/**
 * Locate an active `#query` channel trigger before the caret.
 * Ignores `#` inside existing mention entities (prevents a stuck menu after pick).
 */
export function findChannelTrigger(
  text: string,
  cursor: number,
  mentions: readonly ChannelTriggerSpan[] = [],
): { start: number; query: string } | null {
  if (cursor < 0 || cursor > text.length) return null;
  const before = text.slice(0, cursor);
  const match = before.match(CHANNEL_TRIGGER);
  if (!match) return null;

  const leadingWhitespaceLength = match[0].startsWith('#') ? 0 : 1;
  const start = cursor - match[0].length + leadingWhitespaceLength;
  const query = match[1] ?? '';
  const hashPos = start;

  for (const m of mentions) {
    if (hashPos >= m.start && hashPos < m.end) return null;
    if (cursor > m.start && cursor <= m.end && hashPos <= m.start) return null;
  }

  if (hashPos === 0) return { start, query };

  const prev = before[hashPos - 1]!;
  if (/\s/.test(prev)) return { start, query };

  if (mentions.some((m) => m.end === hashPos)) return { start, query };

  return null;
}

export function useChannelAutocomplete(
  getText: () => string,
  getCursorOffset: () => number,
  insertChannelMention: (
    start: number,
    end: number,
    option: ChannelOption,
  ) => void,
  channels: Ref<ChannelOption[]>,
  getMentions?: () => readonly ChannelTriggerSpan[],
) {
  const triggerStart = ref<number | null>(null);
  const query = ref('');
  const selectedIndex = ref(0);

  const suggestions = computed<ChannelOption[]>(() => {
    const q = query.value.toLowerCase();
    if (!q) return channels.value.slice(0, SUGGESTION_LIMIT);
    const filtered = channels.value.filter((ch) => channelMatchesQuery(ch, q));
    return filtered.slice(0, SUGGESTION_LIMIT);
  });

  const showPopup = computed(() => {
    return triggerStart.value !== null && suggestions.value.length > 0;
  });

  watch([query, suggestions], () => {
    if (triggerStart.value !== null) selectedIndex.value = 0;
  });

  function updateFromInput() {
    const text = getText();
    const offset = getCursorOffset();
    const mentions = getMentions?.() ?? [];
    const trigger = findChannelTrigger(text, offset, mentions);
    if (trigger) {
      const changed =
        triggerStart.value !== trigger.start || query.value !== trigger.query;
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

  function replaceWith(option: ChannelOption) {
    const start = triggerStart.value;
    if (start === null) return;
    const text = getText();
    let end = getCursorOffset();
    // Defensive: when caret state lags by one tick, consume any remaining
    // query-tail chars so selection cannot leave a stray fragment.
    while (end < text.length && QUERY_TAIL.test(text[end] ?? '')) end += 1;
    insertChannelMention(start, end, option);
    close();
  }

  function selectCurrent() {
    const list = suggestions.value;
    if (list.length === 0) return;
    const idx = Math.min(selectedIndex.value, list.length - 1);
    replaceWith(list[idx]!);
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
    return false;
  }

  return {
    triggerStart,
    query,
    suggestions,
    showPopup,
    selectedIndex,
    updateFromInput,
    close,
    select: replaceWith,
    selectCurrent,
    handleKeydown,
  };
}
