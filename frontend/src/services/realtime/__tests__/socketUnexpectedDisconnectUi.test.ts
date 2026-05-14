import { describe, expect, it, vi } from 'vitest';
import {
  maybeEmitEchoSocketUnexpectedDisconnectUi,
  SOCKET_UNEXPECTED_DISCONNECT_UI_COOLDOWN_MS,
} from '../socketUnexpectedDisconnectUi';

describe('maybeEmitEchoSocketUnexpectedDisconnectUi', () => {
  it('returns false when socket is disabled', () => {
    const emit = vi.fn();
    expect(
      maybeEmitEchoSocketUnexpectedDisconnectUi(
        {
          reason: 'transport close',
          socketOff: () => true,
          nowMs: 1000,
          lastEmitAtMs: 0,
        },
        emit,
      ),
    ).toBe(false);
    expect(emit).not.toHaveBeenCalled();
  });

  it('returns false for voluntary io client disconnect', () => {
    const emit = vi.fn();
    expect(
      maybeEmitEchoSocketUnexpectedDisconnectUi(
        {
          reason: 'io client disconnect',
          socketOff: () => false,
          nowMs: 1000,
          lastEmitAtMs: 0,
        },
        emit,
      ),
    ).toBe(false);
    expect(emit).not.toHaveBeenCalled();
  });

  it('returns false when within cooldown', () => {
    const emit = vi.fn();
    const now = 10_000;
    expect(
      maybeEmitEchoSocketUnexpectedDisconnectUi(
        {
          reason: 'ping timeout',
          socketOff: () => false,
          nowMs: now,
          lastEmitAtMs: now - SOCKET_UNEXPECTED_DISCONNECT_UI_COOLDOWN_MS + 1,
        },
        emit,
      ),
    ).toBe(false);
    expect(emit).not.toHaveBeenCalled();
  });

  it('emits and returns true when allowed', () => {
    const emit = vi.fn();
    const now = 50_000;
    expect(
      maybeEmitEchoSocketUnexpectedDisconnectUi(
        {
          reason: 'transport error',
          socketOff: () => false,
          nowMs: now,
          lastEmitAtMs: 0,
        },
        emit,
      ),
    ).toBe(true);
    expect(emit).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'SOCKET_UNEXPECTED_DISCONNECT',
        severity: 'info',
      }),
    );
  });
});
