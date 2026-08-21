import { echoFetch } from './transport';
import type { EchoTicket, EchoTicketConfig } from '@shared/types/ticket';

export type { EchoTicket, EchoTicketConfig };

export async function fetchEchoTicketConfig(
  token: string,
  serverId: string,
): Promise<EchoTicketConfig> {
  return echoFetch(
    token,
    `/servers/${encodeURIComponent(serverId.trim())}/ticket-config`,
  );
}

export async function patchEchoTicketConfig(
  token: string,
  serverId: string,
  body: Partial<EchoTicketConfig>,
): Promise<EchoTicketConfig> {
  return echoFetch(
    token,
    `/servers/${encodeURIComponent(serverId.trim())}/ticket-config`,
    {
      method: 'PATCH',
      body: JSON.stringify(body),
    },
  );
}

export async function createEchoTicket(
  token: string,
  serverId: string,
  body: {
    subject: string;
    category?: string | null;
    answers?: Record<string, unknown>;
  },
): Promise<EchoTicket> {
  return echoFetch(
    token,
    `/servers/${encodeURIComponent(serverId.trim())}/tickets`,
    {
      method: 'POST',
      body: JSON.stringify(body),
    },
  );
}

export async function fetchEchoTickets(
  token: string,
  serverId: string,
  opts?: { status?: string; mine?: boolean },
): Promise<{ tickets: EchoTicket[] }> {
  const params = new URLSearchParams();
  if (opts?.status) params.set('status', opts.status);
  if (opts?.mine) params.set('mine', 'true');
  const qs = params.toString() ? `?${params.toString()}` : '';
  return echoFetch(
    token,
    `/servers/${encodeURIComponent(serverId.trim())}/tickets${qs}`,
  );
}

export async function fetchEchoTicketById(
  token: string,
  serverId: string,
  ticketId: string,
): Promise<EchoTicket> {
  return echoFetch(
    token,
    `/servers/${encodeURIComponent(serverId.trim())}/tickets/${encodeURIComponent(ticketId.trim())}`,
  );
}

export async function fetchEchoTicketByChannelId(
  token: string,
  serverId: string,
  channelId: string,
): Promise<EchoTicket> {
  return echoFetch(
    token,
    `/servers/${encodeURIComponent(serverId.trim())}/ticket-by-channel/${encodeURIComponent(channelId.trim())}`,
  );
}

export async function patchEchoTicket(
  token: string,
  serverId: string,
  ticketId: string,
  body: { status?: string; assignedTo?: string | null },
): Promise<EchoTicket> {
  return echoFetch(
    token,
    `/servers/${encodeURIComponent(serverId.trim())}/tickets/${encodeURIComponent(ticketId.trim())}`,
    {
      method: 'PATCH',
      body: JSON.stringify(body),
    },
  );
}

export async function deleteEchoTicket(
  token: string,
  serverId: string,
  ticketId: string,
): Promise<void> {
  await echoFetch(
    token,
    `/servers/${encodeURIComponent(serverId.trim())}/tickets/${encodeURIComponent(ticketId.trim())}`,
    { method: 'DELETE' },
  );
}
