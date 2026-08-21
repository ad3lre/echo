import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearEchoWorkspaceCache,
  loadEchoWorkspaceFromCache,
  saveEchoWorkspaceToCache,
  stripForWorkspaceCache,
} from '@/features/layout/echoWorkspace/workspacePersistence';
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

  it('drops membersByServer in light cache tier', () => {
    const heavy = {
      ...sampleState,
      membersByServer: {
        s1: [{ userId: 'u1', name: 'A', pfp: '' }],
      },
    } as EchoWorkspaceState;
    const light = stripForWorkspaceCache(heavy, 'light');
    expect(light.membersByServer).toBeUndefined();
    expect(light.servers).toHaveLength(1);
  });

  it('retries with a lighter payload when localStorage quota is exceeded', () => {
    const heavy = {
      ...sampleState,
      membersByServer: {
        s1: Array.from({ length: 50 }, (_, i) => ({
          userId: `u${i}`,
          name: `Member ${i}`,
          pfp: 'https://example.com/avatar.png',
        })),
      },
    } as EchoWorkspaceState;
    const store = new Map<string, string>();
    const setItem = vi.fn((key: string, value: string) => {
      if (key !== 'echo-workspace-v1') return;
      const parsed = JSON.parse(value) as { state: EchoWorkspaceState };
      if (parsed.state.membersByServer) {
        throw new DOMException('quota', 'QuotaExceededError');
      }
      store.set(key, value);
    });
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem,
      removeItem: (k: string) => {
        store.delete(k);
      },
    });
    saveEchoWorkspaceToCache('user-a', heavy);
    expect(setItem).toHaveBeenCalled();
    const saved = JSON.parse(store.get('echo-workspace-v1')!) as {
      state: EchoWorkspaceState;
    };
    expect(saved.state.membersByServer).toBeUndefined();
    expect(loadEchoWorkspaceFromCache('user-a')?.servers[0]?.id).toBe('s1');
  });
});
