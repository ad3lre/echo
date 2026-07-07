import { describe, expect, it } from 'vitest';
import { resolveVcGameRoomChannelId } from './resolveVcGameRoomChannelId';
import type { ChannelSummary } from '@shared/types';

const voice = (id: string): ChannelSummary => ({
  id,
  name: 'Voice',
  type: 'voice',
});

describe('resolveVcGameRoomChannelId', () => {
  it('prefers the connected voice channel', () => {
    const id = resolveVcGameRoomChannelId({
      currentVoiceChannelId: 'vc-connected',
      findChannelContextById: (cid) =>
        cid === 'vc-connected' ? { channel: voice('vc-connected') } : null,
      effectiveActiveChannel: voice('vc-viewing'),
    });
    expect(id).toBe('vc-connected');
  });

  it('falls back to the voice channel being viewed', () => {
    const id = resolveVcGameRoomChannelId({
      currentVoiceChannelId: null,
      findChannelContextById: (cid) =>
        cid === 'vc-viewing' ? { channel: voice('vc-viewing') } : null,
      effectiveActiveChannel: voice('vc-viewing'),
    });
    expect(id).toBe('vc-viewing');
  });

  it('uses connected VC id when tree lookup misses but user is in voice', () => {
    const id = resolveVcGameRoomChannelId({
      currentVoiceChannelId: 'vc-connected',
      findChannelContextById: () => null,
      effectiveActiveChannel: { id: 'text', name: 'general', type: 'text' },
    });
    expect(id).toBe('vc-connected');
  });

  it('does not treat a text channel id as a game room while browsing text', () => {
    const id = resolveVcGameRoomChannelId({
      currentVoiceChannelId: 'text',
      findChannelContextById: (cid) =>
        cid === 'text'
          ? { channel: { id: 'text', name: 'general', type: 'text' } }
          : null,
      effectiveActiveChannel: { id: 'text', name: 'general', type: 'text' },
    });
    expect(id).toBeNull();
  });
});
