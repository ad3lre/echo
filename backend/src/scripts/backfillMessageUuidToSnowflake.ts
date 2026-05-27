/**
 * Backfill: convert legacy UUID message IDs to time-derived snowflakes.
 *
 * Generates a snowflake from each message's `created_at` timestamp so that
 * ID ordering matches chronological ordering. Updates all FK references
 * (reactions, pins, poll votes, read state) and JSONB references (reply_to,
 * forward_of) in batched transactions.
 *
 * Usage (from backend/):
 *   npx ts-node src/scripts/backfillMessageUuidToSnowflake.ts           # dry-run
 *   npx ts-node src/scripts/backfillMessageUuidToSnowflake.ts --execute # apply
 */
import { closePgPool, getPgPool } from '../db/pg';
import {
  ECHO_SNOWFLAKE_EPOCH_MS,
  isEchoPublicId,
} from '../../../shared/snowflakeIds';

const BATCH_SIZE = 200;
const BACKFILL_DATACENTER_ID = 31n;
const BACKFILL_WORKER_ID = 31n;

const execute = process.argv.includes('--execute');

let sequenceByMs = new Map<number, number>();

function snowflakeFromTimestamp(ms: number): string {
  let seq = sequenceByMs.get(ms) ?? 0;
  if (seq > 0xfff) {
    ms += 1;
    seq = 0;
  }
  sequenceByMs.set(ms, seq + 1);

  const delta = BigInt(ms - ECHO_SNOWFLAKE_EPOCH_MS);
  const id =
    (delta << 22n) |
    (BACKFILL_DATACENTER_ID << 17n) |
    (BACKFILL_WORKER_ID << 12n) |
    BigInt(seq);

  return id.toString(10);
}

async function main(): Promise<void> {
  const pool = getPgPool();
  if (!pool) {
    console.error('DATABASE_URL is not set; nothing to do.');
    process.exit(1);
  }

  const countRes = await pool.query<{ cnt: string }>(
    `SELECT count(*) AS cnt FROM echo_messages WHERE id ~ '[^0-9]'`,
  );
  const totalUuid = parseInt(countRes.rows[0]?.cnt ?? '0', 10);
  console.log(`Found ${totalUuid} messages with non-snowflake IDs.`);

  if (totalUuid === 0) {
    console.log('Nothing to backfill.');
    await closePgPool();
    return;
  }

  if (!execute) {
    console.log('Dry-run mode. Pass --execute to apply changes.');
    await closePgPool();
    return;
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS _migration_message_id_map (
      old_id TEXT PRIMARY KEY,
      new_id TEXT NOT NULL UNIQUE,
      migrated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  let migrated = 0;
  let offset = 0;

  while (true) {
    const batch = await pool.query<{ id: string; created_at: string }>(
      `SELECT id, created_at FROM echo_messages
       WHERE id ~ '[^0-9]'
       ORDER BY created_at ASC
       LIMIT $1`,
      [BATCH_SIZE],
    );

    if (batch.rows.length === 0) break;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SET session_replication_role = 'replica'`);

      for (const row of batch.rows) {
        const oldId = row.id;
        const createdAtMs = new Date(row.created_at).getTime();
        const newId = snowflakeFromTimestamp(createdAtMs);

        if (!isEchoPublicId(newId)) {
          console.error(`Generated invalid snowflake for ${oldId}: ${newId}`);
          await client.query('ROLLBACK');
          await closePgPool();
          process.exit(1);
        }

        await client.query(
          `INSERT INTO _migration_message_id_map (old_id, new_id) VALUES ($1, $2) ON CONFLICT (old_id) DO NOTHING`,
          [oldId, newId],
        );

        await client.query(`UPDATE echo_messages SET id = $1 WHERE id = $2`, [
          newId,
          oldId,
        ]);
        await client.query(
          `UPDATE echo_message_reactions SET message_id = $1 WHERE message_id = $2`,
          [newId, oldId],
        );
        await client.query(
          `UPDATE echo_channel_pins SET message_id = $1 WHERE message_id = $2`,
          [newId, oldId],
        );
        await client.query(
          `UPDATE echo_poll_votes SET message_id = $1 WHERE message_id = $2`,
          [newId, oldId],
        );
        await client.query(
          `UPDATE echo_channel_read_state SET last_read_message_id = $1 WHERE last_read_message_id = $2`,
          [newId, oldId],
        );

        await client.query(
          `UPDATE echo_messages SET reply_to = jsonb_set(reply_to, '{messageId}', to_jsonb($1::text))
           WHERE reply_to->>'messageId' = $2`,
          [newId, oldId],
        );
        await client.query(
          `UPDATE echo_messages SET forward_of = jsonb_set(forward_of, '{messageId}', to_jsonb($1::text))
           WHERE forward_of->>'messageId' = $2`,
          [newId, oldId],
        );
      }

      await client.query(`SET session_replication_role = 'origin'`);
      await client.query('COMMIT');
      migrated += batch.rows.length;
      console.log(`Migrated ${migrated}/${totalUuid} messages...`);
    } catch (err) {
      await client.query('ROLLBACK');
      console.error(`Batch failed at offset ${offset}:`, err);
      process.exit(1);
    } finally {
      client.release();
    }

    offset += batch.rows.length;
  }

  const remaining = await pool.query<{ cnt: string }>(
    `SELECT count(*) AS cnt FROM echo_messages WHERE id ~ '[^0-9]'`,
  );
  console.log(
    `Done. Migrated ${migrated} messages. Remaining non-snowflake IDs: ${remaining.rows[0]?.cnt ?? '?'}`,
  );

  await closePgPool();
}

main().catch((err) => {
  console.error('Backfill failed:', err);
  process.exit(1);
});
