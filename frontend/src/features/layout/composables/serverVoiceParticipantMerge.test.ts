import { describe, expect, it } from 'vitest';
import {
  buildVoiceParticipantMediaState,
  filterVoiceParticipantIdsByLiveKitPresence,
  mergeVoiceModerationMaps,
  recoverVoiceParticipantIdsWhenLiveKitAlone,
} from '../domain/voiceParticipantState';

describe('filterVoiceParticipantIdsByLiveKitPresence', () => {
  it('drops Echo-only ids when LiveKit no longer has them', () => {
    expect(
      filterVoiceParticipantIdsByLiveKitPresence(['u1', 'u2', 'ghost'], {
        remoteIdentities: ['u1'],
        currentUserId: 'u2',
      }),
    ).toEqual(['u1', 'u2']);
  });

  it('keeps local user when not in remote map', () => {
    expect(
      filterVoiceParticipantIdsByLiveKitPresence(['me', 'u1'], {
        remoteIdentities: ['u1'],
        currentUserId: 'me',
      }),
    ).toEqual(['me', 'u1']);
  });

  it('recovers self when filter emptied the list but LiveKit is still connected', () => {
    const filtered = filterVoiceParticipantIdsByLiveKitPresence(['gone-peer'], {
      remoteIdentities: [],
      currentUserId: 'me',
    });
    expect(filtered).toEqual([]);
    expect(
      recoverVoiceParticipantIdsWhenLiveKitAlone(filtered, {
        liveKitConnected: true,
        channelMatches: true,
        currentUserId: 'me',
      }),
    ).toEqual(['me']);
  });

  it('does not recover when ids already non-empty', () => {
    expect(
      recoverVoiceParticipantIdsWhenLiveKitAlone(['a', 'b'], {
        liveKitConnected: true,
        channelMatches: true,
        currentUserId: 'me',
      }),
    ).toEqual(['a', 'b']);
  });
});

describe('mergeVoiceModerationMaps', () => {
  it('merges mock overlay with channel snapshot; Echo wins on same key', () => {
    const { muteMap, deafMap } = mergeVoiceModerationMaps(
      'ch1',
      { ch1: { u1: true } },
      { ch1: {} },
      { u2: true },
      undefined,
    );
    expect(muteMap).toEqual({ u1: true, u2: true });
    expect(deafMap).toEqual({});
  });
});

describe('buildVoiceParticipantMediaState', () => {
  it('uses neutral media when remote user has no LiveKit row yet (no index placeholders)', () => {
    const a = buildVoiceParticipantMediaState({
      isCurrentUser: false,
      remoteInfo: undefined,
      lkLocalCameraScreen: null,
      vcVideo: true,
      vcScreenshare: true,
    });
    expect(a).toEqual({
      video: false,
      streaming: false,
      simMuted: false,
      simDeafened: false,
    });
  });

  it('remote with remoteInfo uses LiveKit flags', () => {
    const ri = {
      isCameraEnabled: true,
      isScreenShareEnabled: false,
      isMicEnabled: false,
      cameraTrack: null,
      screenTrack: null,
      screenAudioTrack: null,
    };
    const a = buildVoiceParticipantMediaState({
      isCurrentUser: false,
      remoteInfo: ri,
      lkLocalCameraScreen: null,
      vcVideo: false,
      vcScreenshare: false,
    });
    expect(a.video).toBe(true);
    expect(a.streaming).toBe(false);
    expect(a.simMuted).toBe(true);
  });

  it('local user with LiveKit requires vcVideo and SDK camera (UI can lead unpublish)', () => {
    const cameraOnUiOff = buildVoiceParticipantMediaState({
      isCurrentUser: true,
      remoteInfo: undefined,
      lkLocalCameraScreen: { camera: true, screen: false },
      vcVideo: false,
      vcScreenshare: true,
    });
    expect(cameraOnUiOff.video).toBe(false);
    expect(cameraOnUiOff.streaming).toBe(false);

    const bothOn = buildVoiceParticipantMediaState({
      isCurrentUser: true,
      remoteInfo: undefined,
      lkLocalCameraScreen: { camera: true, screen: false },
      vcVideo: true,
      vcScreenshare: false,
    });
    expect(bothOn.video).toBe(true);
  });

  it('local user without lk uses vc refs', () => {
    const a = buildVoiceParticipantMediaState({
      isCurrentUser: true,
      remoteInfo: undefined,
      lkLocalCameraScreen: null,
      vcVideo: true,
      vcScreenshare: false,
    });
    expect(a.video).toBe(true);
    expect(a.streaming).toBe(false);
  });
});
