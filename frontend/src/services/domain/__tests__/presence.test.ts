import { describe, it, expect } from 'vitest';
import {
  applyPresenceUpdate,
  selectPresence,
  selectSelfPresence,
} from '../presence';

describe('applyPresenceUpdate', () => {
  it('updates user status when valid', () => {
    const users = [
      { id: 'u1', status: 'online' },
      { id: 'u2', status: 'online' },
    ];
    const out = applyPresenceUpdate(users as any, {
      userId: 'u2',
      status: 'idle',
    });
    expect(out.find((u) => u.id === 'u2')?.status).toBe('idle');
  });

  it('ignores invalid status', () => {
    const users = [{ id: 'u1', status: 'online' }];
    const out = applyPresenceUpdate(users as any, {
      userId: 'u1',
      status: 'unknown',
    });
    expect(out[0].status).toBe('online');
  });
});

describe('selectPresence', () => {
  it('prefers authoritative presence over stale row status', () => {
    expect(
      selectPresence({
        authoritativeStatus: 'idle',
        rowStatus: 'offline',
      }).status,
    ).toBe('idle');
  });

  it('keeps unknown presence distinct from offline', () => {
    const selected = selectPresence({ rowStatus: '' });
    expect(selected.isLoaded).toBe(false);
    expect(selected.isOffline).toBe(false);
    expect(selected.label).toBe('Unknown');
  });
});

describe('selectSelfPresence', () => {
  it('prefers live self presence over stale session status', () => {
    expect(
      selectSelfPresence({
        userId: 'u1',
        authoritativeStatusesByUserId: { u1: 'idle' },
        sessionStatus: 'online',
        rowStatus: 'offline',
      }).status,
    ).toBe('idle');
  });
});
