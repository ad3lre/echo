import { describe, expect, it } from 'vitest';
import { ref } from 'vue';
import { createBumpLiveChannelCapabilitiesKey } from './createBumpLiveChannelCapabilitiesKey';

describe('createBumpLiveChannelCapabilitiesKey', () => {
  it('increments refresh key', () => {
    const k = ref(0);
    const bump = createBumpLiveChannelCapabilitiesKey(k);
    bump();
    expect(k.value).toBe(1);
    bump();
    expect(k.value).toBe(2);
  });
});
