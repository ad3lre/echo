import type pg from 'pg';
import { isPostgresUndefinedRelationError } from '../../db/pgErrors';
import { liveKitRoomName } from '../../services/livekit/livekitAdapter';
import {
  ECHO_DM_REALM_SERVER_ID,
  listEchoDmParticipantUserIds,
  userMayJoinDmLiveKitRoom,
} from './dmThreads';
import { assertEchoE2eeDeviceOwned, isEchoE2eeThreadEnabled } from './e2ee';
import {
  canUserAccessChannel,
  isMemberOfServer,
} from '../../domain/echoPermissions';

const MAX_E2EE_CIPHERTEXT_LEN = 1_000_000;
const MAX_ENVELOPES_PER_EPOCH = 64;

export type EchoVoiceE2eeEpochRow = {
  id: string;
  serverId: string;
  channelId: string;
  roomName: string;
  createdAt: string;
  createdByUserId: string;
  supersededAt: string | null;
};

export type EchoVoiceE2eeEnvelopeInput = {
  recipientUserId: string;
  recipientDeviceId: string;
  ciphertext: string;
  envelope?: unknown;
};

function isUuidLike(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    id.trim(),
  );
}

export async function getEchoChannelVoiceE2eeEnabled(
  pool: pg.Pool,
  serverId: string,
  channelId: string,
): Promise<boolean> {
  try {
    const r = await pool.query(
      `
      SELECT voice_e2ee_enabled, type
      FROM echo_channels
      WHERE id = $1 AND server_id = $2
      LIMIT 1
      `,
      [channelId, serverId],
    );
    if (!r.rows[0]) return false;
    const t = String(r.rows[0].type);
    if (t !== 'voice' && t !== 'stage') return false;
    return Boolean(r.rows[0].voice_e2ee_enabled);
  } catch (e) {
    if (isPostgresUndefinedRelationError(e)) return false;
    throw e;
  }
}

export async function echoDmVoiceE2eeRequired(
  pool: pg.Pool,
  channelId: string,
): Promise<boolean> {
  return isEchoE2eeThreadEnabled(pool, channelId);
}

export async function getActiveVoiceE2eeEpoch(
  pool: pg.Pool,
  serverId: string,
  channelId: string,
): Promise<EchoVoiceE2eeEpochRow | null> {
  try {
    const r = await pool.query(
      `
      SELECT id, server_id, channel_id, room_name, created_at, created_by_user_id, superseded_at
      FROM echo_voice_e2ee_epochs
      WHERE server_id = $1 AND channel_id = $2 AND superseded_at IS NULL
      ORDER BY created_at DESC
      LIMIT 1
      `,
      [serverId, channelId],
    );
    const row = r.rows[0];
    if (!row) return null;
    return {
      id: String(row.id),
      serverId: String(row.server_id),
      channelId: String(row.channel_id),
      roomName: String(row.room_name),
      createdAt:
        row.created_at instanceof Date
          ? row.created_at.toISOString()
          : String(row.created_at),
      createdByUserId: String(row.created_by_user_id),
      supersededAt:
        row.superseded_at == null
          ? null
          : row.superseded_at instanceof Date
            ? row.superseded_at.toISOString()
            : String(row.superseded_at),
    };
  } catch (e) {
    if (isPostgresUndefinedRelationError(e)) return null;
    throw e;
  }
}

export async function supersedeVoiceE2eeEpochsForChannel(
  pool: pg.Pool,
  serverId: string,
  channelId: string,
): Promise<number> {
  try {
    const r = await pool.query(
      `
      UPDATE echo_voice_e2ee_epochs
      SET superseded_at = NOW()
      WHERE server_id = $1 AND channel_id = $2 AND superseded_at IS NULL
      `,
      [serverId, channelId],
    );
    return r.rowCount ?? 0;
  } catch (e) {
    if (isPostgresUndefinedRelationError(e)) return 0;
    throw e;
  }
}

async function assertRecipientsAllowedForVoiceE2ee(
  pool: pg.Pool,
  serverId: string,
  channelId: string,
  recipientIds: string[],
): Promise<'ok' | 'forbidden'> {
  const uniq = [...new Set(recipientIds.map((x) => x.trim()).filter(Boolean))];
  if (serverId === ECHO_DM_REALM_SERVER_ID) {
    const members = new Set(
      await listEchoDmParticipantUserIds(pool, channelId),
    );
    for (const uid of uniq) {
      if (!members.has(uid)) return 'forbidden';
    }
    return 'ok';
  }
  for (const uid of uniq) {
    const mem = await isMemberOfServer(pool, serverId, uid);
    if (!mem) return 'forbidden';
    const access = await canUserAccessChannel(pool, uid, channelId);
    if (!access) return 'forbidden';
  }
  return 'ok';
}

export type CreateVoiceE2eeEpochResult =
  | 'ok'
  | 'forbidden'
  | 'invalid_body'
  | 'bad_epoch_id'
  | 'too_many_envelopes'
  | 'device_invalid';

/**
 * Creates a new epoch (superseding any active row for the channel) and inserts envelopes.
 * Server stores opaque ciphertext only.
 */
export async function createVoiceE2eeEpochWithEnvelopes(
  pool: pg.Pool,
  opts: {
    serverId: string;
    channelId: string;
    actorUserId: string;
    epochId: string;
    envelopes: EchoVoiceE2eeEnvelopeInput[];
  },
): Promise<CreateVoiceE2eeEpochResult> {
  const epochId = opts.epochId.trim();
  if (!isUuidLike(epochId)) return 'bad_epoch_id';
  if (opts.envelopes.length > MAX_ENVELOPES_PER_EPOCH)
    return 'too_many_envelopes';

  if (opts.serverId === ECHO_DM_REALM_SERVER_ID) {
    const okJoin = await userMayJoinDmLiveKitRoom(
      pool,
      opts.channelId,
      opts.actorUserId,
    );
    if (!okJoin) return 'forbidden';
    const need = await echoDmVoiceE2eeRequired(pool, opts.channelId);
    if (!need) return 'forbidden';
  } else {
    const mem = await isMemberOfServer(pool, opts.serverId, opts.actorUserId);
    if (!mem) return 'forbidden';
    const enabled = await getEchoChannelVoiceE2eeEnabled(
      pool,
      opts.serverId,
      opts.channelId,
    );
    if (!enabled) return 'forbidden';
    const access = await canUserAccessChannel(
      pool,
      opts.actorUserId,
      opts.channelId,
    );
    if (!access) return 'forbidden';
  }

  const recipientIds = opts.envelopes.map((e) => e.recipientUserId);
  if (recipientIds.length > 0) {
    const allowed = await assertRecipientsAllowedForVoiceE2ee(
      pool,
      opts.serverId,
      opts.channelId,
      recipientIds,
    );
    if (allowed !== 'ok') return 'forbidden';
  }

  for (const env of opts.envelopes) {
    const uid = env.recipientUserId.trim();
    const did = env.recipientDeviceId.trim();
    const ct = env.ciphertext.trim();
    if (!uid || !did || !ct) return 'invalid_body';
    if (ct.length > MAX_E2EE_CIPHERTEXT_LEN) return 'invalid_body';
    const own = await assertEchoE2eeDeviceOwned(pool, uid, did);
    if (own !== 'ok') return 'device_invalid';
  }

  const roomName = liveKitRoomName(opts.serverId, opts.channelId);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `
      UPDATE echo_voice_e2ee_epochs
      SET superseded_at = NOW()
      WHERE server_id = $1 AND channel_id = $2 AND superseded_at IS NULL
      `,
      [opts.serverId, opts.channelId],
    );
    await client.query(
      `
      INSERT INTO echo_voice_e2ee_epochs (
        id, server_id, channel_id, room_name, created_by_user_id
      ) VALUES ($1, $2, $3, $4, $5)
      `,
      [epochId, opts.serverId, opts.channelId, roomName, opts.actorUserId],
    );
    for (const env of opts.envelopes) {
      await client.query(
        `
        INSERT INTO echo_voice_e2ee_envelopes (
          epoch_id, recipient_user_id, recipient_device_id, ciphertext, envelope
        ) VALUES ($1, $2, $3, $4, $5::jsonb)
        `,
        [
          epochId,
          env.recipientUserId.trim(),
          env.recipientDeviceId.trim(),
          env.ciphertext.trim(),
          env.envelope === undefined ? null : JSON.stringify(env.envelope),
        ],
      );
    }
    await client.query('COMMIT');
    return 'ok';
  } catch (e) {
    try {
      await client.query('ROLLBACK');
    } catch {
      /* ignore */
    }
    throw e;
  } finally {
    client.release();
  }
}

export type EchoVoiceE2eeEnvelopeRow = {
  recipientUserId: string;
  recipientDeviceId: string;
  ciphertext: string;
  envelope: unknown | null;
};

export async function listVoiceE2eeEnvelopesForUser(
  pool: pg.Pool,
  opts: {
    serverId: string;
    channelId: string;
    userId: string;
  },
): Promise<
  | {
      ok: true;
      epoch: EchoVoiceE2eeEpochRow | null;
      envelopes: EchoVoiceE2eeEnvelopeRow[];
    }
  | { ok: false; reason: 'forbidden' }
> {
  if (opts.serverId === ECHO_DM_REALM_SERVER_ID) {
    const okJoin = await userMayJoinDmLiveKitRoom(
      pool,
      opts.channelId,
      opts.userId,
    );
    if (!okJoin) return { ok: false, reason: 'forbidden' };
  } else {
    const mem = await isMemberOfServer(pool, opts.serverId, opts.userId);
    if (!mem) return { ok: false, reason: 'forbidden' };
    const access = await canUserAccessChannel(
      pool,
      opts.userId,
      opts.channelId,
    );
    if (!access) return { ok: false, reason: 'forbidden' };
  }

  const epoch = await getActiveVoiceE2eeEpoch(
    pool,
    opts.serverId,
    opts.channelId,
  );
  if (!epoch) return { ok: true, epoch: null, envelopes: [] };

  try {
    const r = await pool.query(
      `
      SELECT recipient_user_id, recipient_device_id, ciphertext, envelope
      FROM echo_voice_e2ee_envelopes
      WHERE epoch_id = $1 AND recipient_user_id = $2
      ORDER BY recipient_device_id ASC
      `,
      [epoch.id, opts.userId],
    );
    const envelopes: EchoVoiceE2eeEnvelopeRow[] = r.rows.map(
      (row: {
        recipient_user_id: unknown;
        recipient_device_id: unknown;
        ciphertext: unknown;
        envelope: unknown;
      }) => ({
        recipientUserId: String(row.recipient_user_id),
        recipientDeviceId: String(row.recipient_device_id),
        ciphertext: String(row.ciphertext),
        envelope: row.envelope ?? null,
      }),
    );
    return { ok: true, epoch, envelopes };
  } catch (e) {
    if (isPostgresUndefinedRelationError(e)) {
      return { ok: true, epoch: null, envelopes: [] };
    }
    throw e;
  }
}
