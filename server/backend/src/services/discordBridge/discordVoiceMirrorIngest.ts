import type pg from 'pg';
import type { FastifyInstance } from 'fastify';
import {
  applyMirrorVoiceDenyConnect,
  deleteMirrorMap,
  getDiscordImportChannelMap,
  getDiscordVoiceMirrorVoiceChannel,
  getEchoChannelCategoryAndType,
  getMirrorMapByDiscordChannel,
  listEnabledMirrorCategoriesForServer,
  replaceRosterForDiscordChannel,
  upsertMirrorMap,
  type DiscordVoiceRosterMember,
  systemDeleteEchoChannel,
} from '../../domain/discord/discordVoiceMirrorRepo';
import { createEchoChannel, insertEchoAudit } from '../../domain/echoStore';
import { publishEchoWorkspaceEvent } from '../../platform/echoPlatformEvents';
import type { EchoWorkspaceEvent } from '../../../../../contracts/types/socket';

const MAX_MEMBERS_PER_CHANNEL = 50;

export type DiscordVoiceMirrorInboundChannel = {
  discordChannelId: string;
  discordParentCategoryId: string | null;
  name: string;
  members: {
    id: string;
    username: string;
    globalName?: string;
    avatar?: string | null;
  }[];
};

function normalizeMembers(
  raw: DiscordVoiceMirrorInboundChannel['members'],
): DiscordVoiceRosterMember[] {
  const out: DiscordVoiceRosterMember[] = [];
  const seen = new Set<string>();
  for (const m of raw.slice(0, MAX_MEMBERS_PER_CHANNEL)) {
    const id = String(m.id ?? '').trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push({
      discordUserId: id,
      username: String(m.username ?? '').slice(0, 128),
      globalName:
        m.globalName != null ? String(m.globalName).slice(0, 128) : null,
      avatar: m.avatar != null ? String(m.avatar).slice(0, 512) : null,
    });
  }
  return out;
}

async function getServerOwnerId(
  pool: pg.Pool,
  serverId: string,
): Promise<string> {
  const r = await pool.query(
    `SELECT owner_id FROM echo_servers WHERE id = $1 LIMIT 1`,
    [serverId],
  );
  return String(r.rows[0]?.owner_id ?? '').trim() || serverId;
}

async function pickSpawnCategoryId(
  pool: pg.Pool,
  serverId: string,
  discordParentCategoryId: string | null,
): Promise<string | null> {
  const rows = await listEnabledMirrorCategoriesForServer(pool, serverId);
  for (const row of rows) {
    if (
      row.discordCategoryId == null ||
      row.discordCategoryId === discordParentCategoryId
    ) {
      return row.categoryId;
    }
  }
  return null;
}

async function isImportedVoiceMirrorEligible(
  pool: pg.Pool,
  serverId: string,
  echoChannelId: string,
): Promise<boolean> {
  const vm = await getDiscordVoiceMirrorVoiceChannel(
    pool,
    serverId,
    echoChannelId,
  );
  if (vm?.enabled) return true;
  const ct = await getEchoChannelCategoryAndType(pool, serverId, echoChannelId);
  if (!ct || ct.type !== 'voice' || !ct.categoryId) return false;
  const r = await pool.query(
    `
    SELECT 1 FROM echo_discord_voice_mirror_category
    WHERE server_id = $1 AND category_id = $2 AND enabled = true
    LIMIT 1
    `,
    [serverId, ct.categoryId],
  );
  return r.rows.length > 0;
}

async function ensureMirrorDisplayOnly(
  pool: pg.Pool,
  serverId: string,
  echoChannelId: string,
): Promise<void> {
  await pool.query(
    `UPDATE echo_channels SET discord_voice_mirror_only = true WHERE id = $1 AND server_id = $2`,
    [echoChannelId, serverId],
  );
  await applyMirrorVoiceDenyConnect(pool, serverId, echoChannelId);
}

/**
 * Process batched Discord voice snapshots from the bot; updates roster,
 * creates/removes display-only mirror channels, emits workspace + roster events.
 */
export async function ingestDiscordVoiceMirrorPayload(
  pool: pg.Pool,
  fastify: FastifyInstance,
  discordGuildId: string,
  channels: DiscordVoiceMirrorInboundChannel[],
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const gid = discordGuildId.trim();
  if (!gid) return { ok: false, reason: 'missing guild' };

  const r = await pool.query(
    `
    SELECT server_id FROM echo_discord_import_states
    WHERE discord_guild_id = $1 AND channels_imported_at IS NOT NULL
    LIMIT 1
    `,
    [gid],
  );
  if (!r.rows.length) return { ok: false, reason: 'server not imported' };
  const serverId = String(r.rows[0]?.server_id ?? '').trim();
  if (!serverId) return { ok: false, reason: 'server not imported' };

  const importMap = await getDiscordImportChannelMap(pool, serverId);
  const ownerId = await getServerOwnerId(pool, serverId);

  const rosterChannels: NonNullable<
    EchoWorkspaceEvent['discordVoiceMirror']
  >['channels'] = [];

  for (const ch of channels) {
    const dc = String(ch.discordChannelId ?? '').trim();
    if (!dc) continue;
    const dParent = ch.discordParentCategoryId?.trim() || null;
    const members = normalizeMembers(ch.members ?? []);

    let echoId =
      importMap[dc] != null && String(importMap[dc]).trim()
        ? String(importMap[dc]).trim()
        : null;

    let ct = echoId
      ? await getEchoChannelCategoryAndType(pool, serverId, echoId)
      : null;
    if (echoId && ct && ct.type !== 'voice') {
      echoId = null;
      ct = null;
    }

    const existingMap = await getMirrorMapByDiscordChannel(pool, serverId, dc);

    let eligible = false;
    if (echoId && ct?.type === 'voice') {
      eligible = await isImportedVoiceMirrorEligible(pool, serverId, echoId);
    }
    if (!eligible && !echoId) {
      const spawnCat = await pickSpawnCategoryId(pool, serverId, dParent);
      eligible = spawnCat != null && members.length > 0;
    }

    if (!eligible) {
      if (existingMap?.spawned && existingMap.echoChannelId) {
        await replaceRosterForDiscordChannel(pool, serverId, dc, []);
        await deleteMirrorMap(pool, serverId, dc);
        await systemDeleteEchoChannel(
          pool,
          serverId,
          existingMap.echoChannelId,
        );
        const auditId = await insertEchoAudit(
          pool,
          serverId,
          ownerId,
          'discord_voice_mirror.despawn',
          'channel',
          existingMap.echoChannelId,
          { discordChannelId: dc },
        );
        publishEchoWorkspaceEvent(
          fastify,
          {
            kind: 'channel_tree_changed',
            version: auditId,
            serverId,
          },
          { serverId },
        );
      } else if (existingMap && echoId) {
        await replaceRosterForDiscordChannel(pool, serverId, dc, []);
      }
      continue;
    }

    let spawnedNew = false;
    if (!echoId) {
      const spawnCat = await pickSpawnCategoryId(pool, serverId, dParent);
      if (!spawnCat || members.length === 0) continue;
      const created = await createEchoChannel(
        pool,
        serverId,
        ch.name || 'Voice',
        'voice',
        spawnCat,
        undefined,
        { discordVoiceMirrorOnly: true },
      );
      if (typeof created !== 'string') continue;
      echoId = created;
      spawnedNew = true;
      await upsertMirrorMap(pool, {
        serverId,
        discordChannelId: dc,
        echoChannelId: echoId,
        spawned: true,
      });
      await applyMirrorVoiceDenyConnect(pool, serverId, echoId);
      const auditSp = await insertEchoAudit(
        pool,
        serverId,
        ownerId,
        'discord_voice_mirror.spawn',
        'channel',
        echoId,
        { discordChannelId: dc },
      );
      publishEchoWorkspaceEvent(
        fastify,
        {
          kind: 'channel_tree_changed',
          version: auditSp,
          serverId,
        },
        { serverId },
      );
    } else if (!existingMap && !spawnedNew) {
      await upsertMirrorMap(pool, {
        serverId,
        discordChannelId: dc,
        echoChannelId: echoId,
        spawned: false,
      });
      await ensureMirrorDisplayOnly(pool, serverId, echoId);
    }

    await replaceRosterForDiscordChannel(pool, serverId, dc, members);

    const mapRow = await getMirrorMapByDiscordChannel(pool, serverId, dc);
    if (members.length === 0 && mapRow?.spawned && mapRow.echoChannelId) {
      await deleteMirrorMap(pool, serverId, dc);
      await systemDeleteEchoChannel(pool, serverId, mapRow.echoChannelId);
      const auditEm = await insertEchoAudit(
        pool,
        serverId,
        ownerId,
        'discord_voice_mirror.despawn',
        'channel',
        mapRow.echoChannelId,
        { discordChannelId: dc },
      );
      publishEchoWorkspaceEvent(
        fastify,
        {
          kind: 'channel_tree_changed',
          version: auditEm,
          serverId,
        },
        { serverId },
      );
      continue;
    }

    if (echoId) {
      rosterChannels.push({
        discordChannelId: dc,
        echoChannelId: echoId,
        members: members.map((m) => ({
          discordUserId: m.discordUserId,
          username: m.username,
          globalName: m.globalName,
          avatar: m.avatar,
        })),
      });
    }
  }

  const auditId = await insertEchoAudit(
    pool,
    serverId,
    ownerId,
    'discord_voice_mirror.roster',
    'server',
    serverId,
    {},
  );

  const rosterPayload: EchoWorkspaceEvent = {
    kind: 'discord_voice_mirror_roster',
    version: auditId,
    serverId,
    discordVoiceMirror: { channels: rosterChannels },
  };

  publishEchoWorkspaceEvent(fastify, rosterPayload, { serverId });

  return { ok: true };
}
