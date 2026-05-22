import type pg from 'pg';
import type { MentionEntity } from '../../../shared/types';
import { findAllIdTokenMatches } from '../../../shared/idTokens';
import { addEchoServerMember } from '../domain/echoStore/servers';

export type DiscordSyncedMentionMaps = {
  discordToEchoUser: ReadonlyMap<string, string>;
  discordToEchoChannel: ReadonlyMap<string, string>;
  discordToEchoRole: ReadonlyMap<string, string>;
  echoUserDisplayName: ReadonlyMap<string, string>;
  echoChannelName: ReadonlyMap<string, string>;
  echoRoleName: ReadonlyMap<string, string>;
};

function parseJsonMap(raw: unknown): Map<string, string> {
  const out = new Map<string, string>();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const dk = String(k).trim();
    const ev = typeof v === 'string' ? v.trim() : '';
    if (dk && ev) out.set(dk, ev);
  }
  return out;
}

function displayNameForEchoUser(
  echoUserId: string,
  names: ReadonlyMap<string, string>,
): string {
  const n = names.get(echoUserId)?.trim();
  return n || 'user';
}

type ContentEvent =
  | { kind: 'everyone'; start: number; end: number }
  | { kind: 'active'; start: number; end: number }
  | {
      kind: 'token';
      start: number;
      end: number;
      token: import('../../../shared/idTokens').ParsedIdToken;
    };

function collectContentEvents(content: string): ContentEvent[] {
  const out: ContentEvent[] = [];
  const reEveryone = /@everyone\b/g;
  let em: RegExpExecArray | null;
  while ((em = reEveryone.exec(content)) !== null) {
    out.push({ kind: 'everyone', start: em.index, end: em.index + em[0].length });
  }
  const reHere = /@here\b/g;
  while ((em = reHere.exec(content)) !== null) {
    out.push({ kind: 'active', start: em.index, end: em.index + em[0].length });
  }
  for (const hit of findAllIdTokenMatches(content)) {
    out.push({
      kind: 'token',
      start: hit.start,
      end: hit.end,
      token: hit.token,
    });
  }
  out.sort((a, b) => a.start - b.start || a.end - b.end);
  return out;
}

function purgeOverlappingEvents(events: ContentEvent[]): ContentEvent[] {
  const sorted = [...events].sort((a, b) => a.start - b.start || a.end - b.end);
  const out: ContentEvent[] = [];
  for (const ev of sorted) {
    const last = out[out.length - 1];
    if (last && ev.start < last.end) continue;
    out.push(ev);
  }
  return out;
}

/**
 * Rewrite Discord mention tokens in synced message `content` into Echo-native
 * `@DisplayName` / `#channel` slices plus `mentions[]` for clickable pills.
 */
export function translateDiscordSyncedContentAndMentions(
  content: string,
  maps: DiscordSyncedMentionMaps,
): { content: string; mentions?: MentionEntity[] } {
  const events = purgeOverlappingEvents(collectContentEvents(content));
  if (events.length === 0) return { content };

  const mentions: MentionEntity[] = [];
  let out = '';
  let cursor = 0;

  for (const ev of events) {
    if (cursor < ev.start) {
      out += content.slice(cursor, ev.start);
    }

    const start = out.length;
    if (ev.kind === 'everyone') {
      const piece = '@everyone';
      out += piece;
      mentions.push({
        id: 'everyone',
        kind: 'everyone',
        label: '@everyone',
        start,
        end: start + piece.length,
      });
    } else if (ev.kind === 'active') {
      const piece = '@here';
      out += piece;
      mentions.push({
        id: 'active',
        kind: 'active',
        label: '@here',
        start,
        end: start + piece.length,
      });
    } else {
      const { token } = ev;
      const raw = content.slice(ev.start, ev.end);
      if (token.kind === 'user') {
        const echoUserId = maps.discordToEchoUser.get(token.id);
        if (echoUserId) {
          const label = displayNameForEchoUser(echoUserId, maps.echoUserDisplayName);
          const piece = `@${label}`;
          out += piece;
          mentions.push({
            id: echoUserId,
            kind: 'user',
            label,
            start,
            end: start + piece.length,
            userId: echoUserId,
          });
        } else {
          out += raw;
        }
      } else if (token.kind === 'role') {
        const echoRoleId = maps.discordToEchoRole.get(token.id);
        if (echoRoleId) {
          const label =
            maps.echoRoleName.get(echoRoleId)?.trim() || 'role';
          const piece = `@${label}`;
          out += piece;
          mentions.push({
            id: echoRoleId,
            kind: 'role',
            label,
            start,
            end: start + piece.length,
            roleId: echoRoleId,
          });
        } else {
          out += raw;
        }
      } else if (token.kind === 'channel') {
        const echoChannelId = maps.discordToEchoChannel.get(token.id);
        if (echoChannelId) {
          const label =
            maps.echoChannelName.get(echoChannelId)?.trim() || 'channel';
          const piece = `#${label}`;
          out += piece;
          mentions.push({
            id: echoChannelId,
            kind: 'channel',
            label,
            start,
            end: start + piece.length,
            channelId: echoChannelId,
          });
        } else {
          out += raw;
        }
      } else {
        out += raw;
      }
    }
    cursor = ev.end;
  }

  if (cursor < content.length) {
    out += content.slice(cursor);
  }

  return mentions.length ? { content: out, mentions } : { content: out };
}

async function loadDiscordImportMaps(
  pool: pg.Pool,
  serverId: string,
): Promise<{
  discordToEchoUser: Map<string, string>;
  discordToEchoChannel: Map<string, string>;
  discordToEchoRole: Map<string, string>;
}> {
  const r = await pool.query<{
    discord_to_echo_user_map: unknown;
    channel_id_map: unknown;
    role_id_map: unknown;
  }>(
    `
    SELECT discord_to_echo_user_map, channel_id_map, role_id_map
    FROM echo_discord_import_states
    WHERE server_id = $1
    LIMIT 1
    `,
    [serverId],
  );
  const row = r.rows[0];
  if (!row) {
    return {
      discordToEchoUser: new Map(),
      discordToEchoChannel: new Map(),
      discordToEchoRole: new Map(),
    };
  }
  return {
    discordToEchoUser: parseJsonMap(row.discord_to_echo_user_map),
    discordToEchoChannel: parseJsonMap(row.channel_id_map),
    discordToEchoRole: parseJsonMap(row.role_id_map),
  };
}

async function resolveDiscordUsersToEcho(
  pool: pg.Pool,
  serverId: string,
  discordUserIds: string[],
  seed: Map<string, string>,
): Promise<Map<string, string>> {
  const out = new Map(seed);
  const pending = discordUserIds.filter((id) => id.trim() && !out.has(id));
  if (pending.length === 0) return out;

  const shadows = await pool.query<{
    discord_user_id: string;
    shadow_user_id: string;
  }>(
    `
    SELECT discord_user_id, shadow_user_id
    FROM echo_discord_shadow_users
    WHERE source_server_id = $1 AND discord_user_id = ANY($2::text[])
    `,
    [serverId, pending],
  );
  for (const row of shadows.rows) {
    const d = String(row.discord_user_id).trim();
    const e = String(row.shadow_user_id).trim();
    if (d && e && !out.has(d)) out.set(d, e);
  }

  const stillPending = pending.filter((id) => !out.has(id));
  if (stillPending.length === 0) return out;

  const links = await pool.query<{
    discord_user_id: string;
    user_id: string;
  }>(
    `
    SELECT discord_user_id, user_id
    FROM auth_discord_user_links
    WHERE discord_user_id = ANY($1::text[])
    `,
    [stillPending],
  );
  for (const row of links.rows) {
    const d = String(row.discord_user_id).trim();
    const e = String(row.user_id).trim();
    if (d && e && !out.has(d)) out.set(d, e);
  }

  return out;
}

async function loadEchoDisplayNames(
  pool: pg.Pool,
  echoUserIds: string[],
): Promise<Map<string, string>> {
  const ids = [...new Set(echoUserIds.map((id) => id.trim()).filter(Boolean))];
  const out = new Map<string, string>();
  if (ids.length === 0) return out;
  const r = await pool.query<{ id: string; display_name: string | null }>(
    `SELECT id, display_name FROM auth_users WHERE id = ANY($1::text[])`,
    [ids],
  );
  for (const row of r.rows) {
    const id = String(row.id).trim();
    const dn =
      row.display_name != null ? String(row.display_name).trim() : '';
    if (id && dn) out.set(id, dn);
  }
  return out;
}

async function loadEchoChannelNames(
  pool: pg.Pool,
  serverId: string,
  echoChannelIds: string[],
): Promise<Map<string, string>> {
  const ids = [...new Set(echoChannelIds.map((id) => id.trim()).filter(Boolean))];
  const out = new Map<string, string>();
  if (ids.length === 0) return out;
  const r = await pool.query<{ id: string; name: string }>(
    `
    SELECT id, name FROM echo_channels
    WHERE server_id = $1 AND id = ANY($2::text[])
    `,
    [serverId, ids],
  );
  for (const row of r.rows) {
    const id = String(row.id).trim();
    const name = String(row.name ?? '').trim();
    if (id && name) out.set(id, name);
  }
  return out;
}

async function loadEchoRoleNames(
  pool: pg.Pool,
  serverId: string,
  echoRoleIds: string[],
): Promise<Map<string, string>> {
  const ids = [...new Set(echoRoleIds.map((id) => id.trim()).filter(Boolean))];
  const out = new Map<string, string>();
  if (ids.length === 0) return out;
  const r = await pool.query<{ id: string; name: string }>(
    `
    SELECT id, name FROM echo_roles
    WHERE server_id = $1 AND id = ANY($2::text[])
    `,
    [serverId, ids],
  );
  for (const row of r.rows) {
    const id = String(row.id).trim();
    const name = String(row.name ?? '').trim();
    if (id && name) out.set(id, name);
  }
  return out;
}

function discordUserIdsInContent(content: string): string[] {
  const ids: string[] = [];
  for (const hit of findAllIdTokenMatches(content)) {
    if (hit.token.kind === 'user') ids.push(hit.token.id);
  }
  return ids;
}

/**
 * Load Discord→Echo maps, rewrite mention tokens, and ensure mentioned users are
 * server members so mention entities survive channel-context filtering.
 */
export async function resolveDiscordSyncedContentMentions(
  pool: pg.Pool,
  serverId: string,
  content: string,
): Promise<{ content: string; mentions?: MentionEntity[] }> {
  const trimmed = typeof content === 'string' ? content : '';
  if (!trimmed) return { content: '' };

  const importMaps = await loadDiscordImportMaps(pool, serverId);
  const discordUserIds = discordUserIdsInContent(trimmed);
  const discordToEchoUser = await resolveDiscordUsersToEcho(
    pool,
    serverId,
    discordUserIds,
    importMaps.discordToEchoUser,
  );

  const echoUserIds = [...new Set(discordToEchoUser.values())];
  const echoChannelIds = [...new Set(importMaps.discordToEchoChannel.values())];
  const echoRoleIds = [...new Set(importMaps.discordToEchoRole.values())];

  const [echoUserDisplayName, echoChannelName, echoRoleName] = await Promise.all([
    loadEchoDisplayNames(pool, echoUserIds),
    loadEchoChannelNames(pool, serverId, echoChannelIds),
    loadEchoRoleNames(pool, serverId, echoRoleIds),
  ]);

  const translated = translateDiscordSyncedContentAndMentions(trimmed, {
    discordToEchoUser,
    discordToEchoChannel: importMaps.discordToEchoChannel,
    discordToEchoRole: importMaps.discordToEchoRole,
    echoUserDisplayName,
    echoChannelName,
    echoRoleName,
  });

  const userMentionIds = [
    ...new Set(
      (translated.mentions ?? [])
        .filter((m) => m.kind === 'user' && m.userId)
        .map((m) => String(m.userId)),
    ),
  ];
  await Promise.all(
    userMentionIds.map((uid) => addEchoServerMember(pool, serverId, uid)),
  );

  return translated;
}
