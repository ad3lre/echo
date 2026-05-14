import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  loadLocalProfileMap,
  mergeLocalProfileIntoUser,
  mergeLocalProfilesIntoUsers,
  overwriteLocalProfileFromAuthUser,
  saveLocalProfile,
} from './localProfilePersistence';

function mockLocalStorage() {
  const store = new Map<string, string>();
  return {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => {
      store.set(k, v);
    },
  } as Storage;
}

describe('localProfilePersistence', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('loadLocalProfileMap returns {} when empty or invalid', () => {
    vi.stubGlobal('localStorage', mockLocalStorage());
    expect(loadLocalProfileMap()).toEqual({});
    localStorage.setItem('echo_local_profile_v1', 'not-json');
    expect(loadLocalProfileMap()).toEqual({});
  });

  it('saveLocalProfile merges and persists', () => {
    vi.stubGlobal('localStorage', mockLocalStorage());
    saveLocalProfile('u1', { pfp: 'a.png' });
    saveLocalProfile('u1', { customStatus: 'hello' });
    expect(loadLocalProfileMap().u1).toMatchObject({
      pfp: 'a.png',
      customStatus: 'hello',
    });
  });

  it('overwriteLocalProfileFromAuthUser persists non-presence fields only', () => {
    vi.stubGlobal('localStorage', mockLocalStorage());
    overwriteLocalProfileFromAuthUser({
      id: 'u1',
      pfp: 'x',
      bannerRefractionEnabled: true,
      customStatus: 'heads down',
    });
    expect(loadLocalProfileMap().u1?.customStatus).toBe('heads down');
    expect(
      (loadLocalProfileMap().u1 as { status?: string } | undefined)?.status,
    ).toBeUndefined();
  });

  it('overwriteLocalProfileFromAuthUser clears stale customStatus when auth omits it', () => {
    vi.stubGlobal('localStorage', mockLocalStorage());
    saveLocalProfile('u1', { customStatus: 'stale from before' });
    overwriteLocalProfileFromAuthUser({
      id: 'u1',
      pfp: 'x',
      bannerRefractionEnabled: false,
    });
    expect(loadLocalProfileMap().u1?.customStatus).toBe('');
  });

  it('mergeLocalProfileIntoUser applies visual patch only', () => {
    vi.stubGlobal('localStorage', mockLocalStorage());
    localStorage.setItem(
      'echo_local_profile_v1',
      JSON.stringify({ u9: { pfp: 'z.png', customStatus: 'yo' } }),
    );
    const merged = mergeLocalProfileIntoUser({ id: 'u9', name: 'N' });
    expect(merged).toMatchObject({
      id: 'u9',
      name: 'N',
      pfp: 'z.png',
      customStatus: 'yo',
    });
  });

  it('mergeLocalProfilesIntoUsers maps list', () => {
    vi.stubGlobal('localStorage', mockLocalStorage());
    expect(mergeLocalProfilesIntoUsers([{ id: 'a' }])).toEqual([{ id: 'a' }]);
  });
});
