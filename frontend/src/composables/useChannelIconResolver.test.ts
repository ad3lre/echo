import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { ref } from 'vue';
import { useChannelIconResolver } from './useChannelIconResolver';

describe('useChannelIconResolver', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });
  it('applies svg invert for heuristic icons when iconKey is empty', () => {
    const { usesSvgInvert } = useChannelIconResolver(ref(undefined));
    expect(
      usesSvgInvert({
        name: 'general',
        type: 'text',
        iconKey: '',
      }),
    ).toBe(true);
  });

  it('does not invert raster or unicode emoji channel icons', () => {
    const { usesSvgInvert } = useChannelIconResolver(ref(undefined));
    expect(
      usesSvgInvert({
        name: 'memes',
        type: 'text',
        iconKey: 'emoji:🎉',
      }),
    ).toBe(false);
    expect(
      usesSvgInvert({
        name: 'custom',
        type: 'text',
        iconKey:
          'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      }),
    ).toBe(false);
  });

  it('still resolves invert from iconKey when only a key is passed', () => {
    const { usesSvgInvert } = useChannelIconResolver(ref(undefined));
    expect(usesSvgInvert('message')).toBe(true);
    expect(usesSvgInvert('emoji:🎉')).toBe(false);
  });
});
