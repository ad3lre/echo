import type pg from 'pg';
import { isPostgresUndefinedRelationError } from '../../../db/pgErrors';
import { diagnoseEchoPostMessageDenial } from '../members/access';
import {
  echoUsersShareDirectDm,
  isEchoGroupDmChannel,
} from '../social/dmThreads';

export type EchoE2eeDeviceUpsertInput = {
  deviceId: string;
  identityKey: string;
  signedPrekey?: unknown;
  oneTimePrekeys?: unknown;
  registrationId?: number;
};

export function normalizeEchoE2eeDeviceUpsertInput(
  raw: unknown,
):
  | { ok: true; value: EchoE2eeDeviceUpsertInput }
  | { ok: false; error: string } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, error: 'body required' };
  }
  const o = raw as Record<string, unknown>;
  const deviceId = typeof o.deviceId === 'string' ? o.deviceId.trim() : '';
  const identityKey =
    typeof o.identityKey === 'string' ? o.identityKey.trim() : '';
  let registrationId: number | undefined;
  if (o.registrationId !== undefined && o.registrationId !== null) {
    if (
      typeof o.registrationId !== 'number' ||
      !Number.isInteger(o.registrationId) ||
      o.registrationId < 1 ||
      o.registrationId > 0x3fff
    ) {
      return { ok: false, error: 'registrationId invalid' };
    }
    registrationId = o.registrationId;
  }
  if (!deviceId) return { ok: false, error: 'deviceId required' };
  if (deviceId.length > 96) return { ok: false, error: 'deviceId too long' };
  if (!identityKey) return { ok: false, error: 'identityKey required' };
  if (identityKey.length > 65_536)
    return { ok: false, error: 'identityKey too long' };
  return {
    ok: true,
    value: {
      deviceId,
      identityKey,
      signedPrekey: o.signedPrekey,
      oneTimePrekeys: o.oneTimePrekeys,
      ...(registrationId !== undefined ? { registrationId } : {}),
    },
  };
}

export async function upsertEchoE2eeDevice(
  pool: pg.Pool,
  userId: string,
  input: EchoE2eeDeviceUpsertInput,
): Promise<void> {
  await pool.query(
    `
    INSERT INTO echo_e2ee_devices (
      user_id,
      device_id,
      identity_key,
      signed_prekey,
      one_time_prekeys,
      registration_id,
      revoked_at,
      protocol_device_id
    )
    VALUES (
      $1,
      $2,
      $3,
      $4,
      COALESCE($5::jsonb, '[]'::jsonb),
      $6,
      NULL,
      COALESCE(
        (SELECT protocol_device_id FROM echo_e2ee_devices d
         WHERE d.user_id = $1 AND d.device_id = $2 LIMIT 1),
        (SELECT COALESCE(MAX(protocol_device_id), 0) + 1
         FROM echo_e2ee_devices e WHERE e.user_id = $1)
      )
    )
    ON CONFLICT (user_id, device_id) DO UPDATE
    SET
      identity_key = EXCLUDED.identity_key,
      signed_prekey = EXCLUDED.signed_prekey,
      one_time_prekeys = EXCLUDED.one_time_prekeys,
      registration_id = COALESCE(EXCLUDED.registration_id, echo_e2ee_devices.registration_id)
    `,
    [
      userId,
      input.deviceId,
      input.identityKey,
      input.signedPrekey ?? null,
      input.oneTimePrekeys ?? null,
      input.registrationId ?? null,
    ],
  );
}

export type EchoE2eeDeviceOwnership =
  | 'ok'
  | 'missing'
  | 'revoked'
  | 'infra_missing';

export async function assertEchoE2eeDeviceOwned(
  pool: pg.Pool,
  userId: string,
  deviceId: string,
): Promise<EchoE2eeDeviceOwnership> {
  const did = deviceId.trim();
  if (!did) return 'missing';
  try {
    const r = await pool.query(
      `
      SELECT revoked_at
      FROM echo_e2ee_devices
      WHERE user_id = $1 AND device_id = $2
      LIMIT 1
      `,
      [userId, did],
    );
    if (!r.rowCount) return 'missing';
    const rev = r.rows[0]?.revoked_at;
    if (rev) return 'revoked';
    return 'ok';
  } catch (e) {
    if (isPostgresUndefinedRelationError(e)) return 'infra_missing';
    throw e;
  }
}

export type EchoE2eePeerDeviceBundle = {
  deviceId: string;
  /** LibSignal / SignalProtocolAddress device id (distinct from UUID device_id). */
  protocolDeviceId: number;
  registrationId: number;
  identityPubB64: string;
  signedPreKey: {
    keyId: number;
    pubKeyB64: string;
    signatureB64: string;
  };
  oneTimePreKey?: { keyId: number; pubKeyB64: string };
};

type ParsedPeerBundleRow = {
  bundle: EchoE2eePeerDeviceBundle;
  remainingOtks: unknown[] | null;
  rowDeviceId: string;
};

function parsePeerBundleRow(
  row: Record<string, unknown>,
): ParsedPeerBundleRow | null {
  const signed = row.signed_prekey as Record<string, unknown> | null;
  if (!signed || typeof signed !== 'object') return null;
  const skId = Number(signed.keyId);
  const pubKeyB64 =
    typeof signed.pubKeyB64 === 'string'
      ? signed.pubKeyB64
      : typeof signed.publicKey === 'string'
        ? signed.publicKey
        : '';
  const signatureB64 =
    typeof signed.signatureB64 === 'string'
      ? signed.signatureB64
      : typeof signed.signature === 'string'
        ? signed.signature
        : '';
  if (!Number.isInteger(skId) || !pubKeyB64.trim() || !signatureB64.trim()) {
    return null;
  }
  const regRaw = row.registration_id;
  const registrationId =
    typeof regRaw === 'number' && Number.isInteger(regRaw)
      ? regRaw
      : Number(regRaw);
  if (!Number.isInteger(registrationId) || registrationId < 1) return null;
  const idKey = String(row.identity_key ?? '').trim();
  if (!idKey) return null;
  const pidRaw = row.protocol_device_id;
  const protocolDeviceId =
    typeof pidRaw === 'number' && Number.isInteger(pidRaw) && pidRaw >= 1
      ? pidRaw
      : Number(pidRaw);
  if (!Number.isInteger(protocolDeviceId) || protocolDeviceId < 1) return null;
  const otks = row.one_time_prekeys;
  let oneTimePreKey: EchoE2eePeerDeviceBundle['oneTimePreKey'];
  let remainingOtks: unknown[] | null = null;
  if (Array.isArray(otks) && otks.length > 0) {
    const first = otks[0] as Record<string, unknown>;
    const okId = Number(first.keyId);
    const okPub =
      typeof first.pubKeyB64 === 'string'
        ? first.pubKeyB64
        : typeof first.publicKey === 'string'
          ? first.publicKey
          : '';
    if (Number.isInteger(okId) && okPub.trim()) {
      oneTimePreKey = { keyId: okId, pubKeyB64: okPub.trim() };
      remainingOtks = otks.slice(1);
    }
  }
  return {
    bundle: {
      deviceId: String(row.device_id),
      protocolDeviceId,
      registrationId,
      identityPubB64: idKey,
      signedPreKey: {
        keyId: skId,
        pubKeyB64: pubKeyB64.trim(),
        signatureB64: signatureB64.trim(),
      },
      ...(oneTimePreKey ? { oneTimePreKey } : {}),
    },
    remainingOtks,
    rowDeviceId: String(row.device_id),
  };
}

/** All active peer devices with prekey bundles (one OTK consumed per device when available). */
export async function listEchoE2eePeerDeviceBundles(
  pool: pg.Pool,
  targetUserId: string,
): Promise<EchoE2eePeerDeviceBundle[]> {
  const uid = targetUserId.trim();
  if (!uid) return [];
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const r = await client.query(
      `
      SELECT
        device_id,
        protocol_device_id,
        registration_id,
        identity_key,
        signed_prekey,
        one_time_prekeys
      FROM echo_e2ee_devices
      WHERE user_id = $1 AND revoked_at IS NULL
      ORDER BY protocol_device_id ASC
      `,
      [uid],
    );
    const out: EchoE2eePeerDeviceBundle[] = [];
    for (const row of r.rows) {
      const parsed = parsePeerBundleRow(row as Record<string, unknown>);
      if (!parsed) continue;
      if (parsed.remainingOtks) {
        await client.query(
          `
          UPDATE echo_e2ee_devices
          SET one_time_prekeys = $3::jsonb
          WHERE user_id = $1 AND device_id = $2 AND revoked_at IS NULL
          `,
          [uid, parsed.rowDeviceId, JSON.stringify(parsed.remainingOtks)],
        );
      }
      out.push(parsed.bundle);
    }
    await client.query('COMMIT');
    return out;
  } catch (e) {
    try {
      await client.query('ROLLBACK');
    } catch {
      /* ignore */
    }
    if (isPostgresUndefinedRelationError(e)) return [];
    throw e;
  } finally {
    client.release();
  }
}

/**
 * Primary peer bundle (lowest protocol_device_id) for backward compatibility.
 * Prefer {@link listEchoE2eePeerDeviceBundles} for multi-device sends.
 */
export async function getEchoE2eePeerDeviceBundle(
  pool: pg.Pool,
  targetUserId: string,
): Promise<EchoE2eePeerDeviceBundle | null> {
  const all = await listEchoE2eePeerDeviceBundles(pool, targetUserId);
  return all[0] ?? null;
}

const PAIRING_TTL_MS = 10 * 60 * 1000;

export async function createEchoE2eePairingSession(
  pool: pg.Pool,
  userId: string,
  pairingId: string,
): Promise<void> {
  const expiresAt = new Date(Date.now() + PAIRING_TTL_MS).toISOString();
  await pool.query(
    `
    INSERT INTO echo_e2ee_pairing_sessions (id, user_id, expires_at)
    VALUES ($1, $2, $3::timestamptz)
    `,
    [pairingId, userId, expiresAt],
  );
}

export type EchoE2eePairingPoll =
  | { status: 'pending' }
  | { status: 'ready'; ciphertext: string }
  | { status: 'consumed' }
  | { status: 'expired' }
  | { status: 'not_found' };

export async function getEchoE2eePairingStateForUser(
  pool: pg.Pool,
  userId: string,
  pairingId: string,
): Promise<EchoE2eePairingPoll> {
  const id = pairingId.trim();
  if (!id) return { status: 'not_found' };
  try {
    const r = await pool.query(
      `
      SELECT user_id, ciphertext, status, expires_at
      FROM echo_e2ee_pairing_sessions
      WHERE id = $1
      LIMIT 1
      `,
      [id],
    );
    const row = r.rows[0];
    if (!row) return { status: 'not_found' };
    if (String(row.user_id) !== userId) return { status: 'not_found' };
    const exp = new Date(row.expires_at as string | Date).getTime();
    if (Number.isFinite(exp) && Date.now() > exp) {
      return { status: 'expired' };
    }
    const st = String(row.status);
    if (st === 'consumed') return { status: 'consumed' };
    if (st === 'ready' && row.ciphertext) {
      await pool.query(
        `
        UPDATE echo_e2ee_pairing_sessions
        SET status = 'consumed'
        WHERE id = $1 AND user_id = $2 AND status = 'ready'
        `,
        [id, userId],
      );
      return { status: 'ready', ciphertext: String(row.ciphertext) };
    }
    return { status: 'pending' };
  } catch (e) {
    if (isPostgresUndefinedRelationError(e)) return { status: 'not_found' };
    throw e;
  }
}

export async function respondEchoE2eePairing(
  pool: pg.Pool,
  userId: string,
  pairingId: string,
  ciphertext: string,
): Promise<'ok' | 'not_found' | 'expired' | 'bad_body'> {
  const id = pairingId.trim();
  const ct = ciphertext.trim();
  if (!id || !ct) return 'bad_body';
  if (ct.length > 512_000) return 'bad_body';
  const r = await pool.query(
    `
    UPDATE echo_e2ee_pairing_sessions
    SET ciphertext = $3,
        status = 'ready'
    WHERE id = $1
      AND user_id = $2
      AND status = 'pending'
      AND expires_at > NOW()
    `,
    [id, userId, ct],
  );
  if (!r.rowCount) {
    const probe = await pool.query(
      `SELECT expires_at FROM echo_e2ee_pairing_sessions WHERE id = $1 AND user_id = $2 LIMIT 1`,
      [id, userId],
    );
    if (!probe.rowCount) return 'not_found';
    const exp = new Date(probe.rows[0].expires_at as string | Date).getTime();
    if (Number.isFinite(exp) && Date.now() > exp) return 'expired';
    return 'not_found';
  }
  return 'ok';
}

export async function refreshEchoE2eeOneTimePrekeys(
  pool: pg.Pool,
  userId: string,
  deviceId: string,
  oneTimePrekeys: unknown,
): Promise<'ok' | 'not_found'> {
  const did = deviceId.trim();
  if (!did) return 'not_found';
  const r = await pool.query(
    `
    UPDATE echo_e2ee_devices
    SET one_time_prekeys = COALESCE($3::jsonb, '[]'::jsonb)
    WHERE user_id = $1
      AND device_id = $2
      AND revoked_at IS NULL
    `,
    [userId, did, oneTimePrekeys ?? null],
  );
  return r.rowCount ? 'ok' : 'not_found';
}

export type EchoE2eeDeviceListRow = {
  deviceId: string;
  protocolDeviceId: number;
  createdAt: string;
  revokedAt: string | null;
};

export async function listEchoE2eeDevicesForUser(
  pool: pg.Pool,
  userId: string,
): Promise<EchoE2eeDeviceListRow[]> {
  try {
    const r = await pool.query(
      `
    SELECT device_id, protocol_device_id, created_at, revoked_at
    FROM echo_e2ee_devices
    WHERE user_id = $1
    ORDER BY created_at DESC
    `,
      [userId],
    );
    return r.rows.map((row) => ({
      deviceId: String(row.device_id),
      protocolDeviceId: Number(row.protocol_device_id) || 1,
      createdAt: new Date(row.created_at as string | Date).toISOString(),
      revokedAt: row.revoked_at
        ? new Date(row.revoked_at as string | Date).toISOString()
        : null,
    }));
  } catch (e) {
    if (isPostgresUndefinedRelationError(e)) return [];
    throw e;
  }
}

export async function revokeEchoE2eeDevice(
  pool: pg.Pool,
  userId: string,
  deviceId: string,
): Promise<'ok' | 'not_found'> {
  const did = deviceId.trim();
  if (!did) return 'not_found';
  const r = await pool.query(
    `
    UPDATE echo_e2ee_devices
    SET revoked_at = NOW()
    WHERE user_id = $1 AND device_id = $2 AND revoked_at IS NULL
    `,
    [userId, did],
  );
  return r.rowCount ? 'ok' : 'not_found';
}

export type EchoE2eeThreadState =
  | { enabled: false }
  | { enabled: true; mode: string; keyEpoch: number; enabledAt: string };

/** Chat thread E2EE was removed; voice uses device bundles + LiveKit instead. */
export async function getEchoE2eeThreadState(
  _pool: pg.Pool,
  _channelId: string,
): Promise<EchoE2eeThreadState> {
  return { enabled: false };
}

const E2EE_PEER_BUNDLE_FETCH_MAX_PER_DAY = 24;
const E2EE_PEER_BUNDLE_FETCH_WINDOW_MS = 24 * 60 * 60 * 1000;

async function echoUsersShareActiveVoiceSession(
  pool: pg.Pool,
  viewerId: string,
  targetId: string,
): Promise<boolean> {
  try {
    const r = await pool.query(
      `
      SELECT 1
      FROM echo_voice_participants p1
      INNER JOIN echo_voice_participants p2
        ON p1.server_id = p2.server_id AND p1.channel_id = p2.channel_id
      WHERE p1.user_id = $1 AND p2.user_id = $2
      LIMIT 1
      `,
      [viewerId, targetId],
    );
    return r.rows.length > 0;
  } catch (e) {
    if (isPostgresUndefinedRelationError(e)) return false;
    throw e;
  }
}

/** Device bundles for LibSignal voice key distribution (not chat). */
export async function echoUsersMayFetchE2eeDeviceBundle(
  pool: pg.Pool,
  viewerId: string,
  targetId: string,
): Promise<boolean> {
  const me = viewerId.trim();
  const target = targetId.trim();
  if (!me || !target || me === target) return false;
  if (await echoUsersShareDirectDm(pool, me, target)) return true;
  const r = await pool.query(
    `
    SELECT 1
    FROM echo_group_dm_members a
    INNER JOIN echo_group_dm_members b ON a.channel_id = b.channel_id
    WHERE a.user_id = $1 AND b.user_id = $2
    LIMIT 1
    `,
    [me, target],
  );
  if (r.rows.length > 0) return true;
  return echoUsersShareActiveVoiceSession(pool, me, target);
}

export async function assertEchoE2eePeerBundleFetchQuota(
  pool: pg.Pool,
  viewerId: string,
  targetId: string,
): Promise<'ok' | 'rate_limited' | 'infra_missing'> {
  const me = viewerId.trim();
  const target = targetId.trim();
  if (!me || !target) return 'rate_limited';
  const since = new Date(
    Date.now() - E2EE_PEER_BUNDLE_FETCH_WINDOW_MS,
  ).toISOString();
  try {
    const count = await pool.query(
      `
      SELECT COUNT(*)::int AS c
      FROM echo_e2ee_peer_bundle_fetches
      WHERE viewer_user_id = $1 AND target_user_id = $2 AND created_at > $3::timestamptz
      `,
      [me, target, since],
    );
    const n = Number(count.rows[0]?.c ?? 0);
    if (n >= E2EE_PEER_BUNDLE_FETCH_MAX_PER_DAY) return 'rate_limited';
    await pool.query(
      `
      INSERT INTO echo_e2ee_peer_bundle_fetches (viewer_user_id, target_user_id)
      VALUES ($1, $2)
      `,
      [me, target],
    );
    return 'ok';
  } catch (e) {
    if (isPostgresUndefinedRelationError(e)) return 'infra_missing';
    throw e;
  }
}

export async function isEchoE2eeThreadEnabled(
  pool: pg.Pool,
  channelId: string,
): Promise<boolean> {
  const cid = channelId.trim();
  if (!cid) return false;
  try {
    const r = await pool.query(
      `SELECT 1 FROM echo_e2ee_threads WHERE channel_id = $1 LIMIT 1`,
      [cid],
    );
    return r.rows.length > 0;
  } catch (e) {
    if (isPostgresUndefinedRelationError(e)) return false;
    throw e;
  }
}

export async function enableEchoE2eeForDmThread(
  pool: pg.Pool,
  channelId: string,
  userId: string,
  mode = 'e2ee_v1',
): Promise<
  | 'ok'
  | 'forbidden'
  | 'not_found'
  | 'already_enabled'
  | 'infra_missing'
  | 'group_not_supported'
> {
  const cid = channelId.trim();
  if (!cid) return 'not_found';
  const denial = await diagnoseEchoPostMessageDenial(pool, userId, cid);
  if (!denial.ok)
    return denial.reason === 'no_channel' ? 'not_found' : 'forbidden';
  if (await isEchoGroupDmChannel(pool, cid)) return 'group_not_supported';

  try {
    const existing = await pool.query(
      `SELECT 1 FROM echo_e2ee_threads WHERE channel_id = $1 LIMIT 1`,
      [cid],
    );
    if (existing.rows.length > 0) return 'already_enabled';

    await pool.query(
      `
    INSERT INTO echo_e2ee_threads (channel_id, mode, enabled_by_user_id)
    VALUES ($1, $2, $3)
    ON CONFLICT (channel_id) DO NOTHING
    `,
      [cid, mode, userId],
    );
    return 'ok';
  } catch (e) {
    if (isPostgresUndefinedRelationError(e)) return 'infra_missing';
    throw e;
  }
}
