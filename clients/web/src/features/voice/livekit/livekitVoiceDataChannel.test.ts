import { ConnectionState } from 'livekit-client';
import { describe, expect, it, vi } from 'vitest';
import type { EchoYoutubeActivityV1 } from '@/audio/voiceEchoLiveKitData';
import {
  encodeEchoWatchTogetherActivity,
  encodeEchoYoutubeActivity,
} from '@/audio/voiceEchoLiveKitData';
import {
  publishVoiceData,
  routeVoiceDataReceived,
} from '@/features/voice/livekit/livekitVoiceDataChannel';

describe('livekitVoiceDataChannel', () => {
  const sampleYoutube = (): EchoYoutubeActivityV1 => ({
    v: 1,
    t: 'youtube_activity',
    updatedAt: 1,
    fromUserId: 'u1',
    activityPhase: 'youtube',
    playlist: [
      {
        id: 'vid-1',
        title: 'Song',
        channelTitle: 'Channel',
        thumbnailUrl: null,
      },
    ],
    currentIndex: 0,
    youtubeBrowseOpen: false,
  });

  it('publishVoiceData skips when room is not connected', () => {
    const publishData = vi.fn();
    const room = {
      state: ConnectionState.Disconnected,
      localParticipant: { publishData },
    } as unknown as import('livekit-client').Room;

    publishVoiceData(room, encodeEchoYoutubeActivity, sampleYoutube());

    expect(publishData).not.toHaveBeenCalled();
  });

  it('publishVoiceData skips private publish when destination list is empty', () => {
    const publishData = vi.fn();
    const room = {
      state: ConnectionState.Connected,
      localParticipant: { publishData },
    } as unknown as import('livekit-client').Room;

    publishVoiceData(room, encodeEchoYoutubeActivity, sampleYoutube(), {
      destinationIdentities: ['  ', ''],
    });

    expect(publishData).not.toHaveBeenCalled();
  });

  it('publishVoiceData publishes on connected room with reliable default', () => {
    const publishData = vi.fn();
    const room = {
      state: ConnectionState.Connected,
      localParticipant: { publishData },
    } as unknown as import('livekit-client').Room;
    const payload = sampleYoutube();

    publishVoiceData(room, encodeEchoYoutubeActivity, payload);

    expect(publishData).toHaveBeenCalledTimes(1);
    expect(publishData).toHaveBeenCalledWith(
      encodeEchoYoutubeActivity(payload),
      { reliable: true },
    );
  });

  it('routeVoiceDataReceived dispatches youtube activity payloads', () => {
    const onYoutubeActivity = vi.fn();
    const onWatchTogetherActivity = vi.fn();
    const ytPayload = encodeEchoYoutubeActivity(sampleYoutube());

    const routed = routeVoiceDataReceived(ytPayload, 'peer-1', {
      onYoutubeActivity,
      onWatchTogetherActivity,
    });

    expect(routed).toBe(true);
    expect(onYoutubeActivity).toHaveBeenCalledWith(
      expect.objectContaining({ fromUserId: 'u1' }),
      'peer-1',
    );
    expect(onWatchTogetherActivity).not.toHaveBeenCalled();
  });

  it('routeVoiceDataReceived dispatches watch together activity after youtube', () => {
    const onYoutubeActivity = vi.fn();
    const onWatchTogetherActivity = vi.fn();
    const payload = encodeEchoWatchTogetherActivity({
      v: 1,
      t: 'watch_together_activity',
      updatedAt: 1,
      fromUserId: 'u1',
      sessionId: 's1',
      activityPhase: 'watch_together',
      sessionStarted: false,
      playlist: [],
      currentIndex: 0,
      browseOpen: false,
    });

    const routed = routeVoiceDataReceived(payload, 'peer-1', {
      onYoutubeActivity,
      onWatchTogetherActivity,
    });

    expect(routed).toBe(true);
    expect(onWatchTogetherActivity).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: 's1' }),
      'peer-1',
    );
    expect(onYoutubeActivity).not.toHaveBeenCalled();
  });

  it('routeVoiceDataReceived returns false for unknown payload', () => {
    const routed = routeVoiceDataReceived(
      new Uint8Array([0, 1, 2, 3]),
      'peer-1',
      {},
    );
    expect(routed).toBe(false);
  });
});
