import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope, nextTick, ref } from 'vue';
import { useFullscreenStreamOverlay } from './useFullscreenStreamOverlay';

type Deps = Parameters<typeof useFullscreenStreamOverlay>[0];

function makeDeps(overrides: Partial<Deps> = {}): Deps {
  return {
    fullscreenStreamParticipantId: ref<string | null>(null),
    callOverlay: ref({ type: 'none' }) as unknown as Deps['callOverlay'],
    dmCallWithUserId: ref<string | null>(null),
    dmCallCallViewParticipants: ref(
      [],
    ) as unknown as Deps['dmCallCallViewParticipants'],
    activeVoiceChannelParticipants: ref(
      [],
    ) as unknown as Deps['activeVoiceChannelParticipants'],
    currentUser: ref({
      id: 'me',
      name: 'Me',
      pfp: 'me.png',
    }) as unknown as Deps['currentUser'],
    getLocalScreenTrack: vi.fn(() => null),
    getLocalCameraTrack: vi.fn(() => null),
    ...overrides,
  };
}

describe('useFullscreenStreamOverlay', () => {
  let scope: ReturnType<typeof effectScope>;

  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    scope?.stop();
  });

  function mount(overrides: Partial<Deps> = {}) {
    const deps = makeDeps(overrides);
    scope = effectScope(true);
    const api = scope.run(() => useFullscreenStreamOverlay(deps))!;
    return { api, deps };
  }

  it('resolves a remote participant track, name, pfp and screen-share flag', () => {
    const { api } = mount({
      fullscreenStreamParticipantId: ref<string | null>('u2'),
      activeVoiceChannelParticipants: ref([
        { id: 'u2', name: 'Bob', pfp: 'bob.png', screenTrack: { t: 1 } },
      ]) as unknown as Deps['activeVoiceChannelParticipants'],
    });
    expect(api.fullscreenStreamTrack.value).toEqual({ t: 1 });
    expect(api.fullscreenStreamName.value).toBe('Bob');
    expect(api.fullscreenStreamPfp.value).toBe('bob.png');
    expect(api.fullscreenStreamIsScreenShare.value).toBe(true);
  });

  it('falls back to the camera track when there is no screen track', () => {
    const { api } = mount({
      fullscreenStreamParticipantId: ref<string | null>('u2'),
      activeVoiceChannelParticipants: ref([
        { id: 'u2', name: 'Bob', cameraTrack: { c: 1 } },
      ]) as unknown as Deps['activeVoiceChannelParticipants'],
    });
    expect(api.fullscreenStreamTrack.value).toEqual({ c: 1 });
    expect(api.fullscreenStreamIsScreenShare.value).toBe(false);
  });

  it('resolves the local participant via getLocalScreenTrack', () => {
    const screen = { local: 'screen' };
    const { api } = mount({
      fullscreenStreamParticipantId: ref<string | null>('me'),
      getLocalScreenTrack: vi.fn(() => screen),
    });
    expect(api.fullscreenStreamTrack.value).toBe(screen);
    expect(api.fullscreenStreamName.value).toBe('Me');
    expect(api.fullscreenStreamIsScreenShare.value).toBe(true);
  });

  it('uses "You" when the local user has no name', () => {
    const { api } = mount({
      fullscreenStreamParticipantId: ref<string | null>('me'),
      currentUser: ref({ id: 'me' }) as unknown as Deps['currentUser'],
    });
    expect(api.fullscreenStreamName.value).toBe('You');
  });

  it('returns empty/null when no participant is focused', () => {
    const { api } = mount();
    expect(api.fullscreenStreamTrack.value).toBe(null);
    expect(api.fullscreenStreamName.value).toBe('');
    expect(api.fullscreenStreamPfp.value).toBe('');
    expect(api.fullscreenStreamIsScreenShare.value).toBe(false);
    expect(api.fullscreenStreamAudioTrack.value).toBe(null);
  });

  it('sources participants from the DM call when a DM call is active', () => {
    const { api } = mount({
      fullscreenStreamParticipantId: ref<string | null>('u3'),
      callOverlay: ref({ type: 'dmCall' }) as unknown as Deps['callOverlay'],
      dmCallWithUserId: ref('u3'),
      dmCallCallViewParticipants: ref([
        { id: 'u3', name: 'Dee', screenAudioTrack: { a: 1 } },
      ]) as unknown as Deps['dmCallCallViewParticipants'],
    });
    expect(api.fullscreenStreamName.value).toBe('Dee');
    expect(api.fullscreenStreamAudioTrack.value).toEqual({ a: 1 });
  });

  it('clears the participant after the debounce when the track drops', async () => {
    const pid = ref<string | null>('u2');
    const active = ref<any[]>([
      { id: 'u2', name: 'Bob', screenTrack: { t: 1 } },
    ]);
    mount({
      fullscreenStreamParticipantId: pid,
      activeVoiceChannelParticipants:
        active as unknown as Deps['activeVoiceChannelParticipants'],
    });
    active.value = [{ id: 'u2', name: 'Bob' }]; // track gone
    await nextTick();
    expect(pid.value).toBe('u2'); // not cleared immediately
    vi.advanceTimersByTime(160);
    expect(pid.value).toBe(null);
  });

  it('cancels the pending clear if the track returns in time', async () => {
    const pid = ref<string | null>('u2');
    const active = ref<any[]>([
      { id: 'u2', name: 'Bob', screenTrack: { t: 1 } },
    ]);
    mount({
      fullscreenStreamParticipantId: pid,
      activeVoiceChannelParticipants:
        active as unknown as Deps['activeVoiceChannelParticipants'],
    });
    active.value = [{ id: 'u2', name: 'Bob' }];
    await nextTick();
    vi.advanceTimersByTime(100);
    active.value = [{ id: 'u2', name: 'Bob', screenTrack: { t: 2 } }]; // track back
    await nextTick();
    vi.advanceTimersByTime(100);
    expect(pid.value).toBe('u2');
  });

  it('does not fire the pending clear after scope disposal', async () => {
    const pid = ref<string | null>('u2');
    const active = ref<any[]>([
      { id: 'u2', name: 'Bob', screenTrack: { t: 1 } },
    ]);
    mount({
      fullscreenStreamParticipantId: pid,
      activeVoiceChannelParticipants:
        active as unknown as Deps['activeVoiceChannelParticipants'],
    });
    active.value = [{ id: 'u2', name: 'Bob' }];
    await nextTick();
    scope.stop();
    vi.advanceTimersByTime(160);
    expect(pid.value).toBe('u2');
  });
});
