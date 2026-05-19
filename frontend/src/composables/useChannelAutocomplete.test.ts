import { describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';
import { useChannelAutocomplete } from './useChannelAutocomplete';

function setup(
  text: string,
  cursor: number,
  channelNames: string[] = ['general', 'random'],
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
  );
  ac.updateFromInput();
  return ac;
}

describe('useChannelAutocomplete', () => {
  it('does not open for bare # at end', () => {
    const t = 'hello #';
    const ac = setup(t, t.length);
    expect(ac.triggerStart.value).toBeNull();
    expect(ac.showPopup.value).toBe(false);
  });

  it('does not open for # followed by space', () => {
    const t = 'hello # ';
    const ac = setup(t, t.length);
    expect(ac.triggerStart.value).toBeNull();
  });

  it('opens for # + digit', () => {
    const t = 'hello #1';
    const ac = setup(t, t.length);
    expect(ac.triggerStart.value).toBe(t.indexOf('#'));
    expect(ac.query.value).toBe('1');
    expect(ac.showPopup.value).toBe(true);
  });

  it('opens for # + letter', () => {
    const t = 'x #gen';
    const ac = setup(t, t.length);
    expect(ac.triggerStart.value).toBe(t.indexOf('#'));
    expect(ac.query.value).toBe('gen');
    expect(ac.showPopup.value).toBe(true);
  });
});
