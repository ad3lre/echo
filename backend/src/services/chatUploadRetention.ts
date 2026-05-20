import type pg from 'pg';
import type { MessageAttachmentPayload } from '../../../shared/types';
import {
  computeAbandonMs,
  isEchoChatUserMediaStorageKey,
  resolveChatUploadRetentionPolicy,
  type ChatUploadRetentionSourceType,
} from '../../../shared/chatMediaRetention';
import {
  normalizeEchoPlanId,
  type EchoPlanId,
} from '../../../shared/echoPlanLimits';
import { getEchoEntitlements } from '../domain/echoPlanEntitlements';
import { extractEchoStorageKeyFromPublicUrl } from './echoUploadPublicUrl';

export type ChatUploadRetentionRow = {
  storage_key: string;
  uploader_id: string | null;
  source_type: ChatUploadRetentionSourceType;
  byte_length: string | number;
  plan_snapshot: EchoPlanId;
  permanent: boolean;
  permanent_revoked_at: Date | null;
  timer_paused: boolean;
  abandon_ms: string | number | null;
  created_at: Date;
  last_seen_at: Date | null;
  expires_at: Date | null;
  purge_status: 'active' | 'purging' | 'purged' | 'failed';
  purged_at: Date | null;
  purge_error: string | null;
  purge_attempts: number;
};

const TOUCH_THROTTLE_INTERVAL = "INTERVAL '24 hours'";

function rowFromDb(r: Record<string, unknown>): ChatUploadRetentionRow {
  return {
    storage_key: String(r.storage_key),
    uploader_id:
      r.uploader_id == null || r.uploader_id === ''
        ? null
        : String(r.uploader_id),
    source_type: String(r.source_type) as ChatUploadRetentionSourceType,
    byte_length: r.byte_length as string | number,
    plan_snapshot: normalizeEchoPlanId(r.plan_snapshot),
    permanent: Boolean(r.permanent),
    permanent_revoked_at:
      r.permanent_revoked_at instanceof Date
        ? r.permanent_revoked_at
        : r.permanent_revoked_at
          ? new Date(String(r.permanent_revoked_at))
          : null,
    timer_paused: Boolean(r.timer_paused),
    abandon_ms:
      r.abandon_ms == null ? null : (r.abandon_ms as string | number),
    created_at:
      r.created_at instanceof Date
        ? r.created_at
        : new Date(String(r.created_at)),
    last_seen_at:
      r.last_seen_at == null
        ? null
        : r.last_seen_at instanceof Date
          ? r.last_seen_at
          : new Date(String(r.last_seen_at)),
    expires_at:
      r.expires_at == null
        ? null
        : r.expires_at instanceof Date
          ? r.expires_at
          : new Date(String(r.expires_at)),
    purge_status: String(r.purge_status) as ChatUploadRetentionRow['purge_status'],
    purged_at:
      r.purged_at == null
        ? null
        : r.purged_at instanceof Date
          ? r.purged_at
          : new Date(String(r.purged_at)),
    purge_error: r.purge_error == null ? null : String(r.purge_error),
    purge_attempts: Number(r.purge_attempts ?? 0),
  };
}

export function isChatUploadRetentionExpired(
  row: ChatUploadRetentionRow,
  now: Date = new Date(),
): boolean {
  if (row.purge_status === 'purged') return true;
  if (row.permanent || row.timer_paused) return false;
  if (row.expires_at == null) return false;
  return row.expires_at.getTime() < now.getTime();
}

async function resolvePlanSnapshot(
  pool: pg.Pool,
  uploaderId: string | null | undefined,
  sourceType: ChatUploadRetentionSourceType,
  planOverride?: EchoPlanId,
): Promise<EchoPlanId> {
  if (sourceType === 'webhook') return 'free';
  if (planOverride) return normalizeEchoPlanId(planOverride);
  const uid = uploaderId?.trim();
  if (!uid) return 'free';
  const ent = await getEchoEntitlements(pool, uid);
  return ent.plan;
}

export async function registerChatUploadRetention(
  pool: pg.Pool,
  opts: {
    storageKey: string;
    byteLength: number;
    sourceType: ChatUploadRetentionSourceType;
    uploaderId?: string | null;
    planSnapshot?: EchoPlanId;
  },
): Promise<void> {
  const storageKey = opts.storageKey.trim();
  if (!storageKey || !isEchoChatUserMediaStorageKey(storageKey)) return;
  if (
    !Number.isFinite(opts.byteLength) ||
    opts.byteLength < 1 ||
    opts.byteLength > Number.MAX_SAFE_INTEGER
  ) {
    return;
  }

  const planSnapshot = await resolvePlanSnapshot(
    pool,
    opts.uploaderId,
    opts.sourceType,
    opts.planSnapshot,
  );
  const policy = resolveChatUploadRetentionPolicy(
    Math.floor(opts.byteLength),
    planSnapshot,
    opts.sourceType,
  );
  const uploaderId = opts.uploaderId?.trim() || null;

  await pool.query(
    `
    INSERT INTO echo_chat_upload_retention (
      storage_key,
      uploader_id,
      source_type,
      byte_length,
      plan_snapshot,
      permanent,
      timer_paused,
      abandon_ms,
      last_seen_at,
      expires_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8,
      NULL,
      CASE
        WHEN $6 OR $7 THEN NULL
        ELSE NOW() + ($8::bigint * INTERVAL '1 millisecond')
      END
    )
    ON CONFLICT (storage_key) DO NOTHING
    `,
    [
      storageKey,
      uploaderId,
      opts.sourceType,
      Math.floor(opts.byteLength),
      planSnapshot,
      policy.permanent,
      policy.timerPaused,
      policy.abandonMs,
    ],
  );
}

export async function getChatUploadRetentionByStorageKey(
  pool: pg.Pool,
  storageKey: string,
): Promise<ChatUploadRetentionRow | null> {
  const key = storageKey.trim();
  if (!key) return null;
  const r = await pool.query(
    `SELECT * FROM echo_chat_upload_retention WHERE storage_key = $1 LIMIT 1`,
    [key],
  );
  const row = r.rows[0];
  if (!row) return null;
  return rowFromDb(row as Record<string, unknown>);
}

export async function touchChatUploadRetention(
  pool: pg.Pool,
  storageKey: string,
): Promise<void> {
  const key = storageKey.trim();
  if (!key || !isEchoChatUserMediaStorageKey(key)) return;

  await pool.query(
    `
    UPDATE echo_chat_upload_retention
    SET
      last_seen_at = NOW(),
      expires_at = NOW() + (abandon_ms::bigint * INTERVAL '1 millisecond')
    WHERE storage_key = $1
      AND purge_status = 'active'
      AND NOT permanent
      AND NOT timer_paused
      AND abandon_ms IS NOT NULL
      AND (
        last_seen_at IS NULL
        OR last_seen_at < NOW() - ${TOUCH_THROTTLE_INTERVAL}
      )
    `,
    [key],
  );
}

export async function revokePermanentChatUploadRetention(
  pool: pg.Pool,
  storageKey: string,
): Promise<boolean> {
  const key = storageKey.trim();
  if (!key) return false;

  const existing = await getChatUploadRetentionByStorageKey(pool, key);
  if (!existing?.permanent || existing.permanent_revoked_at) return false;

  const byteLength = Number(existing.byte_length);
  const abandonMs = computeAbandonMs(byteLength, existing.plan_snapshot, {
    revokedPermanent: true,
  });

  const r = await pool.query(
    `
    UPDATE echo_chat_upload_retention
    SET
      permanent = false,
      permanent_revoked_at = NOW(),
      abandon_ms = $2,
      expires_at = COALESCE(last_seen_at, created_at)
        + ($2::bigint * INTERVAL '1 millisecond')
    WHERE storage_key = $1
      AND permanent = true
      AND permanent_revoked_at IS NULL
      AND purge_status = 'active'
    RETURNING storage_key
    `,
    [key, abandonMs],
  );
  return r.rowCount != null && r.rowCount > 0;
}

export async function unpauseBlackChatUploadRetentionForUser(
  pool: pg.Pool,
  userId: string,
): Promise<number> {
  const uid = userId.trim();
  if (!uid) return 0;

  const rows = await pool.query<{ storage_key: string; byte_length: string }>(
    `
    SELECT storage_key, byte_length
    FROM echo_chat_upload_retention
    WHERE uploader_id = $1
      AND timer_paused = true
      AND purge_status = 'active'
    `,
    [uid],
  );

  let updated = 0;
  for (const row of rows.rows) {
    const byteLength = Number(row.byte_length);
    const abandonMs = computeAbandonMs(byteLength, 'black', {
      blackUnpaused: true,
    });
    const r = await pool.query(
      `
      UPDATE echo_chat_upload_retention
      SET
        timer_paused = false,
        abandon_ms = $2,
        expires_at = COALESCE(last_seen_at, created_at)
          + ($2::bigint * INTERVAL '1 millisecond')
      WHERE storage_key = $1
        AND timer_paused = true
        AND purge_status = 'active'
      `,
      [row.storage_key, abandonMs],
    );
    updated += r.rowCount ?? 0;
  }
  return updated;
}

export async function reconcileChatUploadRetentionOnPlanChange(
  pool: pg.Pool,
  userId: string,
  oldPlan: EchoPlanId,
  newPlan: EchoPlanId,
): Promise<void> {
  const oldP = normalizeEchoPlanId(oldPlan);
  const newP = normalizeEchoPlanId(newPlan);
  if (oldP === 'black' && newP !== 'black') {
    await unpauseBlackChatUploadRetentionForUser(pool, userId);
  }
}

export async function claimChatUploadRetentionPurgeBatch(
  pool: pg.Pool,
  limit: number,
): Promise<string[]> {
  const n = Math.max(1, Math.min(500, Math.floor(limit)));
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const r = await client.query<{ storage_key: string }>(
      `
      SELECT storage_key
      FROM echo_chat_upload_retention
      WHERE purge_status IN ('active', 'failed')
        AND expires_at IS NOT NULL
        AND expires_at < NOW()
      ORDER BY expires_at
      LIMIT $1
      FOR UPDATE SKIP LOCKED
      `,
      [n],
    );
    const keys = r.rows.map((row) => String(row.storage_key));
    if (keys.length > 0) {
      await client.query(
        `
        UPDATE echo_chat_upload_retention
        SET purge_status = 'purging', purge_attempts = purge_attempts + 1
        WHERE storage_key = ANY($1::text[])
        `,
        [keys],
      );
    }
    await client.query('COMMIT');
    return keys;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

export async function markChatUploadRetentionPurged(
  pool: pg.Pool,
  storageKey: string,
): Promise<void> {
  await pool.query(
    `
    UPDATE echo_chat_upload_retention
    SET purge_status = 'purged', purged_at = NOW(), purge_error = NULL
    WHERE storage_key = $1
    `,
    [storageKey.trim()],
  );
}

export async function markChatUploadRetentionPurgeFailed(
  pool: pg.Pool,
  storageKey: string,
  errorMessage: string,
): Promise<void> {
  const msg = errorMessage.slice(0, 2000);
  await pool.query(
    `
    UPDATE echo_chat_upload_retention
    SET purge_status = 'failed', purge_error = $2
    WHERE storage_key = $1
    `,
    [storageKey.trim(), msg],
  );
}

export async function registerChatUploadRetentionFromMessageUrls(
  pool: pg.Pool,
  opts: {
    uploaderId: string;
    attachments?: MessageAttachmentPayload[];
    imageUrl?: string;
    videoUrl?: string;
    sourceType?: ChatUploadRetentionSourceType;
  },
): Promise<void> {
  const sourceType = opts.sourceType ?? 'user';
  const keys = new Map<string, number>();

  const addKey = (storageKey: string | null | undefined, fileSize?: number) => {
    if (!storageKey?.trim() || !isEchoChatUserMediaStorageKey(storageKey)) {
      return;
    }
    const k = storageKey.trim();
    const size =
      typeof fileSize === 'number' && Number.isFinite(fileSize) && fileSize > 0
        ? fileSize
        : keys.get(k) ?? 1;
    keys.set(k, size);
  };

  for (const att of opts.attachments ?? []) {
    const sk =
      typeof att.storageKey === 'string' ? att.storageKey.trim() : '';
    if (sk) {
      addKey(sk, att.fileSize);
    } else {
      const url = typeof att.url === 'string' ? att.url.trim() : '';
      if (url) addKey(extractEchoStorageKeyFromPublicUrl(url), att.fileSize);
    }
  }
  if (opts.imageUrl?.trim()) {
    addKey(extractEchoStorageKeyFromPublicUrl(opts.imageUrl.trim()));
  }
  if (opts.videoUrl?.trim()) {
    addKey(extractEchoStorageKeyFromPublicUrl(opts.videoUrl.trim()));
  }

  for (const [storageKey, byteLength] of keys) {
    await registerChatUploadRetention(pool, {
      storageKey,
      byteLength,
      sourceType,
      uploaderId: opts.uploaderId,
    });
  }
}
