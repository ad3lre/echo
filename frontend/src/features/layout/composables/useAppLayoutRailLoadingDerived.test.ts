import { describe, expect, it } from 'vitest';
import { reactive, ref } from 'vue';
import { useAppLayoutRailLoadingDerived } from './useAppLayoutRailLoadingDerived';

function mockWorkspace(overrides: {
  loading?: boolean;
  fromApi?: boolean;
  initialLoadInFlight?: boolean;
  categoriesByServer?: Record<string, unknown[]>;
  messages?: Record<string, unknown[]>;
}) {
  return {
    loading: ref(overrides.loading ?? false),
    fromApi: ref(overrides.fromApi ?? true),
    initialLoadInFlight: ref(overrides.initialLoadInFlight ?? false),
    categoriesByServer: ref(overrides.categoriesByServer ?? {}),
    messages: ref(overrides.messages ?? {}),
  };
}

describe('useAppLayoutRailLoadingDerived', () => {
  it('isServerRailFastSwitchPending is false on explore rail', () => {
    const serverStore = reactive({
      selectedServerId: 'srv1' as string | null,
    });
    const workspace = mockWorkspace({
      categoriesByServer: { srv1: [{}] },
      messages: { ch1: [{}] },
    });
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
    const workspace = mockWorkspace({
      categoriesByServer: { srv1: [{ channels: [{ id: 'ch1' }] }] },
      messages: { ch1: [] },
    });
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
    const workspace = mockWorkspace({
      loading: true,
      fromApi: false,
      initialLoadInFlight: true,
    });
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

  it('channel panel loading during warm reconcile without tree key', () => {
    const serverStore = reactive({
      selectedServerId: 'srv1' as string | null,
    });
    const workspace = mockWorkspace({
      loading: false,
      fromApi: true,
      initialLoadInFlight: true,
      categoriesByServer: {},
    });
    const { isChannelPanelSwitchLoading, isGuildShellSettling } =
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
    expect(isGuildShellSettling.value).toBe(true);
    expect(isChannelPanelSwitchLoading.value).toBe(true);
  });

  it('allows empty channel tree after load settles', () => {
    const serverStore = reactive({
      selectedServerId: 'srv1' as string | null,
    });
    const workspace = mockWorkspace({
      initialLoadInFlight: false,
      categoriesByServer: { srv1: [] },
    });
    const { isChannelPanelSwitchLoading } = useAppLayoutRailLoadingDerived({
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
    expect(isChannelPanelSwitchLoading.value).toBe(false);
  });
});
