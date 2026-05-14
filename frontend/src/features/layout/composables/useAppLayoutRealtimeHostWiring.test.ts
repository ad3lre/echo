import { describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';
import { useAppLayoutRealtimeHostWiring } from './useAppLayoutRealtimeHostWiring';

describe('useAppLayoutRealtimeHostWiring', () => {
  it('returns hostCallbacks with expected keys', () => {
    const echoSession = {
      noteWorkspaceEventVersion: vi.fn(() => true),
    } as unknown as Parameters<
      typeof useAppLayoutRealtimeHostWiring
    >[0]['echoSession'];

    const { hostCallbacks } = useAppLayoutRealtimeHostWiring({
      echoSession,
      liveChannelCapabilitiesRefreshKey: ref(0),
      hydrateEchoFromApi: vi.fn(),
      refreshEchoSocialFromApi: vi.fn(),
      syncEchoPresenceFromApi: vi.fn(),
      echoChannelHistory: {
        hydrateAttentionSnapshot: vi.fn(),
        applyEchoChannelClientCap: vi.fn(),
      },
      applyEchoPresenceFromSocket: vi.fn(),
      handleEchoDmActivity: vi.fn(),
      handleEchoDmCall: vi.fn(),
      mergeReadStateUpdate: vi.fn(),
      replaceAttentionSnapshot: vi.fn(),
      setChannelPinsFromEcho: vi.fn(),
      restorePinnedIds: vi.fn(),
      applyRealtimeAuthorHint: vi.fn(),
    });

    expect(hostCallbacks.onPresenceUpdate).toBeDefined();
    expect(hostCallbacks.onEchoWorkspaceEvent).toBeDefined();
    expect(hostCallbacks.onSocketConnected).toBeDefined();
    expect(hostCallbacks.applyEchoChannelClientCap).toBeDefined();
    expect(hostCallbacks.applyRealtimeAuthorHint).toBeDefined();
  });
});
