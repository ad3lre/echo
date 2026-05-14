import { describe, expect, it } from 'vitest';
import { ref } from 'vue';
import { useAppLayoutWorkspaceReadyComputed } from './useAppLayoutWorkspaceReadyComputed';

describe('useAppLayoutWorkspaceReadyComputed', () => {
  it('is false while loading, true when not', () => {
    const loading = ref(true);
    const ready = useAppLayoutWorkspaceReadyComputed(loading);
    expect(ready.value).toBe(false);
    loading.value = false;
    expect(ready.value).toBe(true);
  });
});
