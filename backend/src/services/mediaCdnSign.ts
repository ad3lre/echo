import type { FastifyRequest } from 'fastify';
import { config } from '../config';
import {
  buildMediaCdnObjectUrl,
  isEchoPublicMediaCdnStorageKey,
  type MediaCdnReadScope,
} from '../../../shared/mediaCdn';
import { signMediaCdnReadToken } from '../../../shared/mediaCdnSigning';
import { extractStorageKeyFromEchoMediaUrl } from './echoEmojiAsset';
import {
  getChatUploadRetentionByStorageKey,
  isChatUploadRetentionExpired,
} from './chatUploadRetention';
import { isEchoChatUserMediaStorageKey } from '../../../shared/chatMediaRetention';
import { canUserReadLocalUploadStorageKey } from './echoUploadReadAccess';
import { getPgPool } from '../db/pg';

export const MEDIA_CDN_SIGN_BATCH_MAX = 20;

export type MediaCdnSignItem = {
  storageKey?: string;
  publicUrl?: string;
  scope?: MediaCdnReadScope;
};

export type MediaCdnSignedUrl = {
  storageKey: string;
  url: string;
  expiresAt: number;
  scope: MediaCdnReadScope;
};

export function isEchoMediaCdnConfigured(): boolean {
  return !!(
    config.echoMediaCdnEnabled &&
    config.echoMediaCdnBaseUrl?.trim() &&
    config.echoMediaCdnSigningSecret.trim()
  );
}

function resolveSignItemStorageKey(item: MediaCdnSignItem): string | null {
  const direct =
    typeof item.storageKey === 'string' ? item.storageKey.trim() : '';
  if (direct) return direct;
  const publicUrl =
    typeof item.publicUrl === 'string' ? item.publicUrl.trim() : '';
  if (!publicUrl) return null;
  return extractStorageKeyFromEchoMediaUrl(publicUrl) ?? null;
}

async function assertChatUploadNotRetentionExpired(
  storageKey: string,
): Promise<boolean> {
  if (!isEchoChatUserMediaStorageKey(storageKey)) return true;
  const pool = getPgPool();
  if (!pool) return true;
  const row = await getChatUploadRetentionByStorageKey(pool, storageKey);
  if (!row || !isChatUploadRetentionExpired(row)) return true;
  return false;
}

export async function signMediaCdnUrlsForRequest(
  req: FastifyRequest,
  items: MediaCdnSignItem[],
): Promise<
  | { ok: true; urls: MediaCdnSignedUrl[] }
  | { ok: false; status: number; code: string; message: string }
> {
  if (!isEchoMediaCdnConfigured()) {
    return {
      ok: false,
      status: 503,
      code: 'MEDIA_CDN_NOT_CONFIGURED',
      message: 'Media CDN is not enabled',
    };
  }
  if (!Array.isArray(items) || items.length < 1) {
    return {
      ok: false,
      status: 400,
      code: 'INVALID_BODY',
      message: 'items array required',
    };
  }
  if (items.length > MEDIA_CDN_SIGN_BATCH_MAX) {
    return {
      ok: false,
      status: 400,
      code: 'INVALID_BODY',
      message: `At most ${MEDIA_CDN_SIGN_BATCH_MAX} items per request`,
    };
  }

  const base = config.echoMediaCdnBaseUrl!.trim();
  const secret = config.echoMediaCdnSigningSecret.trim();
  const out: MediaCdnSignedUrl[] = [];

  for (const item of items) {
    const storageKey = resolveSignItemStorageKey(item);
    if (!storageKey) {
      return {
        ok: false,
        status: 400,
        code: 'INVALID_BODY',
        message: 'Each item needs storageKey or publicUrl',
      };
    }
    const scope: MediaCdnReadScope =
      item.scope === 'prefix' ? 'prefix' : 'object';
    const isPublic = isEchoPublicMediaCdnStorageKey(storageKey);
    if (!isPublic) {
      const allowed = await canUserReadLocalUploadStorageKey(req, storageKey);
      if (!allowed) {
        return {
          ok: false,
          status: 403,
          code: 'FORBIDDEN',
          message: 'Not allowed to read this upload',
        };
      }
    }
    if (!(await assertChatUploadNotRetentionExpired(storageKey))) {
      return {
        ok: false,
        status: 404,
        code: 'NOT_FOUND',
        message: 'Upload retention expired',
      };
    }
    const ttlMs = isPublic
      ? config.echoMediaCdnPublicReadTtlMs
      : config.echoMediaCdnPrivateReadTtlMs;
    const token = signMediaCdnReadToken(secret, storageKey, {
      ttlMs,
      scope,
      ...(isPublic ? { aud: 'public' as const } : {}),
    });
    const expiresAt = Date.now() + ttlMs;
    out.push({
      storageKey,
      url: buildMediaCdnObjectUrl(base, storageKey, token),
      expiresAt,
      scope,
    });
  }

  return { ok: true, urls: out };
}
