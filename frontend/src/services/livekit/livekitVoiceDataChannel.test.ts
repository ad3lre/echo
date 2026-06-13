import { ConnectionState } from 'livekit-client';
import { describe, expect, it, vi } from 'vitest';
import type { EchoHangmanActivityV1 } from '@/audio/voiceEchoLiveKitData';
import { encodeEchoHangmanActivity } from '@/audio/voiceEchoLiveKitData';
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

  it('routeVoiceDataReceived returns false for unknown payload', () => {
    const routed = routeVoiceDataReceived(
      new Uint8Array([0, 1, 2, 3]),
      'peer-1',
      {},
    );
    expect(routed).toBe(false);
  });
});
