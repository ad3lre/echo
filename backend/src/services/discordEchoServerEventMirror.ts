import type pg from 'pg';
import type { FastifyBaseLogger } from 'fastify';
import { config } from '../config';
import { getEchoServerVanityCode } from '../domain/echoStore/servers';
import {
  discordBotCreateGuildScheduledEvent,
  discordBotDeleteGuildScheduledEvent,
  discordBotPatchGuildScheduledEvent,
} from './integrations/discordApiClient';

const DISCORD_EVENT_NAME_MAX = 100;
const DISCORD_EVENT_DESCRIPTION_MAX = 1000;
const DISCORD_EXTERNAL_LOCATION_MAX = 100;

export type DiscordEchoEventMirrorResult =
  | { ok: true; discordScheduledEventId?: string }
  | { ok: false; message: string };

function invertDiscordImportMap(
  discordToEcho: Record<string, string>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [dk, ev] of Object.entries(discordToEcho)) {
    const d = dk.trim();
    const e = ev.trim();
    if (d && e) out[e] = d;
  }
  return out;
}

function normLocCell(v: unknown): string | null {
  if (v == null) return null;
  const t = String(v).trim();
  return t || null;
}

function locationsEquivalent(
  aCh: string | null,
  aCu: string | null,
  bCh: string | null,
  bCu: string | null,
): boolean {
  return (aCh ?? '') === (bCh ?? '') && (aCu ?? '') === (bCu ?? '');
}

async function loadImportMirrorContext(
  pool: pg.Pool,
  serverId: string,
): Promise<
  | { ok: false }
  | {
      ok: true;
      discordGuildId: string;
      echoToDiscord: Record<string, string>;
      serverName: string;
    }
> {
  const r = await pool.query(
    `
    SELECT ist.discord_guild_id, ist.channel_id_map, ist.channels_imported_at,
           s.name AS server_name
    FROM echo_discord_import_states ist
    INNER JOIN echo_servers s ON s.id = ist.server_id
    WHERE ist.server_id = $1
    LIMIT 1
    `,
    [serverId],
  );
  if (!r.rows.length) return { ok: false };
  const row = r.rows[0] as {
    discord_guild_id?: unknown;
    channel_id_map?: unknown;
    channels_imported_at?: unknown;
    server_name?: unknown;
  };
  if (!row.channels_imported_at) return { ok: false };
  const gid = String(row.discord_guild_id ?? '').trim();
  if (!gid) return { ok: false };
  const rawMap = row.channel_id_map;
  const discordToEcho: Record<string, string> = {};
  if (rawMap && typeof rawMap === 'object') {
    for (const [k, v] of Object.entries(rawMap as Record<string, unknown>)) {
      if (typeof v === 'string' && v.trim()) discordToEcho[k.trim()] = v.trim();
    }
  }
  const serverName = String(row.server_name ?? '').trim() || 'Echo server';
  return {
    ok: true,
    discordGuildId: gid,
    echoToDiscord: invertDiscordImportMap(discordToEcho),
    serverName,
  };
}

async function pickEchoChannelIdForDeepLink(
  pool: pg.Pool,
  serverId: string,
  eventChannelId: string | null,
): Promise<string | null> {
  const ec = eventChannelId?.trim() || null;
  if (ec) {
    const r = await pool.query(
      `SELECT type FROM echo_channels WHERE id = $1 AND server_id = $2 LIMIT 1`,
      [ec, serverId],
    );
    if (r.rows.length) {
      const t = String((r.rows[0] as { type?: unknown }).type ?? '').toLowerCase();
      if (t === 'text' || t === 'forum' || t === 'voice') return ec;
    }
  }
  const fb = await pool.query(
    `
    SELECT id FROM echo_channels
    WHERE server_id = $1 AND type IN ('text', 'forum')
    ORDER BY position ASC NULLS LAST
    LIMIT 1
    `,
    [serverId],
  );
  if (!fb.rows.length) return null;
  return String((fb.rows[0] as { id: unknown }).id ?? '').trim() || null;
}

async function buildEchoOpenUrl(
  pool: pg.Pool,
  serverId: string,
  eventChannelId: string | null,
): Promise<string> {
  const base = config.echoAppPublicUrl.replace(/\/$/, '');
  const vanity = (await getEchoServerVanityCode(pool, serverId)).trim();
  if (vanity) return `${base}/${encodeURIComponent(vanity)}`;
  const ch = await pickEchoChannelIdForDeepLink(pool, serverId, eventChannelId);
  if (ch) return `${base}/channels/${encodeURIComponent(serverId)}/${encodeURIComponent(ch)}`;
  return base;
}

function buildDiscordDescription(args: {
  serverName: string;
  openUrl: string;
  userDescription: string;
}): string {
  const header = [
    '── Echo (official) ──',
    `This Discord event mirrors the schedule on your Echo server (“${args.serverName.slice(0, 80)}”).`,
    `RSVP and full details live on Echo — open: ${args.openUrl}`,
    '────────────────────',
    '',
  ].join('\n');
  const user = args.userDescription.trim();
  const room = Math.max(0, DISCORD_EVENT_DESCRIPTION_MAX - header.length);
  const body = user.length > room ? `${user.slice(0, Math.max(0, room - 1))}…` : user;
  const out = `${header}${body}`;
  return out.slice(0, DISCORD_EVENT_DESCRIPTION_MAX);
}

function externalLocationShort(): string {
  const s = 'Echo — full server link in the description below';
  return s.slice(0, DISCORD_EXTERNAL_LOCATION_MAX);
}

type EntityPlan =
  | {
      entity_type: 2;
      channel_id: string;
      scheduled_end_time: string | undefined;
    }
  | {
      entity_type: 3;
      channel_id: null;
      entity_metadata: { location: string };
      scheduled_end_time: string;
    };

async function resolveEntityPlan(
  pool: pg.Pool,
  serverId: string,
  ctx: { echoToDiscord: Record<string, string> },
  row: {
    channel_id: unknown;
    custom_location: unknown;
  },
  startsAt: Date,
  endsAt: Date,
): Promise<EntityPlan | { error: string }> {
  const ch = row.channel_id != null && String(row.channel_id).trim()
    ? String(row.channel_id).trim()
    : null;
  const custom = normLocCell(row.custom_location);
  if (custom) {
    return {
      entity_type: 3,
      channel_id: null,
      entity_metadata: { location: externalLocationShort() },
      scheduled_end_time: endsAt.toISOString(),
    };
  }
  if (ch) {
    const t = await pool.query(
      `SELECT type FROM echo_channels WHERE id = $1 AND server_id = $2 LIMIT 1`,
      [ch, serverId],
    );
    if (!t.rows.length) return { error: 'Event channel not found' };
    const typ = String((t.rows[0] as { type?: unknown }).type ?? '').toLowerCase();
    if (typ === 'voice') {
      const dch = ctx.echoToDiscord[ch];
      if (!dch) {
        return {
          entity_type: 3,
          channel_id: null,
          entity_metadata: { location: externalLocationShort() },
          scheduled_end_time: endsAt.toISOString(),
        };
      }
      return {
        entity_type: 2,
        channel_id: dch,
        scheduled_end_time: endsAt.toISOString(),
      };
    }
  }
  return {
    entity_type: 3,
    channel_id: null,
    entity_metadata: { location: externalLocationShort() },
    scheduled_end_time: endsAt.toISOString(),
  };
}

function entityFingerprint(plan: EntityPlan): string {
  if (plan.entity_type === 2) {
    return `v:${plan.channel_id}`;
  }
  return `e:${plan.entity_metadata.location}`;
}

async function buildCreateOrReplaceBody(
  pool: pg.Pool,
  serverId: string,
  ctx: {
    echoToDiscord: Record<string, string>;
    serverName: string;
  },
  row: {
    title: unknown;
    description: unknown;
    starts_at: Date;
    ends_at: Date;
    channel_id: unknown;
    custom_location: unknown;
  },
): Promise<Record<string, unknown> | { error: string }> {
  const title = String(row.title ?? '').trim().slice(0, DISCORD_EVENT_NAME_MAX) || 'Event';
  const userDesc = String(row.description ?? '').trim();
  const openUrl = await buildEchoOpenUrl(
    pool,
    serverId,
    row.channel_id != null && String(row.channel_id).trim()
      ? String(row.channel_id).trim()
      : null,
  );
  const description = buildDiscordDescription({
    serverName: ctx.serverName,
    openUrl,
    userDescription: userDesc,
  });
  const entity = await resolveEntityPlan(pool, serverId, ctx, row, row.starts_at, row.ends_at);
  if ('error' in entity) return entity;
  const base: Record<string, unknown> = {
    name: title,
    description,
    scheduled_start_time: row.starts_at.toISOString(),
    privacy_level: 2,
    entity_type: entity.entity_type,
  };
  if (entity.entity_type === 2) {
    base.channel_id = entity.channel_id;
    if (entity.scheduled_end_time) base.scheduled_end_time = entity.scheduled_end_time;
  } else {
    base.channel_id = null;
    base.scheduled_end_time = entity.scheduled_end_time;
    base.entity_metadata = entity.entity_metadata;
  }
  return base;
}

async function loadEventRow(
  pool: pg.Pool,
  serverId: string,
  eventId: string,
): Promise<{
  title: string;
  description: string;
  starts_at: Date;
  ends_at: Date;
  channel_id: string | null;
  custom_location: string | null;
  discord_scheduled_event_id: string | null;
  status: string;
} | null> {
  const r = await pool.query(
    `
    SELECT title, description, starts_at, ends_at, channel_id, custom_location,
           discord_scheduled_event_id, status
    FROM echo_server_events
    WHERE id = $1 AND server_id = $2
    LIMIT 1
    `,
    [eventId, serverId],
  );
  if (!r.rows.length) return null;
  const row = r.rows[0] as Record<string, unknown>;
  return {
    title: String(row.title ?? ''),
    description: String(row.description ?? ''),
    starts_at: new Date(row.starts_at as string | Date),
    ends_at: new Date(row.ends_at as string | Date),
    channel_id:
      row.channel_id != null && String(row.channel_id).trim()
        ? String(row.channel_id).trim()
        : null,
    custom_location: normLocCell(row.custom_location),
    discord_scheduled_event_id:
      row.discord_scheduled_event_id != null &&
      String(row.discord_scheduled_event_id).trim()
        ? String(row.discord_scheduled_event_id).trim()
        : null,
    status: String(row.status ?? ''),
  };
}

export async function peekEchoServerEventDiscordPatchBaseline(
  pool: pg.Pool,
  serverId: string,
  eventId: string,
): Promise<{
  channelId: string | null;
  customLocation: string | null;
  discordScheduledEventId: string | null;
} | null> {
  const r = await pool.query(
    `
    SELECT channel_id, custom_location, discord_scheduled_event_id
    FROM echo_server_events
    WHERE id = $1 AND server_id = $2
    LIMIT 1
    `,
    [eventId, serverId],
  );
  if (!r.rows.length) return null;
  const row = r.rows[0] as Record<string, unknown>;
  return {
    channelId:
      row.channel_id != null && String(row.channel_id).trim()
        ? String(row.channel_id).trim()
        : null,
    customLocation: normLocCell(row.custom_location),
    discordScheduledEventId:
      row.discord_scheduled_event_id != null &&
      String(row.discord_scheduled_event_id).trim()
        ? String(row.discord_scheduled_event_id).trim()
        : null,
  };
}

export async function setEchoServerEventDiscordScheduledEventId(
  pool: pg.Pool,
  serverId: string,
  eventId: string,
  discordScheduledEventId: string | null,
): Promise<void> {
  await pool.query(
    `
    UPDATE echo_server_events
    SET discord_scheduled_event_id = $3, updated_at = NOW()
    WHERE id = $2 AND server_id = $1
    `,
    [serverId, eventId, discordScheduledEventId],
  );
}

/**
 * After an Echo server event row is created or updated, optionally create/update a
 * Discord guild scheduled event for Discord-imported servers.
 */
export async function syncDiscordMirrorForEchoServerEvent(
  pool: pg.Pool,
  log: FastifyBaseLogger | undefined,
  input: {
    serverId: string;
    eventId: string;
    /** From API: user wants a new Discord listing (create, or add to an event without one). */
    mirrorToDiscord: boolean;
    /** Snapshot before PATCH; omit on create. */
    prePatch?: {
      channelId: string | null;
      customLocation: string | null;
      discordScheduledEventId: string | null;
    } | null;
  },
): Promise<DiscordEchoEventMirrorResult> {
  const token = config.discordBotToken.trim();
  const ctx = await loadImportMirrorContext(pool, input.serverId);
  if (!ctx.ok) {
    if (input.mirrorToDiscord) {
      return {
        ok: false,
        message:
          'Discord mirror is only available on servers that finished a Discord import.',
      };
    }
    return { ok: true };
  }

  const row = await loadEventRow(pool, input.serverId, input.eventId);
  if (!row || row.status !== 'scheduled') return { ok: true };

  const startDiscordId = row.discord_scheduled_event_id;
  const wantNewMirror = input.mirrorToDiscord && !startDiscordId;
  if (!startDiscordId && !wantNewMirror) return { ok: true };

  if (!token) {
    return {
      ok: false,
      message:
        'Discord mirroring is not configured (missing DISCORD_BOT_TOKEN on the API).',
    };
  }

  const pre = input.prePatch ?? null;
  const locChanged =
    !!pre &&
    !!pre.discordScheduledEventId &&
    !locationsEquivalent(
      pre.channelId,
      pre.customLocation,
      row.channel_id,
      row.custom_location,
    );

  const planRow = {
    title: row.title,
    description: row.description,
    starts_at: row.starts_at,
    ends_at: row.ends_at,
    channel_id: row.channel_id,
    custom_location: row.custom_location,
  };

  if (startDiscordId) {
    const newBody = await buildCreateOrReplaceBody(pool, input.serverId, ctx, planRow);
    if ('error' in newBody)
      return { ok: false, message: (newBody as { error: string }).error };

    let oldFingerprint: string | null = null;
    if (pre?.discordScheduledEventId) {
      const oldPlan = await resolveEntityPlan(
        pool,
        input.serverId,
        ctx,
        {
          channel_id: pre.channelId,
          custom_location: pre.customLocation,
        },
        row.starts_at,
        row.ends_at,
      );
      if (!('error' in oldPlan)) oldFingerprint = entityFingerprint(oldPlan);
    }
    const newPlan = await resolveEntityPlan(
      pool,
      input.serverId,
      ctx,
      planRow,
      row.starts_at,
      row.ends_at,
    );
    if ('error' in newPlan) return { ok: false, message: newPlan.error };
    const newFp = entityFingerprint(newPlan);
    const mustReplace =
      locChanged === true ||
      (oldFingerprint != null && oldFingerprint !== newFp);

    if (!mustReplace) {
      const patchBody: Record<string, unknown> = {
        name: newBody.name,
        description: newBody.description,
        scheduled_start_time: newBody.scheduled_start_time,
        scheduled_end_time: newBody.scheduled_end_time,
        entity_type: newBody.entity_type,
        channel_id: newBody.channel_id,
        entity_metadata: newBody.entity_metadata,
      };
      const patched = await discordBotPatchGuildScheduledEvent(
        token,
        ctx.discordGuildId,
        startDiscordId,
        patchBody,
      );
      if (!patched.ok) {
        return {
          ok: false,
          message: `Discord could not update the listing (${patched.status}). ${patched.text}`,
        };
      }
      return { ok: true, discordScheduledEventId: startDiscordId };
    }

    const del = await discordBotDeleteGuildScheduledEvent(
      token,
      ctx.discordGuildId,
      startDiscordId,
    );
    if (!del.ok) {
      log?.warn(
        { err: del.text, status: del.status },
        'discord_scheduled_event_delete_failed',
      );
    }
    await setEchoServerEventDiscordScheduledEventId(
      pool,
      input.serverId,
      input.eventId,
      null,
    );
  }

  const body = await buildCreateOrReplaceBody(pool, input.serverId, ctx, planRow);
  if ('error' in body) return { ok: false, message: (body as { error: string }).error };
  const created = await discordBotCreateGuildScheduledEvent(
    token,
    ctx.discordGuildId,
    body,
  );
  if (!created.ok) {
    return {
      ok: false,
      message: `Discord could not create the listing (${created.status}). ${created.text}`,
    };
  }
  await setEchoServerEventDiscordScheduledEventId(
    pool,
    input.serverId,
    input.eventId,
    created.id,
  );
  return { ok: true, discordScheduledEventId: created.id };
}

export async function deleteDiscordMirrorForEchoServerEvent(
  pool: pg.Pool,
  log: FastifyBaseLogger | undefined,
  serverId: string,
  eventId: string,
): Promise<void> {
  const token = config.discordBotToken.trim();
  if (!token) return;
  const ctx = await loadImportMirrorContext(pool, serverId);
  if (!ctx.ok) return;
  const r = await pool.query(
    `SELECT discord_scheduled_event_id FROM echo_server_events WHERE id = $1 AND server_id = $2 LIMIT 1`,
    [eventId, serverId],
  );
  if (!r.rows.length) return;
  const did = String(
    (r.rows[0] as { discord_scheduled_event_id?: unknown }).discord_scheduled_event_id ??
      '',
  ).trim();
  if (!did) return;
  const del = await discordBotDeleteGuildScheduledEvent(token, ctx.discordGuildId, did);
  if (!del.ok && del.status !== 404) {
    log?.warn({ err: del.text, status: del.status }, 'discord_scheduled_event_delete_failed');
    return;
  }
  await setEchoServerEventDiscordScheduledEventId(pool, serverId, eventId, null);
}
