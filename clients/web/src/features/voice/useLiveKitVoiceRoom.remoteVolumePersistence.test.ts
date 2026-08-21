import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useLiveKitVoiceRoom } from './useLiveKitVoiceRoom';

const REMOTE_PARTICIPANT_VOLUME_STORAGE_KEY =
  'echo-remote-participant-volume-v1';

const memoryStorage = (() => {
  const map = new Map<string, string>();
  return {
    clear: () => map.clear(),
    getItem: (key: string) => map.get(String(key)) ?? null,
    key: (index: number) => [...map.keys()][index] ?? null,
    removeItem: (key: string) => {
      map.delete(String(key));
    },
    setItem: (key: string, value: string) => {
      map.set(String(key), String(value));
    },
    get length() {
      return map.size;
    },
  };
})();

describe('useLiveKitVoiceRoom remote participant volume persistence', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: memoryStorage,
    });
    memoryStorage.clear();
    localStorage.removeItem(REMOTE_PARTICIPANT_VOLUME_STORAGE_KEY);
  });

  it('persists explicit per-participant volume overrides', () => {
    const api = useLiveKitVoiceRoom();
    api.setRemoteParticipantVolume('alice', 130);

    expect(api.getRemoteParticipantVolume('alice')).toBe(130);
    expect(
      JSON.parse(
        localStorage.getItem(REMOTE_PARTICIPANT_VOLUME_STORAGE_KEY) ?? '{}',
      ),
    ).toEqual({ alice: 130 });
  });

  it('treats 100 as default and removes persisted override', () => {
    const api = useLiveKitVoiceRoom();
    api.setRemoteParticipantVolume('alice', 130);
    api.setRemoteParticipantVolume('alice', 100);

    expect(api.getRemoteParticipantVolume('alice')).toBe(100);
    expect(
      JSON.parse(
        localStorage.getItem(REMOTE_PARTICIPANT_VOLUME_STORAGE_KEY) ?? '{}',
      ),
    ).toEqual({});
  });

  it('hydrates persisted overrides with clamping and sanitization', () => {
    localStorage.setItem(
      REMOTE_PARTICIPANT_VOLUME_STORAGE_KEY,
      JSON.stringify({
        alice: 0,
        bob: 260,
        carol: 100,
        dave: -5,
      }),
    );

    const api = useLiveKitVoiceRoom();
    expect(api.getRemoteParticipantVolume('alice')).toBe(0);
    expect(api.getRemoteParticipantVolume('bob')).toBe(200);
    expect(api.getRemoteParticipantVolume('carol')).toBe(100);
    expect(api.getRemoteParticipantVolume('dave')).toBe(0);
    expect(api.getRemoteParticipantVolume('unknown')).toBe(100);
  });
});
