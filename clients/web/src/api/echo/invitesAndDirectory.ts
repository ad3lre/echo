import { echoFetch } from './transport';
import type { EchoInvitePreviewDto } from './types';
import type { EchoServerMemberHighlightDto } from './types';
import {
  normalizeEchoDirectoryServersPayload,
  normalizeEchoInvitePreviewPayload,
  normalizeEchoServerMemberHighlightsPayload,
  type EchoDirectoryServerEntry,
} from '@/features/layout/echoInvitesAndDirectoryFromHttp';

export type { EchoDirectoryServerEntry };

export async function postEchoJoinWithInviteToken(
  token: string,
  inviteToken: string,
): Promise<{ serverId: string; alreadyMember: boolean }> {
  const enc = encodeURIComponent(inviteToken.trim());
  const data = await echoFetch<{ serverId: string; alreadyMember?: boolean }>(
    token,
    `/invites/${enc}/join`,
    { method: 'POST' },
  );
  return {
    serverId: String(data.serverId ?? ''),
    alreadyMember: Boolean(data.alreadyMember),
  };
}

/** Join a server listed in Explore (`listed_in_directory`); same visibility as the public directory. */
export async function postEchoJoinDirectoryServer(
  token: string,
  serverId: string,
): Promise<{ serverId: string; alreadyMember: boolean }> {
  const data = await echoFetch<{ serverId: string; alreadyMember?: boolean }>(
    token,
    `/servers/${encodeURIComponent(serverId.trim())}/join-directory`,
    { method: 'POST' },
  );
  return {
    serverId: String(data.serverId ?? ''),
    alreadyMember: Boolean(data.alreadyMember),
  };
}

/** Shareable vanity segment from DB (read-only; any server member). */
export async function fetchEchoServerInviteLink(
  token: string,
  serverId: string,
): Promise<{ vanityCode: string; inviteUrl: string }> {
  return echoFetch(
    token,
    `/servers/${encodeURIComponent(serverId.trim())}/invite-link`,
  );
}

/** Legacy: same payload as GET invite-link but requires invite permission; prefer `fetchEchoServerInviteLink` for UI. */
export async function postEchoServerInvite(
  token: string,
  serverId: string,
): Promise<{ vanityCode: string; inviteUrl: string }> {
  return echoFetch(
    token,
    `/servers/${encodeURIComponent(serverId.trim())}/invites`,
    {
      method: 'POST',
      body: JSON.stringify({}),
    },
  );
}

export async function fetchEchoInvitePreview(
  inviteToken: string,
  voiceChannelId?: string | null,
): Promise<EchoInvitePreviewDto | null> {
  const t = inviteToken.trim();
  if (!t) return null;
  const v = voiceChannelId?.trim();
  const qs = v ? `?voice=${encodeURIComponent(v)}` : '';
  try {
    const data = await echoFetch<Record<string, unknown>>(
      null,
      `/invites/${encodeURIComponent(t)}/preview${qs}`,
    );
    return normalizeEchoInvitePreviewPayload(data);
  } catch {
    return null;
  }
}

/** Explore directory: public listing, no auth (same Echo base URL). */
export async function fetchEchoDirectoryServers(): Promise<{
  servers: EchoDirectoryServerEntry[];
}> {
  const data = await echoFetch<Record<string, unknown>>(
    null,
    '/directory/servers',
  );
  return normalizeEchoDirectoryServersPayload(data);
}

/** Explore join modal: owner + top roles for a directory-listed server. */
export async function fetchEchoDirectoryServerMemberHighlights(
  serverId: string,
): Promise<EchoServerMemberHighlightDto[]> {
  const id = serverId.trim();
  if (!id) return [];
  try {
    const data = await echoFetch<Record<string, unknown>>(
      null,
      `/directory/servers/${encodeURIComponent(id)}/member-highlights`,
    );
    return normalizeEchoServerMemberHighlightsPayload(data);
  } catch {
    return [];
  }
}
