import path from 'path';
import type pg from 'pg';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { config } from '../config';
import { isDiscordHostedImportMediaUrl } from '../domain/discordCdnUrls';
import {
  parseDiscordAvatarHashFromCdnUrl,
  resolveDiscordAvatarForStorage,
} from '../domain/discordNormalized';
import { nextEchoSnowflakeId } from '../domain/echoSnowflake';
import { writeLocalEchoUploadFile } from './localUploadDisk';
import { resolveEchoUploadStorageKey } from './echoUploadResolveDest';
import { extractEchoStorageKeyFromPublicUrl } from './echoUploadPublicUrl';
import {
  buildEchoUploadPublicUrlForStorageKey,
  createEchoS3UploadClient,
  getEchoS3UploadBucket,
  isAllowedBrandingUploadContentType,
  isEchoS3UploadConfigured,
} from './s3UploadPresign';

const AVATAR_MAX_BYTES = 8 * 1024 * 1024;

function extForContentType(ct: string): string {
  const t = ct.toLowerCase();
  if (t === 'image/png') return '.png';
  if (t === 'image/jpeg') return '.jpg';
  if (t === 'image/gif') return '.gif';
  if (t === 'image/webp') return '.webp';
  return '';
}

function guessContentTypeFromUrl(url: string): string | null {
  try {
    const ext = path.extname(new URL(url).pathname).toLowerCase();
    const map: Record<string, string> = {
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
    };
    const ct = map[ext];
    return ct && isAllowedBrandingUploadContentType(ct) ? ct : null;
  } catch {
    return null;
  }
}

async function fetchDiscordAvatarBytes(
  url: string,
): Promise<{ buf: Buffer; contentType: string } | null> {
  if (!isDiscordHostedImportMediaUrl(url)) return null;
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'EchoDiscordImportAvatar/1.0' },
      signal: AbortSignal.timeout(60_000),
      redirect: 'error',
    });
    if (!res.ok) return null;
    const headerCt =
      res.headers.get('content-type')?.split(';')[0]?.trim() ?? '';
    const cl = res.headers.get('content-length');
    if (cl) {
      const n = Number(cl);
      if (Number.isFinite(n) && n > AVATAR_MAX_BYTES) return null;
    }
    const ab = await res.arrayBuffer();
    if (ab.byteLength > AVATAR_MAX_BYTES) return null;
    let contentType = headerCt;
    if (!isAllowedBrandingUploadContentType(contentType)) {
      contentType = guessContentTypeFromUrl(url) ?? contentType;
    }
    if (!isAllowedBrandingUploadContentType(contentType)) return null;
    return { buf: Buffer.from(ab), contentType };
  } catch {
    return null;
  }
}

/** True when `url` is already persisted on Echo uploads (not a Discord avatar CDN URL). */
export function isEchoStoredProfileImageUrl(url: string): boolean {
  const t = url.trim();
  if (!t || t.startsWith('data:')) return !!t.startsWith('data:');
  if (extractEchoStorageKeyFromPublicUrl(t)) return true;
  return false;
}

/** True for Discord avatar CDN paths (`/avatars/` or default `/embed/avatars/`). */
export function isDiscordAvatarCdnUrl(url: string): boolean {
  if (!isDiscordHostedImportMediaUrl(url)) return false;
  try {
    const p = new URL(url.trim()).pathname;
    return p.includes('/avatars/') || p.includes('/embed/avatars/');
  } catch {
    return false;
  }
}

/**
 * Discord avatar hash previously stored on a shadow row (`avatar_url`) or legacy CDN URL.
 */
export function resolveStoredDiscordAvatarHash(
  discordUserId: string,
  storedAvatarMeta: string,
  storedPfp: string,
): string {
  const meta = storedAvatarMeta.trim();
  if (meta && !/^https?:\/\//i.test(meta)) return meta;
  if (meta) {
    const fromMeta = parseDiscordAvatarHashFromCdnUrl(discordUserId, meta);
    if (fromMeta) return fromMeta;
  }
  const pf = storedPfp.trim();
  if (pf) {
    const fromPfp = parseDiscordAvatarHashFromCdnUrl(discordUserId, pf);
    if (fromPfp) return fromPfp;
  }
  return '';
}

function avatarHashFromInput(
  discordUserId: string,
  avatar: string | null | undefined,
): string {
  const raw = typeof avatar === 'string' ? avatar.trim() : '';
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) {
    return parseDiscordAvatarHashFromCdnUrl(discordUserId, raw) ?? '';
  }
  return raw;
}

async function storeAvatarBuffer(opts: {
  pool: pg.Pool | null;
  targetUserId: string;
  buf: Buffer;
  contentType: string;
  filenameExt: string;
}): Promise<string> {
  const { pool, targetUserId, buf, contentType, filenameExt } = opts;
  const supportsDirectStorage =
    !!pool && (!!config.echoLocalUploadDir || isEchoS3UploadConfigured());

  if (!supportsDirectStorage) {
    return `data:${contentType};base64,${buf.toString('base64')}`;
  }

  const objectKey = `discord-import-avatar-${nextEchoSnowflakeId()}${filenameExt}`;
  const dest = await resolveEchoUploadStorageKey(pool!, targetUserId, {
    purpose: 'user_avatar',
    contentType,
    objectKey,
  });
  if (!dest.ok) {
    return `data:${contentType};base64,${buf.toString('base64')}`;
  }

  if (config.echoLocalUploadDir) {
    await writeLocalEchoUploadFile(dest.storageKey, buf);
    await pool!.query(
      `INSERT INTO echo_upload_served_content_type (storage_key, content_type)
       VALUES ($1, $2)
       ON CONFLICT (storage_key) DO UPDATE SET content_type = EXCLUDED.content_type`,
      [dest.storageKey, contentType],
    );
  } else {
    const client = createEchoS3UploadClient();
    const bucket = getEchoS3UploadBucket();
    if (!client || !bucket) {
      return `data:${contentType};base64,${buf.toString('base64')}`;
    }
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: dest.storageKey,
        Body: buf,
        ContentType: contentType,
      }),
    );
  }

  return buildEchoUploadPublicUrlForStorageKey(dest.storageKey) ?? '';
}

/**
 * Download a Discord avatar (custom or default) into Echo storage. Never returns a Discord CDN URL.
 */
export async function mirrorDiscordImportAvatarToEcho(
  pool: pg.Pool | null,
  targetUserId: string,
  discordUserId: string,
  avatar: string | null | undefined,
): Promise<string> {
  const id = String(discordUserId).trim();
  const uid = String(targetUserId).trim();
  if (!id || !uid) return '';

  const rawAvatar = typeof avatar === 'string' ? avatar.trim() : '';
  if (rawAvatar && isEchoStoredProfileImageUrl(rawAvatar)) {
    return rawAvatar;
  }

  const cdnUrl = resolveDiscordAvatarForStorage(id, avatar ?? null);
  if (!cdnUrl) return '';

  const fetched = await fetchDiscordAvatarBytes(cdnUrl);
  if (!fetched) return '';

  const ext =
    path.extname(new URL(cdnUrl).pathname) ||
    extForContentType(fetched.contentType) ||
    '.webp';

  return storeAvatarBuffer({
    pool,
    targetUserId: uid,
    buf: fetched.buf,
    contentType: fetched.contentType,
    filenameExt: ext,
  });
}

/** Re-host legacy Discord CDN / hash-only pfps into Echo storage when possible. */
export async function ensureDiscordImportAvatarStoredInEcho(
  pool: pg.Pool | null,
  targetUserId: string,
  discordUserId: string,
  storedPfp: string,
  storedAvatarMeta?: string,
): Promise<string> {
  const raw = storedPfp.trim();
  if (raw && isEchoStoredProfileImageUrl(raw)) return raw;

  const hash = storedAvatarMeta?.trim()
    ? resolveStoredDiscordAvatarHash(discordUserId, storedAvatarMeta, storedPfp)
    : resolveStoredDiscordAvatarHash(discordUserId, '', storedPfp);

  if (raw && !isDiscordAvatarCdnUrl(raw) && hash) {
    return mirrorDiscordImportAvatarToEcho(
      pool,
      targetUserId,
      discordUserId,
      hash,
    );
  }

  if (raw && isDiscordAvatarCdnUrl(raw)) {
    return mirrorDiscordImportAvatarToEcho(
      pool,
      targetUserId,
      discordUserId,
      raw,
    );
  }

  if (!raw) {
    return mirrorDiscordImportAvatarToEcho(
      pool,
      targetUserId,
      discordUserId,
      null,
    );
  }

  return raw;
}

/** True when `pfp` is a Discord CDN URL or bare avatar hash that should be re-hosted on Echo. */
export function isCorruptedDiscordImportPfp(pfp: string): boolean {
  const t = pfp.trim();
  if (!t) return false;
  if (isEchoStoredProfileImageUrl(t)) return false;
  if (isDiscordAvatarCdnUrl(t)) return true;
  if (/^https?:\/\//i.test(t) || t.startsWith('data:')) return false;
  return /^a_[0-9a-fA-Z_]{10,}$/.test(t) || /^[0-9a-f]{16,32}$/i.test(t);
}

export { avatarHashFromInput };
