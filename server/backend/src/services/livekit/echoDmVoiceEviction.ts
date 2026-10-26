import type pg from 'pg';
import { config } from '../../config';
import { ECHO_DM_REALM_SERVER_ID } from '../../domain/echoStore';
import { liveKitRoomName, removeLiveKitParticipant } from './livekitAdapter';

type EvictionLogger = {
  warn: (obj: Record<string, unknown>, msg?: string) => void;
};

/**
 * Drop DB voice roster + LiveKit participant for a DM / group-DM channel.
 * Best-effort: DB cleanup always runs; LiveKit kick is skipped when disabled.
 */
export async function evictEchoDmVoiceParticipant(
  pool: pg.Pool,
  channelId: string,
  userId: string,
  log?: EvictionLogger,
): Promise<void> {
  const cid = channelId.trim();
  const uid = userId.trim();
  if (!cid || !uid) return;

  await pool.query(
    `
    DELETE FROM echo_stage_speak_requests
    WHERE server_id = $1 AND channel_id = $2 AND user_id = $3
    `,
    [ECHO_DM_REALM_SERVER_ID, cid, uid],
  );
  await pool.query(
    `
    DELETE FROM echo_voice_participants
    WHERE server_id = $1 AND channel_id = $2 AND user_id = $3
    `,
    [ECHO_DM_REALM_SERVER_ID, cid, uid],
  );

  if (!config.liveKitEnabled) return;
  const roomName = liveKitRoomName(ECHO_DM_REALM_SERVER_ID, cid);
  try {
    await removeLiveKitParticipant(roomName, uid);
  } catch (err) {
    log?.warn(
      { err, channelId: cid, userId: uid, roomName },
      '[LiveKit] removeParticipant after DM voice eviction failed',
    );
  }
}

/** 1:1 DM channel id for a user pair, if any. */
export async function findEchoDirectDmChannelId(
  pool: pg.Pool,
  userA: string,
  userB: string,
): Promise<string | null> {
  const a = userA.trim();
  const b = userB.trim();
  if (!a || !b || a === b) return null;
  const [low, high] = a < b ? [a, b] : [b, a];
  const r = await pool.query<{ channel_id: string }>(
    `
    SELECT channel_id
    FROM echo_dm_threads
    WHERE user_low = $1 AND user_high = $2
    LIMIT 1
    `,
    [low, high],
  );
  return r.rows[0] ? String(r.rows[0].channel_id) : null;
}

/** Group DM channels where both users are currently members. */
export async function listEchoSharedGroupDmChannelIds(
  pool: pg.Pool,
  userA: string,
  userB: string,
): Promise<string[]> {
  const a = userA.trim();
  const b = userB.trim();
  if (!a || !b || a === b) return [];
  const r = await pool.query<{ channel_id: string }>(
    `
    SELECT a.channel_id
    FROM echo_group_dm_members a
    INNER JOIN echo_group_dm_members b
      ON b.channel_id = a.channel_id AND b.user_id = $2
    WHERE a.user_id = $1
    `,
    [a, b],
  );
  return r.rows.map((row) => String(row.channel_id)).filter(Boolean);
}

/**
 * After a block (or similar), kick both users from any shared 1:1 / group-DM
 * LiveKit rooms so a stale join JWT cannot keep the call alive.
 */
export async function evictEchoDmVoiceForBlockedPair(
  pool: pg.Pool,
  userA: string,
  userB: string,
  log?: EvictionLogger,
): Promise<void> {
  const channelIds = new Set<string>();
  const direct = await findEchoDirectDmChannelId(pool, userA, userB);
  if (direct) channelIds.add(direct);
  for (const id of await listEchoSharedGroupDmChannelIds(pool, userA, userB)) {
    channelIds.add(id);
  }
  for (const channelId of channelIds) {
    // Evict both sides — either may still hold a valid join JWT.
    await evictEchoDmVoiceParticipant(pool, channelId, userA, log);
    await evictEchoDmVoiceParticipant(pool, channelId, userB, log);
  }
}
