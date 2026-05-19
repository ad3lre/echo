import { describe, expect, it } from 'vitest';
import { ref } from 'vue';
import { useEchoRolePreviewStateComputed } from './useEchoRolePreviewStateComputed';

describe('useEchoRolePreviewStateComputed', () => {
  it('mirrors ref and coerces null', () => {
    const r = ref<{
      serverId: string;
      roleId: string;
      roleName: string;
      roleColor: string;
      uiPermissions: string[];
    } | null>({
      serverId: 's1',
      roleId: 'r1',
      roleName: 'Mod',
      roleColor: '#fff',
      uiPermissions: [],
    });
    const c = useEchoRolePreviewStateComputed(r);
    expect(c.value?.serverId).toBe('s1');
    r.value = null;
    expect(c.value).toBeNull();
  });
});
