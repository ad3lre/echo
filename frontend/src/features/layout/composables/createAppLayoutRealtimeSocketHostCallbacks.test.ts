import { describe, expect, it, vi } from 'vitest';
import { createAppLayoutRealtimeSocketHostCallbacks } from './createAppLayoutRealtimeSocketHostCallbacks';

describe('createAppLayoutRealtimeSocketHostCallbacks', () => {
  it('returns host callbacks and forwards onSocketConnected', () => {
    const extra = vi.fn();
    const cbs = createAppLayoutRealtimeSocketHostCallbacks({
      applyEchoPresenceFromSocket: vi.fn(),
      handleEchoDmActivity: vi.fn(),
      handleEchoDmCall: vi.fn(),
      mergeReadStateUpdate: vi.fn(),
      replaceAttentionSnapshot: vi.fn(),
      handleWorkspaceEvent: vi.fn(),
      onSocketConnectedExtra: extra,
      setChannelPinsFromEcho: vi.fn(),
      restorePinnedIds: vi.fn(),
      applyEchoChannelClientCap: vi.fn(),
      applyRealtimeAuthorHint: vi.fn(),
    });
    cbs.onSocketConnected?.({} as any);
    expect(extra).toHaveBeenCalledTimes(1);
    expect(typeof cbs.onEchoWorkspaceEvent).toBe('function');
  });
});
