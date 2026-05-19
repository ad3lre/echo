import type pg from 'pg';
import { nextEchoSnowflakeId } from '../echoSnowflake';

export type EchoWorkspaceEventSummary = {
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
  /** Free-text venue / off-server location; mutually exclusive with `channelId`. */
  customLocation: string | null;
  goingCount: number;
  maxAttendees: number | null;
  userRsvp: 'going' | 'declined' | null;
};

export type EchoWorkspaceMyEventRsvp = {
  id: string;
  serverId: string;
  serverName: string;
  serverImageUrl: string;
  title: string;
  imageUrl: string;
  startsAt: string;
  endsAt: string;
  channelId: string | null;
  channelName: string | null;
  customLocation: string | null;
  goingCount: number;
  maxAttendees: number | null;
};

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
  customLocation: string | null;
  status: 'scheduled' | 'cancelled';
  maxAttendees: number | null;
  goingCount: number;
  createdAt: string;
  updatedAt: string;
  /** Discord guild scheduled event id when this Echo event is mirrored to Discord. */
  discordScheduledEventId: string | null;
};

function iso(d: unknown): string {
  if (d instanceof Date) return d.toISOString();
  if (typeof d === 'string' && d.trim()) {
    const t = new Date(d);
    if (!Number.isNaN(t.getTime())) return t.toISOString();
  }
  return new Date(0).toISOString();
}

const UPCOMING_PER_SERVER_CAP = 10;
const MY_RSVPS_CAP = 30;

function readCustomLocationCell(row: Record<string, unknown>): string | null {
  const v = row.custom_location ?? row.customLocation;
  if (v == null) return null;
  const t = String(v).trim();
  return t || null;
}

const ECHO_EVENT_CUSTOM_LOCATION_MAX = 2000;

function normalizeCustomLocation(
  raw: string | null | undefined,
): string | null {
  if (raw == null) return null;
  const t = String(raw).trim();
  if (!t) return null;
  return t.slice(0, ECHO_EVENT_CUSTOM_LOCATION_MAX);
}

/**
 * Upcoming public event rows + per-user RSVP strip for workspace bootstrap.
 */
export async function loadEchoWorkspaceEventPayload(
  pool: pg.Pool,
  userId: string,
  serverIds: string[],
): Promise<{
  upcomingEventsByServerId: Record<string, EchoWorkspaceEventSummary[]>;
  myEventRsvps: EchoWorkspaceMyEventRsvp[];
}> {
  const empty = {
    upcomingEventsByServerId: {} as Record<string, EchoWorkspaceEventSummary[]>,
    myEventRsvps: [] as EchoWorkspaceMyEventRsvp[],
  };
  if (serverIds.length === 0) return empty;

  const [upRes, myRes] = await Promise.all([
    pool.query(
      `
      SELECT e.id, e.server_id, e.title, e.description, e.image_url,
             e.starts_at, e.ends_at, e.timezone_label, e.channel_id, e.custom_location, e.max_attendees,
             ch.name AS channel_name,
             (SELECT COUNT(*)::int FROM echo_server_event_rsvps r2
              WHERE r2.event_id = e.id AND r2.status = 'going') AS going_count,
             mr.status AS user_rsvp_status
      FROM echo_server_events e
      LEFT JOIN echo_channels ch ON ch.id = e.channel_id AND ch.server_id = e.server_id
      LEFT JOIN echo_server_event_rsvps mr ON mr.event_id = e.id AND mr.user_id = $2
      WHERE e.server_id = ANY($1::text[])
        AND e.status = 'scheduled'
        AND e.ends_at > NOW()
      ORDER BY e.server_id, e.starts_at ASC
      `,
      [serverIds, userId],
    ),
    pool.query(
      `
      SELECT e.id, e.server_id, e.title, e.image_url, e.starts_at, e.ends_at, e.channel_id,
             e.custom_location, e.max_attendees,
             ch.name AS channel_name,
             s.name AS server_name, s.icon_url AS server_icon_url,
             (SELECT COUNT(*)::int FROM echo_server_event_rsvps r2
              WHERE r2.event_id = e.id AND r2.status = 'going') AS going_count
      FROM echo_server_event_rsvps r
      INNER JOIN echo_server_events e ON e.id = r.event_id
      INNER JOIN echo_servers s ON s.id = e.server_id
      LEFT JOIN echo_channels ch ON ch.id = e.channel_id AND ch.server_id = e.server_id
      WHERE r.user_id = $1
        AND r.status = 'going'
        AND e.status = 'scheduled'
        AND e.ends_at > NOW()
      ORDER BY e.starts_at ASC
      LIMIT ${MY_RSVPS_CAP}
      `,
      [userId],
    ),
  ]);

  const byServer: Record<string, EchoWorkspaceEventSummary[]> = {};
  for (const sid of serverIds) byServer[sid] = [];

  for (const row of upRes.rows as Record<string, unknown>[]) {
    const sid = String(row.server_id ?? '');
    if (!sid || !byServer[sid]) continue;
    if (byServer[sid]!.length >= UPCOMING_PER_SERVER_CAP) continue;
    const ur = row.user_rsvp_status;
    const userRsvp =
      ur === 'going' || ur === 'declined' ? (ur as 'going' | 'declined') : null;
    const maxRaw = row.max_attendees;
    const maxAttendees =
      maxRaw != null && Number.isFinite(Number(maxRaw))
        ? Math.max(0, Math.floor(Number(maxRaw)))
        : null;
    byServer[sid]!.push({
      id: String(row.id ?? ''),
      serverId: sid,
      title: String(row.title ?? '').trim() || 'Event',
      description: String(row.description ?? ''),
      imageUrl: String(row.image_url ?? '').trim(),
      startsAt: iso(row.starts_at),
      endsAt: iso(row.ends_at),
      timezoneLabel:
        row.timezone_label != null && String(row.timezone_label).trim()
          ? String(row.timezone_label).trim()
          : null,
      channelId:
        row.channel_id != null && String(row.channel_id).trim()
          ? String(row.channel_id).trim()
          : null,
      channelName:
        row.channel_name != null && String(row.channel_name).trim()
          ? String(row.channel_name).trim()
          : null,
      customLocation: readCustomLocationCell(row),
      goingCount: Number(row.going_count ?? 0) || 0,
      maxAttendees:
        maxAttendees != null && maxAttendees > 0 ? maxAttendees : null,
      userRsvp,
    });
  }

  const myEventRsvps: EchoWorkspaceMyEventRsvp[] = [];
  for (const row of myRes.rows as Record<string, unknown>[]) {
    const maxRaw = row.max_attendees;
    const maxAttendees =
      maxRaw != null && Number.isFinite(Number(maxRaw))
        ? Math.max(0, Math.floor(Number(maxRaw)))
        : null;
    myEventRsvps.push({
      id: String(row.id ?? ''),
      serverId: String(row.server_id ?? ''),
      serverName: String(row.server_name ?? '').trim() || 'Server',
      serverImageUrl: String(row.server_icon_url ?? '').trim(),
      title: String(row.title ?? '').trim() || 'Event',
      imageUrl: String(row.image_url ?? '').trim(),
      startsAt: iso(row.starts_at),
      endsAt: iso(row.ends_at),
      channelId:
        row.channel_id != null && String(row.channel_id).trim()
          ? String(row.channel_id).trim()
          : null,
      channelName:
        row.channel_name != null && String(row.channel_name).trim()
          ? String(row.channel_name).trim()
          : null,
      customLocation: readCustomLocationCell(row),
      goingCount: Number(row.going_count ?? 0) || 0,
      maxAttendees:
        maxAttendees != null && maxAttendees > 0 ? maxAttendees : null,
    });
  }

  return { upcomingEventsByServerId: byServer, myEventRsvps };
}

export async function listEchoServerEventsForManagement(
  pool: pg.Pool,
  serverId: string,
): Promise<EchoServerEventManagementRow[]> {
  const r = await pool.query(
    `
    SELECT e.id, e.server_id, e.title, e.description, e.image_url,
           e.starts_at, e.ends_at, e.timezone_label, e.channel_id, e.custom_location, e.status, e.max_attendees,
           e.created_at, e.updated_at, e.discord_scheduled_event_id,
           ch.name AS channel_name,
           (SELECT COUNT(*)::int FROM echo_server_event_rsvps r2
            WHERE r2.event_id = e.id AND r2.status = 'going') AS going_count
    FROM echo_server_events e
    LEFT JOIN echo_channels ch ON ch.id = e.channel_id AND ch.server_id = e.server_id
    WHERE e.server_id = $1
    ORDER BY e.starts_at DESC
    LIMIT 100
    `,
    [serverId],
  );
  return (r.rows as Record<string, unknown>[]).map((row) => {
    const st = row.status === 'cancelled' ? 'cancelled' : 'scheduled';
    const maxRaw = row.max_attendees;
    const maxAttendees =
      maxRaw != null && Number.isFinite(Number(maxRaw))
        ? Math.max(0, Math.floor(Number(maxRaw)))
        : null;
    return {
      id: String(row.id ?? ''),
      serverId: String(row.server_id ?? ''),
      title: String(row.title ?? '').trim() || 'Event',
      description: String(row.description ?? ''),
      imageUrl: String(row.image_url ?? '').trim(),
      startsAt: iso(row.starts_at),
      endsAt: iso(row.ends_at),
      timezoneLabel:
        row.timezone_label != null && String(row.timezone_label).trim()
          ? String(row.timezone_label).trim()
          : null,
      channelId:
        row.channel_id != null && String(row.channel_id).trim()
          ? String(row.channel_id).trim()
          : null,
      channelName:
        row.channel_name != null && String(row.channel_name).trim()
          ? String(row.channel_name).trim()
          : null,
      customLocation: readCustomLocationCell(row),
      status: st,
      maxAttendees:
        maxAttendees != null && maxAttendees > 0 ? maxAttendees : null,
      goingCount: Number(row.going_count ?? 0) || 0,
      createdAt: iso(row.created_at),
      updatedAt: iso(row.updated_at),
      discordScheduledEventId:
        row.discord_scheduled_event_id != null &&
        String(row.discord_scheduled_event_id).trim()
          ? String(row.discord_scheduled_event_id).trim()
          : null,
    };
  });
}

async function assertChannelInServer(
  pool: pg.Pool,
  serverId: string,
  channelId: string | null | undefined,
): Promise<boolean> {
  const cid = channelId?.trim();
  if (!cid) return true;
  const r = await pool.query(
    `SELECT 1 FROM echo_channels WHERE id = $1 AND server_id = $2 LIMIT 1`,
    [cid, serverId],
  );
  return r.rowCount != null && r.rowCount > 0;
}

export async function createEchoServerEvent(
  pool: pg.Pool,
  input: {
    serverId: string;
    creatorUserId: string;
    title: string;
    description?: string;
    imageUrl?: string;
    startsAt: Date;
    endsAt: Date;
    timezoneLabel?: string | null;
    channelId?: string | null;
    customLocation?: string | null;
    maxAttendees?: number | null;
  },
): Promise<
  | { ok: true; id: string }
  | { ok: false; reason: 'bad_times' | 'bad_channel' | 'bad_location' }
> {
  if (!(input.endsAt > input.startsAt))
    return { ok: false, reason: 'bad_times' };
  const custom = normalizeCustomLocation(input.customLocation);
  const chIn = input.channelId?.trim() || null;
  if (custom && chIn) return { ok: false, reason: 'bad_location' };
  const ch = custom ? null : chIn;
  if (ch) {
    const chOk = await assertChannelInServer(pool, input.serverId, ch);
    if (!chOk) return { ok: false, reason: 'bad_channel' };
  }

  const id = nextEchoSnowflakeId();
  const title = input.title.trim().slice(0, 200) || 'Event';
  const description = (input.description ?? '').trim().slice(0, 4000);
  const imageUrl = (input.imageUrl ?? '').trim().slice(0, 2048);
  const tz =
    input.timezoneLabel != null && String(input.timezoneLabel).trim()
      ? String(input.timezoneLabel).trim().slice(0, 64)
      : null;
  const maxA =
    input.maxAttendees != null &&
    Number.isFinite(input.maxAttendees) &&
    input.maxAttendees > 0
      ? Math.floor(input.maxAttendees)
      : null;

  await pool.query(
    `
    INSERT INTO echo_server_events (
      id, server_id, title, description, image_url, starts_at, ends_at,
      timezone_label, channel_id, custom_location, creator_user_id, status, max_attendees
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'scheduled', $12)
    `,
    [
      id,
      input.serverId,
      title,
      description,
      imageUrl,
      input.startsAt,
      input.endsAt,
      tz,
      ch,
      custom,
      input.creatorUserId,
      maxA,
    ],
  );
  return { ok: true, id };
}

export async function updateEchoServerEvent(
  pool: pg.Pool,
  input: {
    serverId: string;
    eventId: string;
    title?: string;
    description?: string;
    imageUrl?: string;
    startsAt?: Date;
    endsAt?: Date;
    timezoneLabel?: string | null;
    channelId?: string | null;
    customLocation?: string | null;
    maxAttendees?: number | null;
  },
): Promise<
  | { ok: true }
  | {
      ok: false;
      reason: 'not_found' | 'bad_times' | 'bad_channel' | 'bad_location';
    }
> {
  const ev = await pool.query(
    `SELECT id, starts_at, ends_at, channel_id, custom_location
     FROM echo_server_events WHERE id = $1 AND server_id = $2`,
    [input.eventId, input.serverId],
  );
  if (!ev.rowCount) return { ok: false, reason: 'not_found' };
  const cur = ev.rows[0] as {
    starts_at: Date;
    ends_at: Date;
    channel_id: unknown;
    custom_location: unknown;
  };
  const starts = input.startsAt ?? new Date(cur.starts_at);
  const ends = input.endsAt ?? new Date(cur.ends_at);
  if (!(ends > starts)) return { ok: false, reason: 'bad_times' };

  const locTouched =
    input.channelId !== undefined || input.customLocation !== undefined;
  let nextCh: string | null =
    cur.channel_id != null && String(cur.channel_id).trim()
      ? String(cur.channel_id).trim()
      : null;
  let nextCu = readCustomLocationCell({
    custom_location: cur.custom_location,
  });
  if (locTouched) {
    if (input.channelId !== undefined) {
      nextCh = input.channelId?.trim() || null;
      if (nextCh) nextCu = null;
    }
    if (input.customLocation !== undefined) {
      nextCu = normalizeCustomLocation(input.customLocation);
      if (nextCu) nextCh = null;
    }
    if (nextCh && nextCu) return { ok: false, reason: 'bad_location' };
    if (nextCh) {
      const chOk = await assertChannelInServer(
        pool,
        input.serverId,
        nextCh,
      );
      if (!chOk) return { ok: false, reason: 'bad_channel' };
    }
  }

  const sets: string[] = ['updated_at = NOW()'];
  const vals: unknown[] = [];
  if (input.title !== undefined) {
    sets.push(`title = $${vals.length + 1}`);
    vals.push(input.title.trim().slice(0, 200) || 'Event');
  }
  if (input.description !== undefined) {
    sets.push(`description = $${vals.length + 1}`);
    vals.push(String(input.description).trim().slice(0, 4000));
  }
  if (input.imageUrl !== undefined) {
    sets.push(`image_url = $${vals.length + 1}`);
    vals.push(String(input.imageUrl).trim().slice(0, 2048));
  }
  if (input.startsAt !== undefined) {
    sets.push(`starts_at = $${vals.length + 1}`);
    vals.push(starts);
  }
  if (input.endsAt !== undefined) {
    sets.push(`ends_at = $${vals.length + 1}`);
    vals.push(ends);
  }
  if (input.timezoneLabel !== undefined) {
    sets.push(`timezone_label = $${vals.length + 1}`);
    const tz = input.timezoneLabel;
    vals.push(
      tz != null && String(tz).trim() ? String(tz).trim().slice(0, 64) : null,
    );
  }
  if (locTouched) {
    sets.push(`channel_id = $${vals.length + 1}`);
    vals.push(nextCh);
    sets.push(`custom_location = $${vals.length + 1}`);
    vals.push(nextCu);
  }
  if (input.maxAttendees !== undefined) {
    sets.push(`max_attendees = $${vals.length + 1}`);
    const m = input.maxAttendees;
    vals.push(m != null && Number.isFinite(m) && m > 0 ? Math.floor(m) : null);
  }

  const idPh = vals.length + 1;
  const sidPh = vals.length + 2;
  vals.push(input.eventId, input.serverId);
  await pool.query(
    `UPDATE echo_server_events SET ${sets.join(', ')} WHERE id = $${idPh} AND server_id = $${sidPh}`,
    vals,
  );
  return { ok: true };
}

export async function cancelEchoServerEvent(
  pool: pg.Pool,
  serverId: string,
  eventId: string,
): Promise<boolean> {
  const r = await pool.query(
    `UPDATE echo_server_events SET status = 'cancelled', updated_at = NOW()
     WHERE id = $1 AND server_id = $2 AND status = 'scheduled'`,
    [eventId, serverId],
  );
  return (r.rowCount ?? 0) > 0;
}

export async function setEchoServerEventRsvp(
  pool: pg.Pool,
  serverId: string,
  eventId: string,
  userId: string,
  status: 'going' | 'declined',
): Promise<
  'ok' | 'not_found' | 'not_member' | 'event_ended' | 'full' | 'cancelled'
> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const ev = await client.query(
      `
      SELECT e.id, e.max_attendees, e.status, e.ends_at
      FROM echo_server_events e
      INNER JOIN echo_server_members m ON m.server_id = e.server_id AND m.user_id = $2
      WHERE e.id = $1 AND e.server_id = $3
      FOR UPDATE
      `,
      [eventId, userId, serverId],
    );
    if (!ev.rowCount) {
      const mem = await client.query(
        `SELECT 1 FROM echo_server_members WHERE server_id = $1 AND user_id = $2`,
        [serverId, userId],
      );
      await client.query('ROLLBACK');
      return mem.rowCount ? 'not_found' : 'not_member';
    }
    const row = ev.rows[0] as {
      max_attendees: number | null;
      status: string;
      ends_at: Date;
    };
    if (row.status !== 'scheduled') {
      await client.query('ROLLBACK');
      return 'cancelled';
    }
    if (row.ends_at <= new Date()) {
      await client.query('ROLLBACK');
      return 'event_ended';
    }

    if (status === 'going') {
      const maxA =
        row.max_attendees != null && Number.isFinite(Number(row.max_attendees))
          ? Math.max(0, Math.floor(Number(row.max_attendees)))
          : null;
      if (maxA != null && maxA > 0) {
        const cur = await client.query(
          `SELECT COUNT(*)::int AS c FROM echo_server_event_rsvps
           WHERE event_id = $1 AND status = 'going' AND user_id <> $2`,
          [eventId, userId],
        );
        const self = await client.query(
          `SELECT status FROM echo_server_event_rsvps WHERE event_id = $1 AND user_id = $2`,
          [eventId, userId],
        );
        const alreadyGoing =
          self.rows[0] &&
          String((self.rows[0] as { status: string }).status) === 'going';
        const cnt = Number((cur.rows[0] as { c: number }).c ?? 0) || 0;
        if (!alreadyGoing && cnt >= maxA) {
          await client.query('ROLLBACK');
          return 'full';
        }
      }
    }

    await client.query(
      `
      INSERT INTO echo_server_event_rsvps (event_id, user_id, status, updated_at)
      VALUES ($1, $2, $3, NOW())
      ON CONFLICT (event_id, user_id) DO UPDATE SET status = EXCLUDED.status, updated_at = NOW()
      `,
      [eventId, userId, status],
    );
    await client.query('COMMIT');
    return 'ok';
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}
