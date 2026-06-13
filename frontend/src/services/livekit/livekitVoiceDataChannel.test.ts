import { ConnectionState } from 'livekit-client';
import { describe, expect, it, vi } from 'vitest';
import type {
  EchoHangmanActivityV1,
  EchoHangmanRoundSecretV1,
} from '@/audio/voiceEchoLiveKitData';
import {
  encodeEchoHangmanActivity,
  encodeEchoHangmanRoundSecret,
  encodeEchoWatchTogetherActivity,
} from '@/audio/voiceEchoLiveKitData';
import {
  publishVoiceData,
  routeVoiceDataReceived,
} from '@/services/livekit/livekitVoiceDataChannel';

describe('livekitVoiceDataChannel', () => {
  const sampleHangman = (): EchoHangmanActivityV1 => ({
    v: 1,
    t: 'hangman_activity',
    updatedAt: 1,
    revision: 0,
    fromUserId: 'u1',
    roundSeq: 0,
    setterUserId: 'u1',
    rosterUserIds: ['u1'],
    phase: 'guessing',
    guessedLetters: [],
    guessHistory: [],
    wrongCount: 0,
    mask: 'TEST',
    roundResult: null,
    answerReveal: null,
  });

  const sampleHangmanRoundSecret = (): EchoHangmanRoundSecretV1 => ({
    v: 1,
    t: 'hangman_round_secret',
    updatedAt: 1,
    roundSeq: 0,
    setterUserId: 'u1',
    secret: 'HELLO',
  });

  it('publishVoiceData skips when room is not connected', () => {
    const publishData = vi.fn();
    const room = {
      state: ConnectionState.Disconnected,
      localParticipant: { publishData },
    } as unknown as import('livekit-client').Room;

    publishVoiceData(room, encodeEchoHangmanActivity, sampleHangman());

    expect(publishData).not.toHaveBeenCalled();
  });

  it('publishVoiceData skips private publish when destination list is empty', () => {
    const publishData = vi.fn();
    const room = {
      state: ConnectionState.Connected,
      localParticipant: { publishData },
    } as unknown as import('livekit-client').Room;

    publishVoiceData(room, encodeEchoHangmanActivity, sampleHangman(), {
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
    const payload = sampleHangman();

    publishVoiceData(room, encodeEchoHangmanActivity, payload);

    expect(publishData).toHaveBeenCalledTimes(1);
    expect(publishData).toHaveBeenCalledWith(
      encodeEchoHangmanActivity(payload),
      { reliable: true },
    );
  });

  it('publishVoiceData passes destinationIdentities for private publish', () => {
    const publishData = vi.fn();
    const room = {
      state: ConnectionState.Connected,
      localParticipant: { publishData },
    } as unknown as import('livekit-client').Room;
    const payload = sampleHangmanRoundSecret();

    publishVoiceData(room, encodeEchoHangmanRoundSecret, payload, {
      destinationIdentities: [' orchestrator ', 'peer-b'],
    });

    expect(publishData).toHaveBeenCalledTimes(1);
    expect(publishData).toHaveBeenCalledWith(
      encodeEchoHangmanRoundSecret(payload),
      {
        reliable: true,
        destinationIdentities: ['orchestrator', 'peer-b'],
      },
    );
  });

  it('routeVoiceDataReceived dispatches hangman activity payloads', () => {
    const onYoutubeActivity = vi.fn();
    const onHangmanActivity = vi.fn();
    const hmPayload = encodeEchoHangmanActivity(sampleHangman());

    const routed = routeVoiceDataReceived(hmPayload, 'peer-1', {
      onYoutubeActivity,
      onHangmanActivity,
    });

    expect(routed).toBe(true);
    expect(onHangmanActivity).toHaveBeenCalledWith(
      expect.objectContaining({ phase: 'guessing' }),
      'peer-1',
    );
    expect(onYoutubeActivity).not.toHaveBeenCalled();
  });

  it('routeVoiceDataReceived prefers hangman round secret before activity', () => {
    const onHangmanRoundSecret = vi.fn();
    const onHangmanActivity = vi.fn();
    const secretPayload = encodeEchoHangmanRoundSecret(
      sampleHangmanRoundSecret(),
    );

    const routed = routeVoiceDataReceived(secretPayload, 'setter-1', {
      onHangmanRoundSecret,
      onHangmanActivity,
    });

    expect(routed).toBe(true);
    expect(onHangmanRoundSecret).toHaveBeenCalledWith(
      expect.objectContaining({ secret: 'HELLO' }),
      'setter-1',
    );
    expect(onHangmanActivity).not.toHaveBeenCalled();
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
