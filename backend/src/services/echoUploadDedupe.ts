import type pg from 'pg';

/** ~95% bit agreement on 64-bit average hash (floor((1-0.95)*64) = 3). */
export const ECHO_UPLOAD_DEDUPE_MAX_PHASH_HAMMING = 3;

/** Client fast-path for chat video: SHA-256 only; skip perceptual dedupe scan. */
export const ECHO_VIDEO_DEDUPE_PHASH_FAST_PATH = '0000000000000000';

const RECENT_SCAN_LIMIT = 2500;

function hammingPopcount64(a: bigint, b: bigint): number {
  let v = a ^ b;
  let c = 0;
  while (v > 0n) {
    c += Number(v & 1n);
    v >>= 1n;
  }
  return c;
}

function normalizeHex64(s: string): string | null {
  const t = s.trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(t)) return null;
  return t;
}

function normalizePhash16(s: string): string | null {
  const t = s.trim().toLowerCase();
  if (!/^[0-9a-f]{16}$/.test(t)) return null;
  return t;
}

export async function findEchoUploadDedupeMatch(
  pool: pg.Pool,
  opts: {
    kind: 'image' | 'video';
    sha256Hex: string;
    phashHex: string;
    uploaderId: string;
    storageKeyPrefix?: string;
  },
): Promise<string | null> {
  const sha = normalizeHex64(opts.sha256Hex);
  const ph = normalizePhash16(opts.phashHex);
  if (!sha || !ph) return null;

  const uploaderId = opts.uploaderId.trim();
  const storageKeyPrefix = opts.storageKeyPrefix?.trim() ?? '';
  const exact = storageKeyPrefix
    ? await pool.query<{ public_url: string }>(
        `SELECT public_url
         FROM echo_upload_dedupe
         WHERE sha256_hex = $1
           AND storage_key LIKE ($2 || '%')
           AND uploader_id = $3
         LIMIT 1`,
        [sha, storageKeyPrefix, uploaderId],
      )
    : await pool.query<{ public_url: string }>(
        `SELECT public_url FROM echo_upload_dedupe WHERE sha256_hex = $1 AND uploader_id = $2 LIMIT 1`,
        [sha, uploaderId],
      );
  if (exact.rows.length > 0) {
    return String(exact.rows[0].public_url);
  }

  if (opts.kind === 'video' && ph === ECHO_VIDEO_DEDUPE_PHASH_FAST_PATH) {
    return null;
  }

  const phashBig = BigInt(`0x${ph}`);
  const recent = storageKeyPrefix
    ? await pool.query<{ public_url: string; phash_hex: string }>(
        `SELECT public_url, phash_hex
         FROM echo_upload_dedupe
         WHERE kind = $1
           AND storage_key LIKE ($2 || '%')
           AND uploader_id = $3
         ORDER BY created_at DESC
         LIMIT $4`,
        [opts.kind, storageKeyPrefix, uploaderId, RECENT_SCAN_LIMIT],
      )
    : await pool.query<{ public_url: string; phash_hex: string }>(
        `SELECT public_url, phash_hex
         FROM echo_upload_dedupe
         WHERE kind = $1
           AND uploader_id = $2
         ORDER BY created_at DESC
         LIMIT $3`,
        [opts.kind, uploaderId, RECENT_SCAN_LIMIT],
      );

  for (const row of recent.rows) {
    const stored = normalizePhash16(String(row.phash_hex));
    if (!stored) continue;
    const dist = hammingPopcount64(phashBig, BigInt(`0x${stored}`));
    if (dist <= ECHO_UPLOAD_DEDUPE_MAX_PHASH_HAMMING) {
      return String(row.public_url);
    }
  }

  return null;
}

export async function registerEchoUploadDedupe(
  pool: pg.Pool,
  opts: {
    kind: 'image' | 'video';
    sha256Hex: string;
    phashHex: string;
    byteLength: number;
    publicUrl: string;
    storageKey: string;
    uploaderId: string;
  },
): Promise<void> {
  const sha = normalizeHex64(opts.sha256Hex);
  const ph = normalizePhash16(opts.phashHex);
  if (!sha || !ph) return;
  if (
    !Number.isFinite(opts.byteLength) ||
    opts.byteLength < 1 ||
    opts.byteLength > Number.MAX_SAFE_INTEGER
  ) {
    return;
  }
  const url = opts.publicUrl.trim();
  const key = opts.storageKey.trim();
  const uploader = opts.uploaderId.trim();
  if (!url || !key) return;

  await pool.query(
    `INSERT INTO echo_upload_dedupe (
       sha256_hex, kind, phash_hex, byte_length, public_url, storage_key, uploader_id
     ) VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (sha256_hex) DO NOTHING`,
    [sha, opts.kind, ph, Math.floor(opts.byteLength), url, key, uploader],
  );
}
