export type VoiceChannelUserLimitTone = 'muted' | 'warning' | 'full';

/** Discord-style cap: `0` or omitted means unlimited. */
export function hasVoiceChannelUserLimit(userLimit?: number | null): boolean {
  return typeof userLimit === 'number' && userLimit > 0;
}

export function voiceChannelParticipantCount(
  voiceParticipantIds?: readonly string[] | null,
): number {
  return voiceParticipantIds?.length ?? 0;
}

export function getVoiceChannelUserLimitTone(
  count: number,
  userLimit: number,
): VoiceChannelUserLimitTone {
  const safeCount = Math.max(0, Math.floor(count));
  const limit = Math.max(1, Math.floor(userLimit));
  if (safeCount >= limit) return 'full';
  if (safeCount >= limit - 1) return 'warning';
  if (safeCount / limit >= 0.8) return 'warning';
  return 'muted';
}

export function formatVoiceChannelUserLimitLabel(
  count: number,
  userLimit: number,
): string {
  const c = Math.max(0, Math.floor(count));
  const l = Math.max(1, Math.floor(userLimit));
  return `${c}/${l}`;
}

export interface VoiceChannelUserLimitUi {
  label: string;
  tone: VoiceChannelUserLimitTone;
  count: number;
  limit: number;
}

export function getVoiceChannelUserLimitUi(
  count: number,
  userLimit?: number | null,
): VoiceChannelUserLimitUi | null {
  if (!hasVoiceChannelUserLimit(userLimit)) return null;
  const limit = Math.floor(userLimit!);
  const safeCount = Math.max(0, Math.floor(count));
  return {
    label: formatVoiceChannelUserLimitLabel(safeCount, limit),
    tone: getVoiceChannelUserLimitTone(safeCount, limit),
    count: safeCount,
    limit,
  };
}

/** Match sidebar count visibility (hide when joined row is hovered). */
export function shouldShowVoiceChannelSidebarOccupancy(input: {
  participantCount: number;
  userLimit?: number | null;
  channelId: string;
  currentVoiceChannelId: string | null;
  hoveredChannelId: string | null;
}): boolean {
  const {
    participantCount,
    userLimit,
    channelId,
    currentVoiceChannelId,
    hoveredChannelId,
  } = input;
  if (participantCount < 1) return false;
  if (currentVoiceChannelId !== channelId) return true;
  return hoveredChannelId !== channelId;
}
