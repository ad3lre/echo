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
});
