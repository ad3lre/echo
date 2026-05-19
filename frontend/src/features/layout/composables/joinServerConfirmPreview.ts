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
  if (preview.memberCount > 0) {
    subtitleParts.push(
      `${preview.memberCount.toLocaleString()} member${preview.memberCount === 1 ? '' : 's'}`,
    );
  }
  const description = preview.description?.trim();
  return {
    serverName: preview.name?.trim() || 'Server',
    iconUrl: preview.iconUrl,
    memberCount: preview.memberCount > 0 ? preview.memberCount : undefined,
    subtitle:
      subtitleParts.length > 0
        ? subtitleParts.join(' · ')
        : description
          ? description.length > 72
            ? `${description.slice(0, 69)}…`
            : description
          : undefined,
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
}): JoinServerConfirmPreview {
  const name = entry.name.trim() || 'Server';
  const description = entry.description?.trim();
  return {
    serverName: name,
    iconUrl: entry.pfp.trim() || undefined,
    memberCount:
      entry.memberCount != null && entry.memberCount > 0
        ? entry.memberCount
        : undefined,
    subtitle: description
      ? description.length > 72
        ? `${description.slice(0, 69)}…`
        : description
      : undefined,
  };
}
