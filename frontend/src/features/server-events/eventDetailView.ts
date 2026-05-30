import type {
  EchoWorkspaceEventSummary,
  EchoWorkspaceMyEventRsvp,
} from '@/services/domain/workspaceEchoApiSnapshot';

/**
 * Normalized shape backing the event detail modal. Built from either an
 * in-server upcoming-event summary or one of the viewer's RSVP'd events
 * (the DM-list strip), so both entry points render the same surface.
 */
export type EventDetailView = {
  eventId: string;
  serverId: string;
  serverName: string | null;
  serverImageUrl: string | null;
  title: string;
  description: string;
  imageUrl: string | null;
  startsAt: string;
  endsAt: string | null;
  timezoneLabel: string | null;
  channelId: string | null;
  channelName: string | null;
  customLocation: string | null;
  goingCount: number;
  maxAttendees: number | null;
  userRsvp: 'going' | 'declined' | null;
};

function nz(v: string | null | undefined): string | null {
  const t = (v ?? '').trim();
  return t || null;
}

export function eventDetailViewFromSummary(
  ev: EchoWorkspaceEventSummary,
  server?: { name?: string | null; imageUrl?: string | null } | null,
): EventDetailView {
  return {
    eventId: ev.id,
    serverId: ev.serverId,
    serverName: nz(server?.name),
    serverImageUrl: nz(server?.imageUrl),
    title: ev.title?.trim() || 'Event',
    description: ev.description ?? '',
    imageUrl: nz(ev.imageUrl),
    startsAt: ev.startsAt,
    endsAt: ev.endsAt ?? null,
    timezoneLabel: nz(ev.timezoneLabel),
    channelId: nz(ev.channelId),
    channelName: nz(ev.channelName),
    customLocation: nz(ev.customLocation),
    goingCount: ev.goingCount ?? 0,
    maxAttendees: ev.maxAttendees ?? null,
    userRsvp: ev.userRsvp ?? null,
  };
}

export function eventDetailViewFromRsvp(
  r: EchoWorkspaceMyEventRsvp,
): EventDetailView {
  return {
    eventId: r.id,
    serverId: r.serverId,
    serverName: nz(r.serverName),
    serverImageUrl: nz(r.serverImageUrl),
    title: r.title?.trim() || 'Event',
    description: r.description ?? '',
    imageUrl: nz(r.imageUrl),
    startsAt: r.startsAt,
    endsAt: r.endsAt ?? null,
    timezoneLabel: nz(r.timezoneLabel),
    channelId: nz(r.channelId),
    channelName: nz(r.channelName),
    customLocation: nz(r.customLocation),
    goingCount: r.goingCount ?? 0,
    maxAttendees: r.maxAttendees ?? null,
    // myEventRsvps only returns events the viewer is "going" to.
    userRsvp: 'going',
  };
}
