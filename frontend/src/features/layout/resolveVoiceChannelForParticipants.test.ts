import { describe, expect, it } from 'vitest';
import type { ChannelSummary } from '@shared/types';
import { resolveVoiceChannelForParticipants } from './resolveVoiceChannelForParticipants';

const textCh: ChannelSummary = { id: 't', name: 't', type: 'text' };
const voiceCh: ChannelSummary = { id: 'v', name: 'v', type: 'voice' };

describe('resolveVoiceChannelForParticipants', () => {
  it('uses current voice channel when it resolves to voice', () => {
    const r = resolveVoiceChannelForParticipants({
      currentVoiceChannelId: 'v',
      findChannelContextById: (id) =>
        id === 'v' ? { channel: voiceCh } : null,
      effectiveActiveChannel: textCh,
    });
    expect(r).toEqual(voiceCh);
  });

  it('falls back to effective surface when it is voice', () => {
    const r = resolveVoiceChannelForParticipants({
      currentVoiceChannelId: null,
      findChannelContextById: () => null,
      effectiveActiveChannel: voiceCh,
    });
    expect(r).toEqual(voiceCh);
  });

  it('returns null when neither is voice', () => {
    expect(
      resolveVoiceChannelForParticipants({
        currentVoiceChannelId: 't',
        findChannelContextById: (id) =>
          id === 't' ? { channel: textCh } : null,
        effectiveActiveChannel: textCh,
      }),
    ).toBeNull();
  });
});
