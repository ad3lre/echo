import { describe, expect, it, vi } from 'vitest';
import { createEchoRealtimeSocketConnectedExtra } from './createEchoRealtimeSocketConnectedExtra';

describe('createEchoRealtimeSocketConnectedExtra', () => {
  it('syncs presence and hydrates attention (voids async)', () => {
    const syncEchoPresenceFromApi = vi.fn();
    const hydrateAttentionSnapshot = vi.fn(() => Promise.resolve());
    const extra = createEchoRealtimeSocketConnectedExtra({
      syncEchoPresenceFromApi,
      hydrateAttentionSnapshot,
    });
    extra();
    expect(syncEchoPresenceFromApi).toHaveBeenCalledTimes(1);
    expect(hydrateAttentionSnapshot).toHaveBeenCalledTimes(1);
  });

  it('schedules tail sync after connect when provided', () => {
    const scheduleActiveChannelTailSyncAfterConnect = vi.fn();
    const extra = createEchoRealtimeSocketConnectedExtra({
      syncEchoPresenceFromApi: vi.fn(),
      hydrateAttentionSnapshot: vi.fn(),
      scheduleActiveChannelTailSyncAfterConnect,
    });
    extra();
    expect(scheduleActiveChannelTailSyncAfterConnect).toHaveBeenCalledWith(
      'socket_connected',
    );
  });
});
