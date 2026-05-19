import type { EchoInvitePreviewDto } from '@/api/echo/types';
import { fetchInvitePreview } from '@/services/orchestration/fetchInvitePreview';
import {
  extractInviteTokenFromUserInput,
  extractVoiceChannelIdFromInviteUserInput,
} from '@/utils/inviteLinkParse';
import type { JoinServerConfirmPreview } from './useJoinServerConfirmModal';

export function joinPreviewFromInviteDto(
  preview: EchoInvitePreviewDto,
  opts?: { isVoiceInvite?: boolean },
): JoinServerConfirmPreview {
  const voiceName = preview.voiceChannel?.name?.trim();
  const subtitleParts: string[] = [];
  if (voiceName) subtitleParts.push(voiceName);
  const descFull = preview.description?.trim() ?? '';
  const banner = preview.bannerUrl?.trim();
  return {
    serverName: preview.name?.trim() || 'Server',
    iconUrl: preview.iconUrl,
    ...(banner ? { bannerUrl: banner } : {}),
    ...(descFull ? { description: descFull } : {}),
    memberCount: preview.memberCount > 0 ? preview.memberCount : undefined,
    subtitle: subtitleParts.length > 0 ? subtitleParts.join(' · ') : undefined,
    isVoiceInvite: opts?.isVoiceInvite ?? !!preview.voiceChannel?.id,
  };
}

export async function buildInviteJoinConfirmPreview(
  raw: string,
): Promise<JoinServerConfirmPreview> {
  const tok = extractInviteTokenFromUserInput(raw);
  const voiceHint = extractVoiceChannelIdFromInviteUserInput(raw);
  if (!tok) return { serverName: 'Server' };
  try {
    const preview = await fetchInvitePreview(tok, voiceHint);
    if (!preview) return { serverName: 'Server', isVoiceInvite: !!voiceHint };
    return joinPreviewFromInviteDto(preview, {
      isVoiceInvite: !!voiceHint || !!preview.voiceChannel?.id,
    });
  } catch {
    return { serverName: 'Server', isVoiceInvite: !!voiceHint };
  }
}

export function buildDiscoverableJoinConfirmPreview(entry: {
  name: string;
  pfp: string;
  memberCount?: number;
  description?: string;
  banner?: string;
  voiceParticipantCount?: number;
}): JoinServerConfirmPreview {
  const name = entry.name.trim() || 'Server';
  const description = entry.description?.trim();
  const banner = entry.banner?.trim();
  const vpc =
    typeof entry.voiceParticipantCount === 'number' &&
    Number.isFinite(entry.voiceParticipantCount)
      ? Math.max(0, Math.floor(entry.voiceParticipantCount))
      : 0;
  return {
    serverName: name,
    iconUrl: entry.pfp.trim() || undefined,
    ...(banner ? { bannerUrl: banner } : {}),
    ...(description ? { description } : {}),
    memberCount:
      entry.memberCount != null && entry.memberCount > 0
        ? entry.memberCount
        : undefined,
    ...(vpc > 0
      ? {
          voiceParticipantCount: vpc,
          subtitle: `${vpc.toLocaleString()} in voice now`,
        }
      : {}),
  };
}
