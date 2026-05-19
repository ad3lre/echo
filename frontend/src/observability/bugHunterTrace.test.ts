import { afterEach, describe, expect, it } from 'vitest';
import {
  clearBugHunterTrace,
  getBugHunterTracePayload,
  pushBugHunterEntry,
  sanitizeBugHunterMeta,
  setBugHunterRecordingEnabled,
  trimTraceIfNeededForSubmit,
} from './bugHunterTrace';

describe('bugHunterTrace', () => {
  afterEach(() => {
    setBugHunterRecordingEnabled(false);
    clearBugHunterTrace();
  });

  it('records when enabled and clears when disabled', () => {
    setBugHunterRecordingEnabled(true);
    clearBugHunterTrace();
    pushBugHunterEntry({ kind: 'app', event: 'test', meta: { x: 1 } });
    expect(getBugHunterTracePayload().entries.length).toBe(1);
    setBugHunterRecordingEnabled(false);
    clearBugHunterTrace();
    pushBugHunterEntry({ kind: 'app', event: 'ignored' });
    expect(getBugHunterTracePayload().entries.length).toBe(0);
  });

  it('trimTraceIfNeededForSubmit slices large payloads', () => {
    setBugHunterRecordingEnabled(true);
    clearBugHunterTrace();
    for (let i = 0; i < 50; i++) {
      pushBugHunterEntry({ kind: 'socket', event: `e${i}`, meta: { i } });
    }
    const trimmed = trimTraceIfNeededForSubmit(500);
    expect(trimmed.truncated).toBe(true);
    expect(trimmed.entries.length).toBeLessThan(50);
  });

  it('redacts sensitive keys and token-shaped values', () => {
    const jwt =
      'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.signaturepart';
    const sanitized = sanitizeBugHunterMeta({
      accessToken: 'plain-secret-token',
      Authorization: `Bearer ${jwt}`,
      jwtParts: 3,
      nested: {
        password: 'hunter2',
        message: `connect failed for ${jwt}`,
      },
      tokenChars: 128,
      url: `wss://voice.example/livekit?token=${jwt}&room=abc`,
    });

    expect(sanitized?.accessToken).toBe('[redacted]');
    expect(sanitized?.Authorization).toBe('[redacted]');
    expect(sanitized?.jwtParts).toBe(3);
    expect(sanitized?.tokenChars).toBe(128);
    expect(sanitized?.url).toBe(
      'wss://voice.example/livekit?token=[redacted]&room=abc',
    );

    const nested = sanitized?.nested as Record<string, unknown>;
    expect(nested.password).toBe('[redacted]');
    expect(nested.message).toBe('connect failed for [redacted:jwt]');
    expect(JSON.stringify(sanitized)).not.toContain(jwt);
    expect(JSON.stringify(sanitized)).not.toContain('plain-secret-token');
  });
});
