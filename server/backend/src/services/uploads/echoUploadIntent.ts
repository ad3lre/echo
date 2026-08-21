import type pg from 'pg';

/** Matches presigned upload URL TTL (15 minutes). */
export const ECHO_UPLOAD_INTENT_TTL_MS = 15 * 60 * 1000;

export type EchoUploadIntentRow = {
  storage_key: string;
  uploader_id: string;
  channel_id: string | null;
  server_id: string | null;
  purpose: string | null;
  content_type: string;
  declared_byte_length: string;
  status: 'pending' | 'registered' | 'expired';
  created_at: Date;
  expires_at: Date;
  registered_at: Date | null;
};

export async function insertEchoUploadIntent(
  pool: pg.Pool,
  opts: {
    storageKey: string;
    uploaderId: string;
    channelId?: string;
    serverId?: string;
    purpose?: string;
    contentType: string;
    declaredByteLength: number;
  },
): Promise<void> {
  const expiresAt = new Date(Date.now() + ECHO_UPLOAD_INTENT_TTL_MS);
  await pool.query(
    `INSERT INTO echo_upload_intent (
       storage_key, uploader_id, channel_id, server_id, purpose,
       content_type, declared_byte_length, status, expires_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', $8)
     ON CONFLICT (storage_key) DO UPDATE SET
       uploader_id = EXCLUDED.uploader_id,
       content_type = EXCLUDED.content_type,
       declared_byte_length = EXCLUDED.declared_byte_length,
       status = 'pending',
       expires_at = EXCLUDED.expires_at,
       registered_at = NULL`,
    [
      opts.storageKey.trim(),
      opts.uploaderId.trim(),
      opts.channelId?.trim() || null,
      opts.serverId?.trim() || null,
      opts.purpose?.trim() || null,
      opts.contentType.trim(),
      Math.floor(opts.declaredByteLength),
      expiresAt,
    ],
  );
}

export async function getEchoUploadIntent(
  pool: pg.Pool,
  storageKey: string,
): Promise<EchoUploadIntentRow | null> {
  const r = await pool.query<EchoUploadIntentRow>(
    `SELECT storage_key, uploader_id, channel_id, server_id, purpose,
            content_type, declared_byte_length::text, status, created_at, expires_at, registered_at
     FROM echo_upload_intent WHERE storage_key = $1`,
    [storageKey.trim()],
  );
  return r.rows[0] ?? null;
}

export async function markEchoUploadIntentRegistered(
  pool: pg.Pool,
  storageKey: string,
  actualByteLength: number,
): Promise<void> {
  await pool.query(
    `UPDATE echo_upload_intent
     SET status = 'registered', registered_at = NOW()
     WHERE storage_key = $1 AND status IN ('pending', 'registered')`,
    [storageKey.trim()],
  );
  await pool.query(
    `UPDATE echo_upload_intent
     SET declared_byte_length = $2
     WHERE storage_key = $1 AND status = 'registered'`,
    [storageKey.trim(), Math.floor(actualByteLength)],
  );
}

/** True when chat media storage keys may be attached to messages. */
export async function isEchoChatUploadAttachmentRegistered(
  pool: pg.Pool,
  storageKey: string,
  userId: string,
): Promise<boolean> {
  const key = storageKey.trim();
  const uid = userId.trim();
  if (!key || !uid) return false;
  if (key.startsWith('echo/webhook-inbound/')) return true;

  const intent = await getEchoUploadIntent(pool, key);
  if (intent?.status === 'registered' && intent.uploader_id === uid) {
    return true;
  }

  const dedupe = await pool.query(
    `SELECT 1 FROM echo_upload_dedupe WHERE storage_key = $1 AND uploader_id = $2 LIMIT 1`,
    [key, uid],
  );
  if ((dedupe.rowCount ?? 0) > 0) return true;

  const retention = await pool.query(
    `SELECT 1 FROM echo_chat_upload_retention WHERE storage_key = $1 AND uploader_id = $2 LIMIT 1`,
    [key, uid],
  );
  return (retention.rowCount ?? 0) > 0;
}

export type UploadIntentRegisterGateResult =
  | { ok: true; declaredByteLength: number; contentType: string }
  | {
      ok: false;
      code:
        | 'INTENT_NOT_FOUND'
        | 'INTENT_EXPIRED'
        | 'INTENT_OWNER'
        | 'BYTE_LENGTH_MISMATCH'
        | 'CONTENT_TYPE_MISMATCH';
    };

export async function requireEchoUploadIntentForRegister(
  pool: pg.Pool,
  opts: {
    storageKey: string;
    uploaderId: string;
    clientByteLength: number;
    contentType: string;
  },
): Promise<UploadIntentRegisterGateResult> {
  const intent = await getEchoUploadIntent(pool, opts.storageKey);
  if (!intent) {
    return { ok: false, code: 'INTENT_NOT_FOUND' };
  }
  if (intent.uploader_id !== opts.uploaderId.trim()) {
    return { ok: false, code: 'INTENT_OWNER' };
  }
  if (intent.status === 'expired') {
    return { ok: false, code: 'INTENT_EXPIRED' };
  }
  if (intent.status === 'pending' && new Date() > intent.expires_at) {
    await pool.query(
      `UPDATE echo_upload_intent SET status = 'expired' WHERE storage_key = $1 AND status = 'pending'`,
      [opts.storageKey.trim()],
    );
    return { ok: false, code: 'INTENT_EXPIRED' };
  }
  const declared = Number(intent.declared_byte_length);
  if (
    !Number.isFinite(declared) ||
    declared < 1 ||
    opts.clientByteLength !== declared
  ) {
    return { ok: false, code: 'BYTE_LENGTH_MISMATCH' };
  }
  const intentType = intent.content_type.trim().toLowerCase();
  const clientType = opts.contentType.trim().toLowerCase();
  if (!intentType || intentType !== clientType) {
    return { ok: false, code: 'CONTENT_TYPE_MISMATCH' };
  }
  return {
    ok: true,
    declaredByteLength: declared,
    contentType: intent.content_type,
  };
}
