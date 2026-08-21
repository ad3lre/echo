import { describe, expect, it } from 'vitest';
import { ref } from 'vue';
import { useComputedRefAlias } from './useComputedRefAlias';

describe('useComputedRefAlias', () => {
  it('mirrors ref value', () => {
    const r = ref(false);
    const alias = useComputedRefAlias(r);
    expect(alias.value).toBe(false);
    r.value = true;
    expect(alias.value).toBe(true);
  });
});
