import type { ChannelSummary } from '@shared/types';

/** Stage audience cannot publish camera or screen share to the LiveKit room. */
export function canPublishStageMedia(
  channel:
    | Pick<ChannelSummary, 'type' | 'voiceStageSpeakerByUserId'>
    | null
    | undefined,
  userId: string | undefined,
): boolean {
  if (!channel || channel.type !== 'stage') return true;
  const uid = userId?.trim();
  if (!uid) return false;
  return !!channel.voiceStageSpeakerByUserId?.[uid];
}
