import { echoFetch } from './transport';
import type { EchoAuditLogEntryDto, EchoServerBanDto } from './types';

export async function fetchEchoAuditLog(
  token: string,
  serverId: string,
  limit = 80,
  opts?: { actorId?: string },
): Promise<{ entries: EchoAuditLogEntryDto[] }> {
  const q = new URLSearchParams({ limit: String(limit) });
  if (opts?.actorId?.trim()) q.set('actorId', opts.actorId.trim());
  return echoFetch(
    token,
    `/servers/${encodeURIComponent(serverId)}/audit?${q}`,
  );
}

export async function fetchEchoServerBans(
  token: string,
  serverId: string,
): Promise<{ bans: EchoServerBanDto[] }> {
  return echoFetch(token, `/servers/${encodeURIComponent(serverId)}/bans`);
}
