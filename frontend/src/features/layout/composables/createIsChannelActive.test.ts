import { describe, expect, it } from 'vitest';
import { ref } from 'vue';
import { createIsChannelActive } from './createIsChannelActive';

describe('createIsChannelActive', () => {
  it('matches active channel id', () => {
    const activeChannelId = ref('c1');
    const isActive = createIsChannelActive(activeChannelId);
    expect(isActive('c1')).toBe(true);
    expect(isActive('c2')).toBe(false);
    activeChannelId.value = 'c2';
    expect(isActive('c2')).toBe(true);
  });
});
