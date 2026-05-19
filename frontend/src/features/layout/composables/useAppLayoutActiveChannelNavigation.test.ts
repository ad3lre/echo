import { describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';
import { useAppLayoutActiveChannelNavigation } from './useAppLayoutActiveChannelNavigation';

const logShellNav = vi.fn();

vi.mock('@/features/layout/shellNavDebugLog', () => ({
  logShellNav: (...args: unknown[]) => logShellNav(...args),
}));

describe('useAppLayoutActiveChannelNavigation', () => {
  it('sets active channel and leaves DM panel open for DM thread ids', () => {
    logShellNav.mockClear();
    const activeChannelId = ref('');
    const isDMPanelOpen = ref(true);
    const echoDmThreadIds = ref(new Set<string>(['dm1']));
    const { handleActiveChannelChangeNavigation } =
      useAppLayoutActiveChannelNavigation({
        activeChannelId,
        isDMPanelOpen,
        echoDmThreadIds,
        findChannelContextById: () => null,
      });
    handleActiveChannelChangeNavigation('dm1');
    expect(activeChannelId.value).toBe('dm1');
    expect(isDMPanelOpen.value).toBe(true);
  });

  it('closes DM panel when selecting a guild text channel', () => {
    logShellNav.mockClear();
    const activeChannelId = ref('');
    const isDMPanelOpen = ref(true);
    const echoDmThreadIds = ref(new Set<string>());
    const { handleActiveChannelChangeNavigation } =
      useAppLayoutActiveChannelNavigation({
        activeChannelId,
        isDMPanelOpen,
        echoDmThreadIds,
        findChannelContextById: () => ({
          channel: { id: 't1', name: 'general', type: 'text' as const },
          category: {},
        }),
      });
    handleActiveChannelChangeNavigation('t1');
    expect(activeChannelId.value).toBe('t1');
    expect(isDMPanelOpen.value).toBe(false);
  });
});
