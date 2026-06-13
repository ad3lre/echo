import { ref } from 'vue';
import { describe, expect, it } from 'vitest';
import {
  findMentionTrigger,
  useMentionAutocomplete,
} from './useMentionAutocomplete';

describe('findMentionTrigger', () => {
  it('matches @ at line start and after whitespace', () => {
    expect(findMentionTrigger('@al', 3)).toEqual({ start: 0, query: 'al' });
    expect(findMentionTrigger('hi @al', 6)).toEqual({ start: 3, query: 'al' });
  });

  it('does not match @ inside an existing mention entity', () => {
    expect(findMentionTrigger('@Ping ', 3, [{ start: 0, end: 5 }])).toBeNull();
  });

  it('matches a second @ after a completed mention', () => {
    expect(findMentionTrigger('@Ping @al', 9, [{ start: 0, end: 5 }])).toEqual({
      start: 6,
      query: 'al',
    });
  });

  it('matches @ immediately after a mention with no extra space', () => {
    expect(findMentionTrigger('@Ping@al', 8, [{ start: 0, end: 5 }])).toEqual({
      start: 5,
      query: 'al',
    });
  });

  it('rejects @ glued to plain text without a mention boundary', () => {
    expect(findMentionTrigger('@Alice@bob', 10)).toBeNull();
  });
});

describe('useMentionAutocomplete', () => {
  it('lists roles before users among non-special matches', () => {
    const text = '@';
    const cursor = 1;

    const users = ref([{ id: 'u1', name: 'Alice', kind: 'user' as const }]);
    const roles = ref([
      { id: 'r1', name: 'Moderators', kind: 'role' as const },
    ]);
    const mentionAutocomplete = useMentionAutocomplete(
      () => text,
      () => cursor,
      () => {},
      users,
      ref(true),
      undefined,
      roles,
    );

    mentionAutocomplete.updateFromInput();

    expect(mentionAutocomplete.suggestions.value.map((s) => s.id)).toEqual([
      '__everyone__',
      '__active__',
      'r1',
      'u1',
    ]);
  });

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
    let cursor = 3;

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

  it('opens a second mention after the first is inserted', () => {
    let text = '@';
    let cursor = 1;
    let mentions: { start: number; end: number }[] = [];

    const users = ref([
      { id: 'u1', name: 'Alice', kind: 'user' as const },
      { id: 'u2', name: 'Bob', kind: 'user' as const },
    ]);
    const mentionAutocomplete = useMentionAutocomplete(
      () => text,
      () => cursor,
      (start, end, option) => {
        const label = option.name;
        const replacement = `@${label} `;
        text = text.slice(0, start) + replacement + text.slice(end);
        mentions = [{ start, end: start + 1 + label.length }];
        cursor = text.length;
      },
      users,
      undefined,
      () => mentions,
    );

    mentionAutocomplete.updateFromInput();
    mentionAutocomplete.selectCurrent();
    mentionAutocomplete.updateFromInput();
    expect(mentionAutocomplete.showPopup.value).toBe(false);

    text += '@bo';
    cursor = text.length;
    mentionAutocomplete.updateFromInput();

    expect(mentionAutocomplete.showPopup.value).toBe(true);
    expect(mentionAutocomplete.suggestions.value[0]?.id).toBe('u2');
  });

  it('does not reopen after picking when caret lags inside the new mention', () => {
    let text = '@ping';
    let cursor = 5;
    let mentions: { start: number; end: number }[] = [];

    const users = ref([{ id: 'u1', name: 'Ping', kind: 'user' as const }]);
    const mentionAutocomplete = useMentionAutocomplete(
      () => text,
      () => cursor,
      (start, end, option) => {
        const label = option.name;
        const replacement = `@${label} `;
        text = text.slice(0, start) + replacement + text.slice(end);
        mentions = [{ start, end: start + 1 + label.length }];
        // Simulate stale caret before TipTap sync catches up.
        cursor = 3;
      },
      users,
      undefined,
      () => mentions,
    );

    mentionAutocomplete.updateFromInput();
    mentionAutocomplete.selectCurrent();
    mentionAutocomplete.updateFromInput();

    expect(mentionAutocomplete.showPopup.value).toBe(false);
  });
});
