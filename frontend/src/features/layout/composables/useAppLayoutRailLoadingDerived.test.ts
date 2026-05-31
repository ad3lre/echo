import { describe, expect, it } from 'vitest';
import { reactive, ref } from 'vue';
import { useAppLayoutRailLoadingDerived } from './useAppLayoutRailLoadingDerived';

describe('useAppLayoutRailLoadingDerived', () => {
  it('isServerRailFastSwitchPending is false on explore rail', () => {
    const serverStore = reactive({
      selectedServerId: 'srv1' as string | null,
    });
    const workspace = {
      loading: ref(false),
      fromApi: ref(true),
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
      loading: ref(false),
      fromApi: ref(true),
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

  it('isMessageSurfaceSwitchLoading during cold-start workspace hydrate', () => {
    const serverStore = reactive({
      selectedServerId: null as string | null,
    });
    const workspace = {
      loading: ref(true),
      fromApi: ref(false),
      categoriesByServer: ref<Record<string, unknown[]>>({}),
      messages: ref<Record<string, unknown[]>>({}),
    };
    const { isMessageSurfaceSwitchLoading, isChannelPanelSwitchLoading } =
      useAppLayoutRailLoadingDerived({
        immediateShellSwitchPending: ref(false),
        activeRailTab: ref<'servers' | 'explore' | 'dm'>('servers'),
        serverStore: serverStore as unknown as Parameters<
          typeof useAppLayoutRailLoadingDerived
        >[0]['serverStore'],
        workspace: workspace as unknown as Parameters<
          typeof useAppLayoutRailLoadingDerived
        >[0]['workspace'],
        activeChannelId: ref(''),
      });
    expect(isChannelPanelSwitchLoading.value).toBe(true);
    expect(isMessageSurfaceSwitchLoading.value).toBe(true);
  });
});
