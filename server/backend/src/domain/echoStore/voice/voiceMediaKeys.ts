import type pg from 'pg';
import { isPostgresUndefinedRelationError } from '../../../db/pgErrors';
import {
  ECHO_DM_REALM_SERVER_ID,
  listEchoDmParticipantUserIds,
  userMayJoinDmLiveKitRoom,
} from '../social/dmThreads';
import { assertEchoE2eeDeviceOwned } from './e2ee';
import {
  canUserAccessChannel,
  isMemberOfServer,
} from '../../permissions/echoPermissions';
import {
  echoDmVoiceE2eeRequired,
  getEchoChannelVoiceE2eeEnabled,
} from './voiceE2ee';

const MAX_E2EE_CIPHERTEXT_LEN = 1_000_000;
const MAX_ENVELOPE_JSON_BYTES = 65_536;
const MAX_ENVELOPES_PER_ANNOUNCE = 512;
/** Keep recent keyring slots so in-flight frames still decrypt after rotate. */
const MAX_KEY_INDICES_RETAINED = 16;

export type VoiceMediaKeyEnvelopeInput = {
  recipientUserId: string;
  recipientDeviceId: string;
  ciphertext: string;
  envelope?: unknown;
};

export type VoiceMediaKeyEnvelopeRow = {
  senderUserId: string;
  senderDeviceId: string;
  keyIndex: number;
  recipientUserId: string;
  recipientDeviceId: string;
  ciphertext: string;
  envelope: unknown;
};

export type AnnounceVoiceMediaKeyResult =
  | 'ok'
  | 'forbidden'
  | 'e2ee_disabled'
  | 'not_in_voice'
  | 'recipient_forbidden'
  | 'invalid_body'
  | 'too_many_envelopes'
  | 'device_invalid'
  | 'infra_missing';

function envelopeJsonByteLength(envelope: unknown): number {
  if (envelope === undefined || envelope === null) return 0;
  try {
    return Buffer.byteLength(JSON.stringify(envelope), 'utf8');
  } catch {
    return MAX_ENVELOPE_JSON_BYTES + 1;
  }
}

async function isUserInGuildVoiceChannel(
  pool: pg.Pool,
  serverId: string,
  channelId: string,
  userId: string,
): Promise<boolean> {
  try {
    const r = await pool.query(
      `
      SELECT 1 FROM echo_voice_participants
      WHERE server_id = $1 AND channel_id = $2 AND user_id = $3
      LIMIT 1
      `,
      [serverId, channelId, userId],
    );
    return r.rows.length > 0;
  } catch (e) {
    if (isPostgresUndefinedRelationError(e)) return false;
    throw e;
  }
}

async function assertVoiceE2eeContext(
  pool: pg.Pool,
  serverId: string,
  channelId: string,
  actorUserId: string,
): Promise<'ok' | 'forbidden' | 'e2ee_disabled' | 'not_in_voice'> {
  if (serverId === ECHO_DM_REALM_SERVER_ID) {
    const okJoin = await userMayJoinDmLiveKitRoom(pool, channelId, actorUserId);
    if (!okJoin) return 'forbidden';
    const need = await echoDmVoiceE2eeRequired(pool, channelId);
    if (!need) return 'e2ee_disabled';
    return 'ok';
  }
  const mem = await isMemberOfServer(pool, serverId, actorUserId);
  if (!mem) return 'forbidden';
  const enabled = await getEchoChannelVoiceE2eeEnabled(
    pool,
    serverId,
    channelId,
  );
  if (!enabled) return 'e2ee_disabled';
  const access = await canUserAccessChannel(pool, actorUserId, channelId);
  if (!access) return 'forbidden';
  if (
    !(await isUserInGuildVoiceChannel(pool, serverId, channelId, actorUserId))
  ) {
    return 'not_in_voice';
  }
  return 'ok';
}

async function assertRecipientsAllowed(
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

/**
 * Publish opaque LibSignal-wrapped sender media keys for peers.
 * Server never sees plaintext; retains the last {@link MAX_KEY_INDICES_RETAINED}
 * key indices per sender for keyring grace.
 */
export async function announceVoiceMediaKeys(
  pool: pg.Pool,
  opts: {
    serverId: string;
    channelId: string;
    actorUserId: string;
    senderDeviceId: string;
    keyIndex: number;
    envelopes: VoiceMediaKeyEnvelopeInput[];
  },
): Promise<AnnounceVoiceMediaKeyResult> {
  const keyIndex = Math.floor(Number(opts.keyIndex));
  if (!Number.isFinite(keyIndex) || keyIndex < 0 || keyIndex > 1_000_000) {
    return 'invalid_body';
  }
  const senderDeviceId = opts.senderDeviceId.trim();
  if (!senderDeviceId) return 'invalid_body';
  if (opts.envelopes.length > MAX_ENVELOPES_PER_ANNOUNCE) {
    return 'too_many_envelopes';
  }

  const ctx = await assertVoiceE2eeContext(
    pool,
    opts.serverId,
    opts.channelId,
    opts.actorUserId,
  );
  if (ctx !== 'ok') return ctx;

  const ownDevice = await assertEchoE2eeDeviceOwned(
    pool,
    opts.actorUserId,
    senderDeviceId,
  );
  if (ownDevice === 'infra_missing') return 'infra_missing';
  if (ownDevice !== 'ok') return 'device_invalid';

  const recipientIds = opts.envelopes.map((e) => e.recipientUserId);
  if (recipientIds.length > 0) {
    const allowed = await assertRecipientsAllowed(
      pool,
      opts.serverId,
      opts.channelId,
      recipientIds,
    );
    if (allowed !== 'ok') return 'recipient_forbidden';
  }

  for (const env of opts.envelopes) {
    const uid = env.recipientUserId.trim();
    const did = env.recipientDeviceId.trim();
    const ct = env.ciphertext.trim();
    if (!uid || !did || !ct) return 'invalid_body';
    if (ct.length > MAX_E2EE_CIPHERTEXT_LEN) return 'invalid_body';
    if (envelopeJsonByteLength(env.envelope) > MAX_ENVELOPE_JSON_BYTES) {
      return 'invalid_body';
    }
    const own = await assertEchoE2eeDeviceOwned(pool, uid, did);
    if (own === 'infra_missing') return 'infra_missing';
    if (own !== 'ok') return 'device_invalid';
  }

  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const env of opts.envelopes) {
        await client.query(
          `
          INSERT INTO echo_voice_media_key_envelopes (
            server_id, channel_id, sender_user_id, sender_device_id, key_index,
            recipient_user_id, recipient_device_id, ciphertext, envelope
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
          ON CONFLICT (server_id, channel_id, sender_user_id, key_index,
            recipient_user_id, recipient_device_id)
          DO UPDATE SET
            sender_device_id = EXCLUDED.sender_device_id,
            ciphertext = EXCLUDED.ciphertext,
            envelope = EXCLUDED.envelope,
            created_at = NOW()
          `,
          [
            opts.serverId,
            opts.channelId,
            opts.actorUserId,
            senderDeviceId,
            keyIndex,
            env.recipientUserId.trim(),
            env.recipientDeviceId.trim(),
            env.ciphertext.trim(),
            env.envelope === undefined ? null : JSON.stringify(env.envelope),
          ],
        );
      }
      // Prune older key indices beyond keyring retention.
      await client.query(
        `
        DELETE FROM echo_voice_media_key_envelopes e
        WHERE e.server_id = $1 AND e.channel_id = $2
          AND e.sender_user_id = $3
          AND e.key_index < $4
        `,
        [
          opts.serverId,
          opts.channelId,
          opts.actorUserId,
          Math.max(0, keyIndex - (MAX_KEY_INDICES_RETAINED - 1)),
        ],
      );
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
  } catch (e) {
    if (isPostgresUndefinedRelationError(e)) return 'infra_missing';
    throw e;
  }
}

/**
 * List media-key envelopes addressed to `userId` for this channel.
 * Returns the latest key_index per sender (and any retained prior indices).
 */
export async function listVoiceMediaKeyInbox(
  pool: pg.Pool,
  opts: {
    serverId: string;
    channelId: string;
    userId: string;
    /** When set, only envelopes from this sender. */
    senderUserId?: string;
  },
): Promise<
  | { ok: true; envelopes: VoiceMediaKeyEnvelopeRow[] }
  | { ok: false; reason: 'forbidden' | 'e2ee_disabled' | 'infra_missing' }
> {
  const ctx = await assertVoiceE2eeContext(
    pool,
    opts.serverId,
    opts.channelId,
    opts.userId,
  );
  if (ctx === 'forbidden') return { ok: false, reason: 'forbidden' };
  if (ctx === 'e2ee_disabled') return { ok: false, reason: 'e2ee_disabled' };
  // Inbox fetch is allowed before the guild voice row exists (prepare before join).
  if (ctx === 'not_in_voice') {
    const mem = await isMemberOfServer(pool, opts.serverId, opts.userId);
    if (!mem) return { ok: false, reason: 'forbidden' };
  }

  try {
    const params: unknown[] = [opts.serverId, opts.channelId, opts.userId];
    let senderFilter = '';
    if (opts.senderUserId?.trim()) {
      params.push(opts.senderUserId.trim());
      senderFilter = `AND sender_user_id = $${params.length}`;
    }
    const r = await pool.query(
      `SELECT sender_user_id, sender_device_id, key_index,
              recipient_user_id, recipient_device_id, ciphertext, envelope
       FROM echo_voice_media_key_envelopes
       WHERE server_id = $1 AND channel_id = $2
         AND recipient_user_id = $3
         ${senderFilter}
       ORDER BY key_index DESC, created_at DESC`,
      params,
    );
    const envelopes: VoiceMediaKeyEnvelopeRow[] = r.rows.map((row) => ({
      senderUserId: String(row.sender_user_id),
      senderDeviceId: String(row.sender_device_id),
      keyIndex: Number(row.key_index),
      recipientUserId: String(row.recipient_user_id),
      recipientDeviceId: String(row.recipient_device_id),
      ciphertext: String(row.ciphertext),
      envelope: row.envelope ?? { protocol: 'libsignal-v1' },
    }));
    return { ok: true, envelopes };
  } catch (e) {
    if (isPostgresUndefinedRelationError(e)) {
      return { ok: false, reason: 'infra_missing' };
    }
    throw e;
  }
}

export async function clearVoiceMediaKeysForChannel(
  pool: pg.Pool,
  serverId: string,
  channelId: string,
): Promise<void> {
  try {
    await pool.query(
      `DELETE FROM echo_voice_media_key_envelopes
       WHERE server_id = $1 AND channel_id = $2`,
      [serverId, channelId],
    );
  } catch (e) {
    if (isPostgresUndefinedRelationError(e)) return;
    throw e;
  }
}
