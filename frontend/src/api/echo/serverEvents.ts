import { echoFetch } from './transport';

export type EchoServerEventManagementRow = {
  id: string;
  serverId: string;
  title: string;
  description: string;
  imageUrl: string;
  startsAt: string;
  endsAt: string;
  timezoneLabel: string | null;
  channelId: string | null;
  channelName: string | null;
  status: 'scheduled' | 'cancelled';
  maxAttendees: number | null;
  goingCount: number;
  createdAt: string;
  updatedAt: string;
};

export async function fetchGuildEventsForManagement(
  token: string,
  serverId: string,
): Promise<EchoServerEventManagementRow[]> {
  const raw = await echoFetch<{ events?: EchoServerEventManagementRow[] }>(
    token,
    `/servers/${encodeURIComponent(serverId)}/events`,
  );
  return Array.isArray(raw.events) ? raw.events : [];
}

export async function createGuildEvent(
  token: string,
  serverId: string,
  body: {
    title: string;
    description?: string;
    imageUrl?: string;
    startsAt: string;
    endsAt: string;
    timezoneLabel?: string | null;
    channelId?: string | null;
    maxAttendees?: number | null;
  },
): Promise<{ id: string }> {
  return echoFetch<{ id: string }>(token, `/servers/${encodeURIComponent(serverId)}/events`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function updateGuildEvent(
  token: string,
  serverId: string,
  eventId: string,
  body: Partial<{
    title: string;
    description: string;
    imageUrl: string;
    startsAt: string;
    endsAt: string;
    timezoneLabel: string | null;
    channelId: string | null;
    maxAttendees: number | null;
  }>,
): Promise<void> {
  await echoFetch<unknown>(
    token,
    `/servers/${encodeURIComponent(serverId)}/events/${encodeURIComponent(eventId)}`,
    { method: 'PATCH', body: JSON.stringify(body) },
  );
}

export async function cancelGuildEvent(
  token: string,
  serverId: string,
  eventId: string,
): Promise<void> {
  await echoFetch<unknown>(
    token,
    `/servers/${encodeURIComponent(serverId)}/events/${encodeURIComponent(eventId)}/cancel`,
    { method: 'POST' },
  );
}

export async function putGuildEventRsvp(
  token: string,
  serverId: string,
  eventId: string,
  status: 'going' | 'declined',
): Promise<void> {
  await echoFetch<unknown>(
    token,
    `/servers/${encodeURIComponent(serverId)}/events/${encodeURIComponent(eventId)}/rsvp`,
    { method: 'PUT', body: JSON.stringify({ status }) },
  );
}
