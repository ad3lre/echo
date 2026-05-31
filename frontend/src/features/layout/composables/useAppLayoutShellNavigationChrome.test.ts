import { describe, expect, it } from 'vitest';
import { computed, ref } from 'vue';
import { useAppLayoutShellNavigationChrome } from '@/features/layout/composables/useAppLayoutShellNavigationChrome';

describe('useAppLayoutShellNavigationChrome', () => {
  it('opens more-servers panel when top rail selection is overflow', () => {
    const isMoreServersPanelOpen = ref(false);
    useAppLayoutShellNavigationChrome({
      activeChannelId: ref('ch1'),
      selectedServer: computed(() => ({ id: 's1', name: 'Server' })),
      activeChannel: computed(() => ({ id: 'ch1', name: 'general' }) as never),
      isMoreServersPanelOpen,
      actionRailTopLayout: computed(() => true),
      serverStore: {
        selectedServerId: 'hidden',
        visibleServers: [{ id: 'visible' }],
        servers: [{ id: 'hidden' }],
      },
    });
    expect(isMoreServersPanelOpen.value).toBe(true);
  });
});
