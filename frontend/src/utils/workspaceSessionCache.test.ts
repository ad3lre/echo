import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  clearWorkspaceSessionCache,
  readJwtSub,
  readWorkspaceSessionCache,
  writeWorkspaceSessionCache,
  type CachedEchoWorkspaceState,
} from './workspaceSessionCache';

function mockSessionStorage() {
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

describe('readJwtSub', () => {
  it('returns null for malformed tokens', () => {
    expect(readJwtSub('not-a-jwt')).toBe(null);
  });

  it('extracts sub from payload', () => {
    const payload = btoa(JSON.stringify({ sub: 'user-abc' }));
    expect(readJwtSub(`h.${payload}.s`)).toBe('user-abc');
  });
});

describe('workspace session cache', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('round-trips state for matching user', () => {
    vi.stubGlobal('sessionStorage', mockSessionStorage());
    const state: CachedEchoWorkspaceState = {
      servers: [],
      categoriesByServer: {},
      serverMemberIds: {},
      workspaceVersion: '7',
    };
    writeWorkspaceSessionCache('u1', state);
    expect(readWorkspaceSessionCache('u1')).toEqual(state);
    expect(readWorkspaceSessionCache('u2')).toBe(null);
    clearWorkspaceSessionCache();
    expect(readWorkspaceSessionCache('u1')).toBe(null);
  });

  it('strips ephemeral voice participant fields on read/write (no ghost restore)', () => {
    vi.stubGlobal('sessionStorage', mockSessionStorage());
    const state = {
      servers: [],
      categoriesByServer: {
        srv: [
          {
            id: 'cat1',
            name: 'Voice',
            channels: [
              {
                id: 'ch-v',
                type: 'voice',
                name: 'Lobby',
                voiceParticipantIds: ['u1', 'u2', 'stale-ghost'],
                voiceServerMuteByUserId: { u1: true },
              },
            ],
          },
        ],
      },
      serverMemberIds: {},
      workspaceVersion: '1',
    } as unknown as CachedEchoWorkspaceState;
    writeWorkspaceSessionCache('u1', state);
    const read = readWorkspaceSessionCache('u1');
    const ch = (
      read?.categoriesByServer as Record<string, { channels: unknown[] }[]>
    )?.srv?.[0]?.channels?.[0] as Record<string, unknown> | undefined;
    expect(ch?.voiceParticipantIds).toBeUndefined();
    expect(ch?.voiceServerMuteByUserId).toBeUndefined();
  });
});
