import type { ChannelSummary } from '@shared/types';

/**
 * Voice participant list: prefer explicit VC id (e.g. connected channel), else active surface if it is voice.
 */
export function resolveVoiceChannelForParticipants(opts: {
  currentVoiceChannelId: string | null | undefined;
  findChannelContextById: (
    channelId: string | null | undefined,
  ) => { channel: ChannelSummary } | null;
  effectiveActiveChannel: ChannelSummary | null;
}): ChannelSummary | null {
  const vid = opts.currentVoiceChannelId?.trim();
  if (vid) {
    const c = opts.findChannelContextById(vid)?.channel;
    if (c?.type === 'voice' || c?.type === 'stage') return c;
  }
  const e = opts.effectiveActiveChannel;
  return e?.type === 'voice' || e?.type === 'stage' ? e : null;
}
