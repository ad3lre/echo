import { describe, expect, it } from 'vitest';
import { ref } from 'vue';
import { createNavigateToChannelActiveOnly } from './createNavigateToChannelActiveOnly';

describe('createNavigateToChannelActiveOnly', () => {
  it('writes active channel id', () => {
    const activeChannelId = ref('');
    const go = createNavigateToChannelActiveOnly(activeChannelId);
    go('ch-1');
    expect(activeChannelId.value).toBe('ch-1');
  });
});
