import { describe, expect, it } from 'vitest';
import { reactive, ref } from 'vue';
import { useAppLayoutRailLoadingDerived } from './useAppLayoutRailLoadingDerived';

describe('useAppLayoutRailLoadingDerived', () => {
  it('isServerRailFastSwitchPending is false on explore rail', () => {
    const serverStore = reactive({
      selectedServerId: 'srv1' as string | null,
    });
    const workspace = {
      categoriesByServer: ref<Record<string, unknown[]>>({ srv1: [{}] }),
      messages: ref<Record<string, unknown[]>>({ ch1: [{}] }),
    };
    const { isServerRailFastSwitchPending } = useAppLayoutRailLoadingDerived({
      immediateShellSwitchPending: ref(true),
      activeRailTab: ref<'servers' | 'explore' | 'dm'>('explore'),
      serverStore: serverStore as unknown as Parameters<
        typeof useAppLayoutRailLoadingDerived
      >[0]['serverStore'],
      workspace: workspace as unknown as Parameters<
        typeof useAppLayoutRailLoadingDerived
      >[0]['workspace'],
      activeChannelId: ref('ch1'),
    });
    expect(isServerRailFastSwitchPending.value).toBe(false);
  });

  it('isMessageSurfaceSwitchLoading when pending and messages empty for channel', () => {
    const serverStore = reactive({
      selectedServerId: 'srv1' as string | null,
    });
    const workspace = {
      categoriesByServer: ref({ srv1: [{ channels: [{ id: 'ch1' }] }] }),
      messages: ref<Record<string, unknown[]>>({ ch1: [] }),
    };
    const { isMessageSurfaceSwitchLoading } = useAppLayoutRailLoadingDerived({
      immediateShellSwitchPending: ref(true),
      activeRailTab: ref<'servers' | 'explore' | 'dm'>('servers'),
      serverStore: serverStore as unknown as Parameters<
        typeof useAppLayoutRailLoadingDerived
      >[0]['serverStore'],
      workspace: workspace as unknown as Parameters<
        typeof useAppLayoutRailLoadingDerived
      >[0]['workspace'],
      activeChannelId: ref('ch1'),
    });
    expect(isMessageSurfaceSwitchLoading.value).toBe(true);
  });
});
