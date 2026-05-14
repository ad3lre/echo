import { describe, expect, it } from 'vitest';
import { ref } from 'vue';
import { usePreviewCanModerateMembersComputed } from './usePreviewCanModerateMembersComputed';

describe('usePreviewCanModerateMembersComputed', () => {
  it('tracks previewCanModerateMembers()', () => {
    const flag = ref(false);
    const c = usePreviewCanModerateMembersComputed({
      previewCanModerateMembers: () => flag.value,
    });
    expect(c.value).toBe(false);
    flag.value = true;
    expect(c.value).toBe(true);
  });
});
