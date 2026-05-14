import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createPresenceHeartbeatSession,
  ECHO_PRESENCE_HEARTBEAT_INTERVAL_MS,
  parseRelayablePresenceStatus,
  tryEmitPresenceHeartbeat,
  tryEmitPresenceSet,
} from '../socketPresenceSession';

describe('parseRelayablePresenceStatus', () => {
  it('accepts known statuses', () => {
    expect(parseRelayablePresenceStatus('online')).toBe('online');
    expect(parseRelayablePresenceStatus('do_not_disturb')).toBe(
      'do_not_disturb',
    );
  });

  it('rejects unknown or empty', () => {
    expect(parseRelayablePresenceStatus(undefined)).toBeUndefined();
    expect(parseRelayablePresenceStatus('')).toBeUndefined();
    expect(parseRelayablePresenceStatus('away')).toBeUndefined();
  });
});

describe('tryEmitPresenceSet', () => {
  it('no-ops without adapter or connection', () => {
    const emit = vi.fn();
    tryEmitPresenceSet({ emit }, false, 'online');
    tryEmitPresenceSet(null, true, 'online');
    expect(emit).not.toHaveBeenCalled();
  });

  it('emits when connected', () => {
    const emit = vi.fn();
    tryEmitPresenceSet({ emit }, true, 'idle');
    expect(emit).toHaveBeenCalledWith(
      'presence:set',
      expect.objectContaining({ status: 'idle', client: 'web' }),
    );
  });

  it('uses fallback when status is missing but fallback is set', () => {
    const emit = vi.fn();
    tryEmitPresenceSet({ emit }, true, undefined, {
      fallbackIfUnspecified: 'online',
    });
    expect(emit).toHaveBeenCalledWith(
      'presence:set',
      expect.objectContaining({ status: 'online', client: 'web' }),
    );
  });

  it('does not override explicit offline with fallback', () => {
    const emit = vi.fn();
    tryEmitPresenceSet({ emit }, true, 'offline', {
      fallbackIfUnspecified: 'online',
    });
    expect(emit).toHaveBeenCalledWith(
      'presence:set',
      expect.objectContaining({ status: 'offline', client: 'web' }),
    );
  });
});

describe('tryEmitPresenceHeartbeat', () => {
  it('emits heartbeat when connected', () => {
    const emit = vi.fn();
    tryEmitPresenceHeartbeat({ emit }, true, 'online');
    expect(emit).toHaveBeenCalledWith(
      'presence:heartbeat',
      expect.objectContaining({ status: 'online', client: 'web' }),
    );
  });
});

describe('createPresenceHeartbeatSession', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts interval and emits on tick', () => {
    const emit = vi.fn();
    const session = createPresenceHeartbeatSession({
      getAdapter: () => ({ emit }),
      getSocketConnected: () => true,
      intervalMs: 10_000,
    });
    session.start('online');
    expect(emit).not.toHaveBeenCalled();
    vi.advanceTimersByTime(10_000);
    expect(emit).toHaveBeenCalledWith(
      'presence:heartbeat',
      expect.objectContaining({ status: 'online', client: 'web' }),
    );
    session.stop();
  });

  it('does not start for invalid status', () => {
    const emit = vi.fn();
    const session = createPresenceHeartbeatSession({
      getAdapter: () => ({ emit }),
      getSocketConnected: () => true,
      intervalMs: ECHO_PRESENCE_HEARTBEAT_INTERVAL_MS,
    });
    session.start('nope');
    vi.advanceTimersByTime(ECHO_PRESENCE_HEARTBEAT_INTERVAL_MS);
    expect(emit).not.toHaveBeenCalled();
  });

  it('restart replaces previous interval', () => {
    const emit = vi.fn();
    const session = createPresenceHeartbeatSession({
      getAdapter: () => ({ emit }),
      getSocketConnected: () => true,
      intervalMs: 5_000,
    });
    session.start('online');
    session.start('idle');
    vi.advanceTimersByTime(5_000);
    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledWith(
      'presence:heartbeat',
      expect.objectContaining({ status: 'idle', client: 'web' }),
    );
    session.stop();
  });
});
