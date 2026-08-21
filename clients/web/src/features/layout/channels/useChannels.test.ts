import { describe, expect, it } from 'vitest';
import { ref } from 'vue';
import { useChannels, type ChannelCategory } from './useChannels';

describe('useChannels', () => {
  it('resolves activeChannel from nested categories', () => {
    const categories = ref<ChannelCategory[]>([
      {
        id: 'cat1',
        name: 'Text',
        channels: [
          { id: 'ch-a', name: 'a', type: 'text' },
          { id: 'ch-b', name: 'b', type: 'text' },
        ],
      },
    ]);
    const { activeChannelId, activeChannel } = useChannels(categories);
    activeChannelId.value = 'ch-b';
    expect(activeChannel.value?.id).toBe('ch-b');
  });

  it('returns null when id missing', () => {
    const categories = ref<ChannelCategory[]>([
      {
        id: 'c',
        name: 'C',
        channels: [{ id: 'only', name: 'o', type: 'text' }],
      },
    ]);
    const { activeChannelId, activeChannel } = useChannels(categories);
    activeChannelId.value = 'missing';
    expect(activeChannel.value).toBe(null);
  });
});
