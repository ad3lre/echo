import { echoFetch } from './transport';
import type {
  EchoServerMemberDto,
  PatchEchoServerPreferencesBody,
} from './types';

export async function createEchoServer(
  token: string,
  body: { name: string; iconUrl?: string },
): Promise<{ serverId: string; defaultChannelId: string }> {
  return echoFetch(token, '/servers', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function patchEchoServerPreferences(
  token: string,
  serverId: string,
  body: PatchEchoServerPreferencesBody,
): Promise<void> {
  await echoFetch<Record<string, unknown>>(
    token,
    `/servers/${encodeURIComponent(serverId)}/preferences`,
    { method: 'PATCH', body: JSON.stringify(body) },
  );
}

export async function fetchEchoServers(token: string): Promise<{
  servers: {
    id: string;
    name: string;
    iconUrl: string;
    bannerUrl: string;
    ownerId: string;
    description?: string;
    tags?: string[];
    listedInDirectory?: boolean;
    automodSpamEnabled?: boolean;
    vanityCode?: string;
    bannerBlurEnabled?: boolean;
    bannerBlackoutEnabled?: boolean;
    raidProtectionEnabled?: boolean;
    raidJoinThresholdCount?: number;
    raidJoinWindowSeconds?: number;
  }[];
}> {
  return echoFetch(token, '/servers');
}

export async function fetchEchoServerMembers(
  token: string,
  serverId: string,
): Promise<{ members: EchoServerMemberDto[] }> {
  return echoFetch(token, `/servers/${encodeURIComponent(serverId)}/members`);
}
