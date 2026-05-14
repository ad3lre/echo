/**
 * #channel autocomplete for chat input.
 * Detects #query pattern, shows channel suggestions, replaces on select.
 */

import { ref, computed, type Ref } from 'vue';
import { channelMentionRefLabel } from '@/utils/channelMentionLabel';

export interface ChannelOption {
  id: string;
  name: string;
  type?: 'text' | 'voice' | 'forum';
  iconKey?: string;
}

/**
 * Channel mention trigger: `#` must not be followed by whitespace (so `# ` is
 * markdown heading syntax, not a channel hint). Query is dash-safe alphanumerics.
 */
const TRIGGER = /(?:^|\s)#(?!\s)([a-zA-Z0-9_-]*)$/;
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

export function useChannelAutocomplete(
  getText: () => string,
  getCursorOffset: () => number,
  insertChannelMention: (
    start: number,
    end: number,
    option: ChannelOption,
  ) => void,
  channels: Ref<ChannelOption[]>,
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

  function updateFromInput() {
    const text = getText();
    const offset = getCursorOffset();
    const before = text.slice(0, offset);
    const match = before.match(TRIGGER);
    if (match) {
      const leadingWhitespaceLength = match[0].startsWith('#') ? 0 : 1;
      triggerStart.value = offset - match[0].length + leadingWhitespaceLength;
      query.value = match[1] ?? '';
      selectedIndex.value = 0;
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
    const offset = getCursorOffset();
    insertChannelMention(start, offset, option);
    close();
  }

  function selectCurrent() {
    const list = suggestions.value;
    if (list.length === 0) return;
    const idx = Math.min(selectedIndex.value, list.length - 1);
    replaceWith(list[idx]!);
  }

  function handleKeydown(e: KeyboardEvent): boolean {
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
