import { describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';
import {
  findChannelTrigger,
  useChannelAutocomplete,
} from './useChannelAutocomplete';

function setup(
  text: string,
  cursor: number,
  channelNames: string[] = ['general', 'random'],
  mentions: { start: number; end: number }[] = [],
) {
  const channels = ref(
    channelNames.map((name, i) => ({
      id: `id-${i}`,
      name,
      type: 'text' as const,
    })),
  );
  const insert = vi.fn();
  const ac = useChannelAutocomplete(
    () => text,
    () => cursor,
    insert,
    channels,
    () => mentions,
  );
  ac.updateFromInput();
  return { ac, insert };
}

describe('findChannelTrigger', () => {
  it('matches # at line start and after whitespace', () => {
    expect(findChannelTrigger('#gen', 4)).toEqual({ start: 0, query: 'gen' });
    expect(findChannelTrigger('hi #gen', 7)).toEqual({
      start: 3,
      query: 'gen',
    });
  });

  it('does not match # inside an existing mention entity', () => {
    expect(
      findChannelTrigger('#general ', 8, [{ start: 0, end: 8 }]),
    ).toBeNull();
  });

  it('matches a second # after a completed channel mention', () => {
    const text = '#general #ran';
    expect(
      findChannelTrigger(text, text.length, [{ start: 0, end: 8 }]),
    ).toEqual({ start: 9, query: 'ran' });
  });
});

describe('useChannelAutocomplete', () => {
  it('does not open for bare # at end', () => {
    const t = 'hello #';
    const { ac } = setup(t, t.length);
    expect(ac.triggerStart.value).toBeNull();
    expect(ac.showPopup.value).toBe(false);
  });

  it('does not open for # followed by space', () => {
    const t = 'hello # ';
    const { ac } = setup(t, t.length);
    expect(ac.triggerStart.value).toBeNull();
  });

  it('opens for # + digit', () => {
    const t = 'hello #1';
    const { ac } = setup(t, t.length);
    expect(ac.triggerStart.value).toBe(t.indexOf('#'));
    expect(ac.query.value).toBe('1');
    expect(ac.showPopup.value).toBe(true);
  });

  it('opens for # + letter', () => {
    const t = 'x #gen';
    const { ac } = setup(t, t.length);
    expect(ac.triggerStart.value).toBe(t.indexOf('#'));
    expect(ac.query.value).toBe('gen');
    expect(ac.showPopup.value).toBe(true);
  });

  it('consumes trailing query chars when caret lags on select', () => {
    let text = '#gen';
    let cursor = 3;

    const channels = ref([
      { id: 'id-0', name: 'general', type: 'text' as const },
    ]);
    const ac = useChannelAutocomplete(
      () => text,
      () => cursor,
      (start, end, option) => {
        const label = option.name;
        text = `${text.slice(0, start)}#${label} ${text.slice(end)}`;
        cursor = start + label.length + 2;
      },
      channels,
    );

    ac.updateFromInput();
    ac.selectCurrent();

    expect(text).toBe('#general ');
  });

  it('does not reopen after picking when caret lags inside the new mention', () => {
    let text = '#gen';
    let cursor = 4;
    let mentions: { start: number; end: number }[] = [];

    const channels = ref([
      { id: 'id-0', name: 'general', type: 'text' as const },
    ]);
    const ac = useChannelAutocomplete(
      () => text,
      () => cursor,
      (start, end, option) => {
        const label = option.name;
        const replacement = `#${label} `;
        text = text.slice(0, start) + replacement + text.slice(end);
        mentions = [{ start, end: start + 1 + label.length }];
        cursor = 3;
      },
      channels,
      () => mentions,
    );

    ac.updateFromInput();
    ac.selectCurrent();
    ac.updateFromInput();

    expect(ac.showPopup.value).toBe(false);
  });
});
