import type { EchoInvitePreviewDto } from '@/api/echo/types';
import { fetchEchoInvitePreview } from '@/api/echo/invitesAndDirectory';

export async function fetchInvitePreview(
  inviteToken: string,
  voiceChannelId?: string | null,
): Promise<EchoInvitePreviewDto | null> {
  return fetchEchoInvitePreview(inviteToken, voiceChannelId);
}
