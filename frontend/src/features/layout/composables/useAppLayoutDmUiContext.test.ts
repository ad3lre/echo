import { describe, expect, it } from 'vitest';
import { ref } from 'vue';
import { useAppLayoutDmUiContext } from './useAppLayoutDmUiContext';

describe('useAppLayoutDmUiContext', () => {
  it('is true on dm rail', () => {
    const isDm = useAppLayoutDmUiContext(ref('dm'));
    expect(isDm.value).toBe(true);
  });

  it('is false on servers rail', () => {
    const isDm = useAppLayoutDmUiContext(ref('servers'));
    expect(isDm.value).toBe(false);
  });
});
