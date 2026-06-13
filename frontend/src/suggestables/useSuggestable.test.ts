import { describe, expect, it } from 'vitest';
import { useSuggestable } from '@/suggestables/useSuggestable';
import type { SuggestableConfig } from '@/suggestables/types';

type Item = { id: string; label: string };

function keyEvent(key: string, init: KeyboardEventInit = {}): KeyboardEvent {
  return {
    key,
    shiftKey: false,
    preventDefault: () => {},
    ...init,
  } as KeyboardEvent;
}

function mentionLikeConfig(
  insert: (start: number, end: number, item: Item) => void,
): SuggestableConfig<Item> {
  const items: Item[] = [
    { id: '1', label: 'Alice' },
    { id: '2', label: 'Bob' },
  ];

  return {
    showWithEmptyQuery: true,
    detectTrigger: ({ text, cursor }) => {
      const before = text.slice(0, cursor);
      const at = before.lastIndexOf('@');
      if (at < 0) return null;
      const query = before.slice(at + 1);
      if (!/^[a-zA-Z0-9_]*$/.test(query)) return null;
      if (at > 0 && !/\s/.test(before[at - 1]!)) return null;
      return { start: at, query };
    },
    getSuggestions: (query) =>
      items.filter((item) =>
        item.label.toLowerCase().startsWith(query.toLowerCase()),
      ),
    applySelection: (item, range) => {
      insert(range.start, range.end, item);
    },
    resolveSelectionRange: ({ text, cursor }, triggerStart) => {
      let end = cursor;
      while (end < text.length && /[a-zA-Z0-9_]/.test(text[end] ?? '')) {
        end += 1;
      }
      return { start: triggerStart, end };
    },
  };
}

describe('useSuggestable', () => {
  it('opens on trigger and filters suggestions', () => {
    const text = '@al';
    const cursor = 3;
    const config = mentionLikeConfig(() => {});

    const session = useSuggestable(
      () => text,
      () => cursor,
      config,
    );

    session.updateFromInput();

    expect(session.showPopup.value).toBe(true);
    expect(session.suggestions.value.map((s) => s.id)).toEqual(['1']);
  });

  it('closes on Escape and selects on Enter', () => {
    const text = '@';
    const cursor = 1;
    const inserted: Item[] = [];
    const config = mentionLikeConfig((_s, _e, item) => {
      inserted.push(item);
    });

    const session = useSuggestable(
      () => text,
      () => cursor,
      config,
    );
    session.updateFromInput();

    expect(session.handleKeydown(keyEvent('Escape'))).toBe(true);
    expect(session.showPopup.value).toBe(false);

    session.updateFromInput();
    expect(session.handleKeydown(keyEvent('Enter'))).toBe(true);
    expect(inserted[0]?.id).toBe('1');
    expect(session.showPopup.value).toBe(false);
  });

  it('navigates with arrow keys', () => {
    const text = '@';
    const cursor = 1;
    const config = mentionLikeConfig(() => {});

    const session = useSuggestable(
      () => text,
      () => cursor,
      config,
    );
    session.updateFromInput();

    session.handleKeydown(keyEvent('ArrowDown'));
    expect(session.selectedIndex.value).toBe(1);

    session.handleKeydown(keyEvent('ArrowUp'));
    expect(session.selectedIndex.value).toBe(0);
  });
});
