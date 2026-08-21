import { describe, expect, it } from 'vitest';
import { effectScope, nextTick, ref } from 'vue';
import { useDmCallWithUserIdShellLogMirror } from './useDmCallWithUserIdShellLogMirror';

describe('useDmCallWithUserIdShellLogMirror', () => {
  it('mirrors source to target immediately and on change', async () => {
    const scope = effectScope(true);
    const source = ref<string | null>('a');
    const target = ref<string | null>(null);
    scope.run(() => {
      useDmCallWithUserIdShellLogMirror(source, target);
    });
    expect(target.value).toBe('a');
    source.value = 'b';
    await nextTick();
    expect(target.value).toBe('b');
    scope.stop();
  });
});
