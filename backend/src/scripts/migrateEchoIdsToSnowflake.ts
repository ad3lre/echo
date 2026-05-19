/**
 * Offline maintenance: remap legacy UUID-shaped Echo graph TEXT ids to new snowflakes.
 *
 * Runbook: docs/operations/runbooks/snowflake-cutover.md
 *
 * Usage:
 *   DATABASE_URL=... npx ts-node src/scripts/migrateEchoIdsToSnowflake.ts           # dry-run (default)
 *   DATABASE_URL=... npx ts-node src/scripts/migrateEchoIdsToSnowflake.ts --execute # apply (single DB, maintenance window)
 *
 * Large DBs: `--commit-per-channel-messages` or `MIGRATION_COMMIT_MESSAGES_PER_CHANNEL=1` commits message PK/JSON
 * updates one channel at a time (smaller WAL / locks than one server-wide transaction).
 *
 * Uses session_replication_role=replica to defer FK enforcement during PK/FK rewrites.
 * Requires superuser or role allowed to set session_replication_role (typical on self-hosted Postgres).
 */
import 'dotenv/config';
import pg from 'pg';
import { createSnowflakeGenerator } from '../../../shared/snowflakeIds';

const UUID_LIKE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuidLike(s: string): boolean {
  return UUID_LIKE.test(s.trim());
}

type Maps = {
  next: () => string;
  server: Map<string, string>;
  category: Map<string, string>;
  channel: Map<string, string>;
  role: Map<string, string>;
  message: Map<string, string>;
  friendship: Map<string, string>;
  audit: Map<string, string>;
  chOw: Map<string, string>;
  catOw: Map<string, string>;
};

function emptyMaps(next: () => string): Maps {
  return {
    next,
    server: new Map(),
    category: new Map(),
    channel: new Map(),
    role: new Map(),
    message: new Map(),
    friendship: new Map(),
    audit: new Map(),
    chOw: new Map(),
    catOw: new Map(),
  };
}

function rewriteMentions(
  raw: unknown,
  maps: Pick<Maps, 'channel' | 'message' | 'role'>,
): unknown {
  if (!Array.isArray(raw)) return raw;
  return raw.map((m) => {
    if (!m || typeof m !== 'object') return m;
    const o = m as Record<string, unknown>;
    const out = { ...o };
    if (typeof out.userId === 'string' && isUuidLike(out.userId)) {
      /* Mention user ids point at auth_users; this script does not rewrite them. */
    }
    if (typeof out.channelId === 'string' && maps.channel.has(out.channelId)) {
      out.channelId = maps.channel.get(out.channelId)!;
    }
    if (typeof out.id === 'string' && maps.message.has(out.id)) {
      out.id = maps.message.get(out.id)!;
    }
    return out;
  });
}

function rewriteReplyTo(
  raw: unknown,
  messageMap: Map<string, string>,
): unknown {
  if (!raw || typeof raw !== 'object') return raw;
  const o = raw as Record<string, unknown>;
  const out = { ...o };
  if (typeof out.messageId === 'string' && messageMap.has(out.messageId)) {
    out.messageId = messageMap.get(out.messageId)!;
  }
  return out;
}

function rewriteEmbedsShallow(
  raw: unknown,
  messageMap: Map<string, string>,
  channelMap: Map<string, string>,
): unknown {
  if (!Array.isArray(raw)) return raw;
  return raw.map((e) => {
    if (!e || typeof e !== 'object') return e;
    const o = e as Record<string, unknown>;
    const out = { ...o };
    if (typeof out.echoJump === 'object' && out.echoJump) {
      const j = { ...(out.echoJump as Record<string, unknown>) };
      if (typeof j.channelId === 'string' && channelMap.has(j.channelId)) {
        j.channelId = channelMap.get(j.channelId)!;
      }
      if (typeof j.messageId === 'string' && messageMap.has(j.messageId)) {
        j.messageId = messageMap.get(j.messageId)!;
      }
      out.echoJump = j;
    }
    return out;
  });
}

type MessageRow = {
  id: unknown;
  channel_id: unknown;
  mentions: unknown;
  reply_to: unknown;
  embeds: unknown;
};

async function withReplicaTxn(
  client: pg.PoolClient,
  fn: () => Promise<void>,
): Promise<void> {
  await client.query('BEGIN');
  await client.query("SET LOCAL session_replication_role = 'replica'");
  try {
    await fn();
    await client.query("SET LOCAL session_replication_role = 'origin'");
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  }
}

async function updateOneMessageRow(
  client: pg.PoolClient,
  row: MessageRow,
  maps: Maps,
): Promise<void> {
  const oldMid = String(row.id);
  const newMid = maps.message.get(oldMid);
  if (!newMid) return;
  const newCh =
    maps.channel.get(String(row.channel_id)) ?? String(row.channel_id);
  const mentions = rewriteMentions(row.mentions, maps);
  const replyTo = rewriteReplyTo(row.reply_to, maps.message);
  const embeds = rewriteEmbedsShallow(row.embeds, maps.message, maps.channel);
  await client.query(
    `UPDATE echo_messages SET id = $1, channel_id = $2, mentions = $3::jsonb, reply_to = $4::jsonb, embeds = $5::jsonb WHERE id = $6`,
    [
      newMid,
      newCh,
      JSON.stringify(mentions ?? null),
      JSON.stringify(replyTo ?? null),
      JSON.stringify(embeds ?? null),
      oldMid,
    ],
  );
}

async function migrateOneServer(
  client: pg.PoolClient,
  serverId: string,
  maps: Maps,
  dryRun: boolean,
  commitPerChannelMessages: boolean,
): Promise<void> {
  if (!isUuidLike(serverId)) {
    if (dryRun)
      console.log(`[dry-run] skip server id (not UUID-shaped): ${serverId}`);
    return;
  }
  const srvNew = dryRun ? `dry:server:${serverId.slice(0, 8)}` : maps.next();
  maps.server.set(serverId, srvNew);

  const cats = await client.query(
    `SELECT id FROM echo_categories WHERE server_id = $1`,
    [serverId],
  );
  let dryCtr = 0;
  const alloc = () => (dryRun ? `dry:${++dryCtr}` : maps.next());

  for (const row of cats.rows) {
    const id = String(row.id);
    if (isUuidLike(id)) maps.category.set(id, alloc());
  }

  const chs = await client.query(
    `SELECT id FROM echo_channels WHERE server_id = $1`,
    [serverId],
  );
  for (const row of chs.rows) {
    const id = String(row.id);
    if (isUuidLike(id)) maps.channel.set(id, alloc());
  }

  const roles = await client.query(
    `SELECT id FROM echo_roles WHERE server_id = $1`,
    [serverId],
  );
  for (const row of roles.rows) {
    const id = String(row.id);
    if (isUuidLike(id)) maps.role.set(id, alloc());
  }

  const channelIds = [...maps.channel.keys()];
  const msgRows =
    channelIds.length > 0
      ? await client.query(
          `SELECT id FROM echo_messages WHERE channel_id = ANY($1::text[])`,
          [channelIds],
        )
      : { rows: [] as { id: string }[] };
  for (const row of msgRows.rows) {
    const id = String(row.id);
    if (isUuidLike(id)) maps.message.set(id, alloc());
  }

  const chOw = await client.query(
    `SELECT id FROM echo_channel_permission_overwrite_rows WHERE server_id = $1`,
    [serverId],
  );
  for (const row of chOw.rows) {
    const id = String(row.id);
    if (isUuidLike(id)) maps.chOw.set(id, alloc());
  }

  const catOw = await client.query(
    `SELECT id FROM echo_category_permission_overwrite_rows WHERE server_id = $1`,
    [serverId],
  );
  for (const row of catOw.rows) {
    const id = String(row.id);
    if (isUuidLike(id)) maps.catOw.set(id, alloc());
  }

  if (dryRun) {
    console.log(
      `[dry-run] server ${serverId} -> ${srvNew} categories=${maps.category.size} channels=${maps.channel.size} roles=${maps.role.size} messages=${maps.message.size}${commitPerChannelMessages ? ' (per-channel message commits if --execute)' : ''}`,
    );
    return;
  }

  let messagesByOldChannel = new Map<string, MessageRow[]>();
  if (commitPerChannelMessages && maps.message.size > 0) {
    const snap = await client.query(
      `SELECT id, channel_id, mentions, reply_to, embeds FROM echo_messages WHERE id = ANY($1::text[])`,
      [[...maps.message.keys()]],
    );
    for (const row of snap.rows as MessageRow[]) {
      const och = String(row.channel_id);
      const list = messagesByOldChannel.get(och) ?? [];
      list.push(row);
      messagesByOldChannel.set(och, list);
    }
  }

  const runStructureAndRoles = async (): Promise<void> => {
    for (const [oldId, newId] of maps.category) {
      await client.query(
        `UPDATE echo_channels SET category_id = $1 WHERE category_id = $2`,
        [newId, oldId],
      );
      await client.query(
        `UPDATE echo_category_permission_overwrite_rows SET category_id = $1 WHERE category_id = $2`,
        [newId, oldId],
      );
      await client.query(
        `UPDATE echo_category_permission_overrides SET category_id = $1 WHERE category_id = $2`,
        [newId, oldId],
      );
      await client.query(`UPDATE echo_categories SET id = $1 WHERE id = $2`, [
        newId,
        oldId,
      ]);
    }

    for (const [oldId, newId] of maps.channel) {
      await client.query(
        `UPDATE echo_messages SET channel_id = $1 WHERE channel_id = $2`,
        [newId, oldId],
      );
      await client.query(
        `UPDATE echo_voice_participants SET channel_id = $1 WHERE channel_id = $2`,
        [newId, oldId],
      );
      await client.query(
        `UPDATE echo_channel_permission_overwrite_rows SET channel_id = $1 WHERE channel_id = $2`,
        [newId, oldId],
      );
      await client.query(`UPDATE echo_channels SET id = $1 WHERE id = $2`, [
        newId,
        oldId,
      ]);
    }

    for (const [oldId, newId] of maps.role) {
      await client.query(
        `UPDATE echo_member_roles SET role_id = $1 WHERE role_id = $2 AND server_id = $3`,
        [newId, oldId, serverId],
      );
      await client.query(
        `UPDATE echo_channel_permission_overwrite_rows SET target_id = $1 WHERE target_type = 'role' AND target_id = $2 AND server_id = $3`,
        [newId, oldId, serverId],
      );
      await client.query(
        `UPDATE echo_category_permission_overwrite_rows SET target_id = $1 WHERE target_type = 'role' AND target_id = $2 AND server_id = $3`,
        [newId, oldId, serverId],
      );
      await client.query(`UPDATE echo_roles SET id = $1 WHERE id = $2`, [
        newId,
        oldId,
      ]);
    }
  };

  const runMessageUpdates = async (): Promise<void> => {
    const msgs = await client.query(
      `SELECT id, channel_id, mentions, reply_to, embeds FROM echo_messages WHERE id = ANY($1::text[])`,
      [[...maps.message.keys()]],
    );
    for (const row of msgs.rows as MessageRow[]) {
      await updateOneMessageRow(client, row, maps);
    }
  };

  const runFinalize = async (): Promise<void> => {
    for (const [oldId, newId] of maps.chOw) {
      await client.query(
        `UPDATE echo_channel_permission_overwrite_rows SET id = $1 WHERE id = $2`,
        [newId, oldId],
      );
    }
    for (const [oldId, newId] of maps.catOw) {
      await client.query(
        `UPDATE echo_category_permission_overwrite_rows SET id = $1 WHERE id = $2`,
        [newId, oldId],
      );
    }

    const serverScoped = [
      'echo_server_members',
      'echo_channels',
      'echo_categories',
      'echo_roles',
      'echo_invites',
      'echo_audit_log',
      'echo_server_bans',
      'echo_server_member_timeouts',
      'echo_voice_participants',
      'echo_channel_permission_overwrite_rows',
      'echo_category_permission_overwrite_rows',
      'echo_category_permission_overrides',
    ] as const;
    for (const table of serverScoped) {
      await client.query(
        `UPDATE ${table} SET server_id = $1 WHERE server_id = $2`,
        [srvNew, serverId],
      );
    }

    await client.query(`UPDATE echo_servers SET id = $1 WHERE id = $2`, [
      srvNew,
      serverId,
    ]);
  };

  if (commitPerChannelMessages) {
    await withReplicaTxn(client, runStructureAndRoles);

    for (const oldCh of messagesByOldChannel.keys()) {
      const rows = messagesByOldChannel.get(oldCh) ?? [];
      if (rows.length === 0) continue;
      await withReplicaTxn(client, async () => {
        for (const row of rows) {
          await updateOneMessageRow(client, row, maps);
        }
      });
    }

    await withReplicaTxn(client, runFinalize);
    return;
  }

  await withReplicaTxn(client, async () => {
    await runStructureAndRoles();
    await runMessageUpdates();
    await runFinalize();
  });
}

async function migrateGlobalRows(
  pool: pg.Pool,
  dryRun: boolean,
  nextSnowflake: () => string,
): Promise<void> {
  const maps = emptyMaps(nextSnowflake);
  let gCtr = 0;
  const alloc = () => (dryRun ? `dry:g:${++gCtr}` : maps.next());

  const friends = await pool.query(`SELECT id FROM echo_friendships`);
  for (const row of friends.rows) {
    const id = String(row.id);
    if (isUuidLike(id)) maps.friendship.set(id, alloc());
  }

  const audits = await pool.query(`SELECT id FROM echo_audit_log`);
  for (const row of audits.rows) {
    const id = String(row.id);
    if (isUuidLike(id)) maps.audit.set(id, alloc());
  }

  if (dryRun) {
    console.log(
      `[dry-run] global friendships=${maps.friendship.size} audit_rows=${maps.audit.size} (ids to remap)`,
    );
    return;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SET LOCAL session_replication_role = replica');
    for (const [oldId, newId] of maps.friendship) {
      await client.query(`UPDATE echo_friendships SET id = $1 WHERE id = $2`, [
        newId,
        oldId,
      ]);
    }
    for (const [oldId, newId] of maps.audit) {
      await client.query(`UPDATE echo_audit_log SET id = $1 WHERE id = $2`, [
        newId,
        oldId,
      ]);
    }
    await client.query("SET LOCAL session_replication_role = 'origin'");
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

async function main(): Promise<void> {
  const execute = process.argv.includes('--execute');
  const dryRun = !execute;
  const commitPerChannelMessages =
    process.argv.includes('--commit-per-channel-messages') ||
    ['1', 'true', 'yes'].includes(
      String(
        process.env.MIGRATION_COMMIT_MESSAGES_PER_CHANNEL ?? '',
      ).toLowerCase(),
    );
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is required');
    process.exit(1);
  }

  const pool = new pg.Pool({ connectionString: url });
  try {
    const servers = await pool.query(
      `SELECT id FROM echo_servers ORDER BY created_at ASC`,
    );
    const nextSnowflake = createSnowflakeGenerator({
      workerId: Number(process.env.MIGRATION_SNOWFLAKE_WORKER_ID ?? '0'),
    });

    for (const row of servers.rows) {
      const sid = String(row.id);
      const maps = emptyMaps(nextSnowflake);
      const client = await pool.connect();
      try {
        if (!dryRun) await client.query('BEGIN');
        await migrateOneServer(
          client,
          sid,
          maps,
          dryRun,
          commitPerChannelMessages,
        );
        if (!dryRun) await client.query('COMMIT');
      } catch (e) {
        if (!dryRun) await client.query('ROLLBACK');
        throw e;
      } finally {
        client.release();
      }
    }

    await migrateGlobalRows(pool, dryRun, nextSnowflake);

    console.log(
      dryRun
        ? 'Dry-run complete. Re-run with --execute after backup + maintenance window.'
        : 'Migration applied.',
    );
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
