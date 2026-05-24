import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearEchoWorkspaceCache,
  loadEchoWorkspaceFromCache,
  saveEchoWorkspaceToCache,
} from '@/utils/workspacePersistence';
import type { EchoWorkspaceState } from '@/api/echoClient';

const sampleState = {
  servers: [{ id: 's1', name: 'Guild', imageUrl: '', ownerId: 'u1' }],
  categoriesByServer: {},
  serverMemberIds: { s1: ['u1'] },
  workspaceVersion: '9',
  upcomingEventsByServerId: {},
  myEventRsvps: [],
} as EchoWorkspaceState;

function mockLocalStorage() {
  const store = new Map<string, string>();
  return {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => {
      store.set(k, v);
    },
    removeItem: (k: string) => {
      store.delete(k);
    },
  } as Storage;
}

describe('workspacePersistence', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', mockLocalStorage());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('scopes localStorage workspace cache by user id', () => {
    saveEchoWorkspaceToCache('user-a', sampleState);
    expect(loadEchoWorkspaceFromCache('user-a')?.servers[0]?.id).toBe('s1');
    expect(loadEchoWorkspaceFromCache('user-b')).toBeNull();
  });

  it('ignores legacy unscoped cache payloads', () => {
    localStorage.setItem('echo-workspace-v1', JSON.stringify(sampleState));
    expect(loadEchoWorkspaceFromCache('user-a')).toBeNull();
  });
});
