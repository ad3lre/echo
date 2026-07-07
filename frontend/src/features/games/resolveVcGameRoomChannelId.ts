import type { ChannelSummary } from '@shared/types';
import { resolveVoiceChannelForParticipants } from '@/features/layout/resolveVoiceChannelForParticipants';

/** Voice channel id for authoritative game-server rooms (connected VC or voice surface). */
export function resolveVcGameRoomChannelId(opts: {
  currentVoiceChannelId: string | null | undefined;
  findChannelContextById: (
    channelId: string | null | undefined,
  ) => { channel: ChannelSummary } | null;
  effectiveActiveChannel: ChannelSummary | null;
}): string | null {
  const ch = resolveVoiceChannelForParticipants(opts);
  const id = ch?.id?.trim() ?? '';
  if (id) return id;

  // LiveKit can stay connected while the guild channel tree lookup misses the VC id
  // (selected-server drift, stale workspace). The game room keys off that id anyway.
  const connectedVoiceId = opts.currentVoiceChannelId?.trim() ?? '';
  if (!connectedVoiceId) return null;
  const looked = opts.findChannelContextById(connectedVoiceId)?.channel;
  if (looked && looked.type !== 'voice' && looked.type !== 'stage') return null;
  return connectedVoiceId;
}
