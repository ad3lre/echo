import { ref } from 'vue';
import { describe, expect, it } from 'vitest';
import { useMentionAutocomplete } from './useMentionAutocomplete';

describe('useMentionAutocomplete', () => {
  it('lists non-offline users before offline among matches (broadcast options first)', () => {
    const text = '@';
    const cursor = 1;

    const users = ref([
      { id: 'a', name: 'Zed', status: 'offline', kind: 'user' as const },
      { id: 'b', name: 'Amy', status: 'offline', kind: 'user' as const },
      { id: 'c', name: 'Mia', status: 'online', kind: 'user' as const },
      { id: 'd', name: 'Ben', status: 'online', kind: 'user' as const },
    ]);
    const mentionAutocomplete = useMentionAutocomplete(
      () => text,
      () => cursor,
      () => {},
      users,
      ref(true),
    );

    mentionAutocomplete.updateFromInput();

    expect(mentionAutocomplete.suggestions.value.map((s) => s.id)).toEqual([
      '__everyone__',
      '__active__',
      'd',
      'c',
      'b',
      'a',
    ]);
  });

  it('consumes trailing query chars when caret lags on Enter', () => {
    let text = '@ali';
    let cursor = 3; // stale caret before final "i"

    const users = ref([{ id: 'u1', name: 'Alice', kind: 'user' as const }]);
    const mentionAutocomplete = useMentionAutocomplete(
      () => text,
      () => cursor,
      (start, end, option) => {
        text = `${text.slice(0, start)}@${option.name} ${text.slice(end)}`;
        cursor = start + option.name.length + 2;
      },
      users,
    );

    mentionAutocomplete.updateFromInput();
    mentionAutocomplete.selectCurrent();

    expect(text).toBe('@Alice ');
  });

  it('matches users by nickname/username aliases', () => {
    const text = '@mad';
    const cursor = text.length;
    const users = ref([
      {
        id: 'u1',
        name: 'Real Adel',
        aliases: ['Madam Julia', 'adel_real'],
        kind: 'user' as const,
      },
    ]);
    const mentionAutocomplete = useMentionAutocomplete(
      () => text,
      () => cursor,
      () => {},
      users,
    );

    mentionAutocomplete.updateFromInput();

    expect(
      mentionAutocomplete.suggestions.value.some((s) => s.id === 'u1'),
    ).toBe(true);
  });
});
