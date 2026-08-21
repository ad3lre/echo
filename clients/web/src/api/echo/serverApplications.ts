import { echoFetch } from './transport';
import type {
  EchoApplicationFormDto,
  EchoServerApplicationRowDto,
} from './types';

export type { EchoApplicationFormDto, EchoServerApplicationRowDto };

export async function fetchEchoJoinApplicationPreview(
  token: string,
  serverId: string,
): Promise<{ applicationForm: EchoApplicationFormDto }> {
  return echoFetch(
    token,
    `/servers/${encodeURIComponent(serverId.trim())}/join-application-preview`,
  );
}

export async function fetchEchoServerApplicationSettings(
  token: string,
  serverId: string,
): Promise<{
  applicationsEnabled: boolean;
  applicationForm: EchoApplicationFormDto;
}> {
  return echoFetch(
    token,
    `/servers/${encodeURIComponent(serverId.trim())}/application-settings`,
  );
}

export async function fetchEchoServerApplications(
  token: string,
  serverId: string,
  status: 'pending' | 'approved' | 'rejected' | 'all' = 'pending',
): Promise<{ applications: EchoServerApplicationRowDto[] }> {
  const qs = `?status=${encodeURIComponent(status)}`;
  return echoFetch(
    token,
    `/servers/${encodeURIComponent(serverId.trim())}/applications${qs}`,
  );
}

export async function postEchoServerInviteCode(
  token: string,
  serverId: string,
  body: { skipsApplication: boolean },
): Promise<{ code: string; inviteUrl: string; skipsApplication: boolean }> {
  return echoFetch(
    token,
    `/servers/${encodeURIComponent(serverId.trim())}/invite-codes`,
    {
      method: 'POST',
      body: JSON.stringify(body),
    },
  );
}

export async function postEchoServerApplicationSubmit(
  token: string,
  serverId: string,
  body: {
    source: 'invite' | 'directory';
    inviteToken?: string;
    answers: Record<string, unknown>;
  },
): Promise<{ applicationId: string }> {
  return echoFetch(
    token,
    `/servers/${encodeURIComponent(serverId.trim())}/applications`,
    {
      method: 'POST',
      body: JSON.stringify(body),
    },
  );
}

export async function postEchoServerApplicationApprove(
  token: string,
  serverId: string,
  applicationId: string,
): Promise<void> {
  await echoFetch(
    token,
    `/servers/${encodeURIComponent(serverId.trim())}/applications/${encodeURIComponent(applicationId.trim())}/approve`,
    { method: 'POST' },
  );
}

export async function postEchoServerApplicationReject(
  token: string,
  serverId: string,
  applicationId: string,
  note?: string,
): Promise<void> {
  await echoFetch(
    token,
    `/servers/${encodeURIComponent(serverId.trim())}/applications/${encodeURIComponent(applicationId.trim())}/reject`,
    {
      method: 'POST',
      body: JSON.stringify({ note: note ?? '' }),
    },
  );
}
