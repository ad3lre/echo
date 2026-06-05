import type pg from 'pg';
import { ECHO_MSG_NOT_SERVER_MEMBER } from '../api/errors';
import {
  canUserPostMessage,
  isMemberOfServer,
  isEchoServerOwner,
} from '../domain/echoPermissions';
import { getPaperCapabilitiesForUser } from '../domain/echoStore/access';
import { getUserCommunicationTimeoutState } from '../domain/echoStore';
import { hasServerPermission } from '../domain/echoPolicy';
import { isUserBannedFromServer } from '../domain/echoStore/access';
import { canManageServerEmojis } from '../domain/echoStore/emojiLibrary';
import { getEchoServerApplicationSettings } from '../domain/echoStore/serverApplications';
import {
  isAllowedBrandingUploadContentType,
  isAllowedChatUploadContentType,
  isAllowedEmojiUploadContentType,
  isAllowedRingtoneUploadContentType,
} from './s3UploadPresign';
import { sanitizeEchoUploadObjectKeyFragment } from './echoUploadKeyUtils';

export type EchoUploadPurpose =
  | 'channel_media'
  | 'legacy_server'
  | 'server_emoji'
  | 'user_avatar'
  | 'user_banner'
  | 'server_icon'
  | 'server_banner'
  | 'server_event_cover'
  | 'server_application_attachment'
  | 'bug_report'
  | 'user_ringtone';

export type EchoUploadDestInput = {
  channelId?: string;
  serverId?: string;
  purpose?: EchoUploadPurpose;
  contentType: string;
  objectKey: string;
};

export type EchoUploadDestError = {
  status: number;
  code: string;
  message: string;
  detail?: string;
};

export type EchoUploadDestResult =
  | { ok: true; storageKey: string }
  | { ok: false; error: EchoUploadDestError };

/**
 * Resolves the storage key for an Echo upload and enforces the same RBAC rules as `/uploads/presign`.
 */
export async function resolveEchoUploadStorageKey(
  pool: pg.Pool,
  userId: string,
  input: EchoUploadDestInput,
): Promise<EchoUploadDestResult> {
  const objectKey = sanitizeEchoUploadObjectKeyFragment(input.objectKey);
  if (!objectKey) {
    return {
      ok: false,
      error: {
        status: 400,
        code: 'INVALID_BODY',
        message: 'key required (safe filename or path fragment)',
      },
    };
  }

  const channelId =
    typeof input.channelId === 'string' ? input.channelId.trim() : '';
  const serverId =
    typeof input.serverId === 'string' ? input.serverId.trim() : '';
  const purpose = input.purpose;
  const contentType = input.contentType.trim() || 'application/octet-stream';

  let storageKey: string;

  const isUserBranding = purpose === 'user_avatar' || purpose === 'user_banner';
  const isServerBranding =
    purpose === 'server_icon' || purpose === 'server_banner';
  const isBugReport = purpose === 'bug_report';
  const isUserRingtone = purpose === 'user_ringtone';

  if (isUserRingtone) {
    if (channelId || serverId) {
      return {
        ok: false,
        error: {
          status: 400,
          code: 'INVALID_BODY',
          message:
            'user_ringtone presign must not include channelId or serverId',
        },
      };
    }
    if (!isAllowedRingtoneUploadContentType(contentType)) {
      return {
        ok: false,
        error: {
          status: 400,
          code: 'INVALID_BODY',
          message: 'Unsupported content type for ringtone upload',
        },
      };
    }
    storageKey = `echo/ringtones/${userId}/${objectKey}`;
  } else if (isBugReport) {
    if (channelId || serverId) {
      return {
        ok: false,
        error: {
          status: 400,
          code: 'INVALID_BODY',
          message: 'bug_report presign must not include channelId or serverId',
        },
      };
    }
    if (!isAllowedBrandingUploadContentType(contentType)) {
      return {
        ok: false,
        error: {
          status: 400,
          code: 'INVALID_BODY',
          message: 'Unsupported content type for bug report attachment',
        },
      };
    }
    storageKey = `echo/bug-reports/${userId}/${objectKey}`;
  } else if (isUserBranding) {
    if (channelId || serverId) {
      return {
        ok: false,
        error: {
          status: 400,
          code: 'INVALID_BODY',
          message:
            'user_avatar and user_banner presign must not include channelId or serverId',
        },
      };
    }
    if (!isAllowedBrandingUploadContentType(contentType)) {
      return {
        ok: false,
        error: {
          status: 400,
          code: 'INVALID_BODY',
          message: 'Unsupported content type for profile image upload',
        },
      };
    }
    const prefix = purpose === 'user_avatar' ? 'echo/avatars' : 'echo/banners';
    storageKey = `${prefix}/${userId}/${objectKey}`;
  } else if (isServerBranding) {
    if (channelId) {
      return {
        ok: false,
        error: {
          status: 400,
          code: 'INVALID_BODY',
          message: 'Do not combine channelId with server_icon/server_banner',
        },
      };
    }
    if (!serverId) {
      return {
        ok: false,
        error: {
          status: 400,
          code: 'INVALID_BODY',
          message: 'serverId required for server icon/banner presign',
        },
      };
    }
    if (!isAllowedBrandingUploadContentType(contentType)) {
      return {
        ok: false,
        error: {
          status: 400,
          code: 'INVALID_BODY',
          message: 'Unsupported content type for server branding upload',
        },
      };
    }
    const okGuild = await hasServerPermission(
      pool,
      userId,
      serverId,
      'MANAGE_GUILD',
    );
    const isOwner = await isEchoServerOwner(pool, serverId, userId);
    if (!okGuild && !isOwner) {
      return {
        ok: false,
        error: {
          status: 403,
          code: 'FORBIDDEN',
          message: 'Cannot manage server branding',
        },
      };
    }
    const sub = purpose === 'server_icon' ? 'icons' : 'banners';
    storageKey = `echo/server-${sub}/${serverId}/${userId}/${objectKey}`;
  } else if (purpose === 'server_event_cover') {
    if (channelId) {
      return {
        ok: false,
        error: {
          status: 400,
          code: 'INVALID_BODY',
          message: 'Do not combine channelId with server_event_cover',
        },
      };
    }
    if (!serverId) {
      return {
        ok: false,
        error: {
          status: 400,
          code: 'INVALID_BODY',
          message: 'serverId required for server_event_cover presign',
        },
      };
    }
    if (!isAllowedBrandingUploadContentType(contentType)) {
      return {
        ok: false,
        error: {
          status: 400,
          code: 'INVALID_BODY',
          message: 'Unsupported content type for event cover upload',
        },
      };
    }
    const okGuild = await hasServerPermission(
      pool,
      userId,
      serverId,
      'MANAGE_GUILD',
    );
    const isOwner = await isEchoServerOwner(pool, serverId, userId);
    if (!okGuild && !isOwner) {
      return {
        ok: false,
        error: {
          status: 403,
          code: 'FORBIDDEN',
          message: 'Cannot upload event covers for this server',
        },
      };
    }
    storageKey = `echo/server-event-covers/${serverId}/${userId}/${objectKey}`;
  } else if (channelId) {
    if (purpose === 'server_application_attachment') {
      return {
        ok: false,
        error: {
          status: 400,
          code: 'INVALID_BODY',
          message:
            'Do not combine channelId with server_application_attachment purpose',
        },
      };
    }
    if (purpose === 'server_emoji') {
      return {
        ok: false,
        error: {
          status: 400,
          code: 'INVALID_BODY',
          message: 'Do not combine channelId with server_emoji purpose',
        },
      };
    }
    if (!isAllowedChatUploadContentType(contentType)) {
      return {
        ok: false,
        error: {
          status: 400,
          code: 'INVALID_BODY',
          message: 'Unsupported content type for chat upload',
        },
      };
    }
    const okUpload = await canUserUploadToEchoChannel(pool, userId, channelId);
    if (!okUpload) {
      return {
        ok: false,
        error: {
          status: 403,
          code: 'FORBIDDEN',
          message: 'Cannot upload to this channel',
        },
      };
    }
    storageKey = `echo/channels/${channelId}/${userId}/${objectKey}`;
  } else if (purpose === 'server_emoji') {
    if (!serverId) {
      return {
        ok: false,
        error: {
          status: 400,
          code: 'INVALID_BODY',
          message: 'serverId required for server_emoji presign',
        },
      };
    }
    if (!isAllowedEmojiUploadContentType(contentType)) {
      return {
        ok: false,
        error: {
          status: 400,
          code: 'INVALID_BODY',
          message: 'Unsupported content type for emoji upload',
        },
      };
    }
    const okEmoji = await canManageServerEmojis(pool, serverId, userId);
    const isOwner = await isEchoServerOwner(pool, serverId, userId);
    if (!okEmoji && !isOwner) {
      return {
        ok: false,
        error: {
          status: 403,
          code: 'FORBIDDEN',
          message: 'Cannot manage emojis for this server',
        },
      };
    }
    storageKey = `echo/emoji/${serverId}/${userId}/${objectKey}`;
  } else if (purpose === 'server_application_attachment') {
    if (channelId) {
      return {
        ok: false,
        error: {
          status: 400,
          code: 'INVALID_BODY',
          message:
            'Do not combine channelId with server_application_attachment purpose',
        },
      };
    }
    if (!serverId) {
      return {
        ok: false,
        error: {
          status: 400,
          code: 'INVALID_BODY',
          message:
            'serverId required for server_application_attachment presign',
        },
      };
    }
    if (!isAllowedChatUploadContentType(contentType)) {
      return {
        ok: false,
        error: {
          status: 400,
          code: 'INVALID_BODY',
          message: 'Unsupported content type for application attachment',
        },
      };
    }
    if (await isMemberOfServer(pool, serverId, userId)) {
      return {
        ok: false,
        error: {
          status: 403,
          code: 'FORBIDDEN',
          message:
            'server_application_attachment presign is only for users who are not members of this server',
        },
      };
    }
    if (await isUserBannedFromServer(pool, serverId, userId)) {
      return {
        ok: false,
        error: {
          status: 403,
          code: 'FORBIDDEN',
          message: 'You are banned from this server',
          detail: 'BANNED_FROM_SERVER',
        },
      };
    }
    const appSettings = await getEchoServerApplicationSettings(pool, serverId);
    if (!appSettings || !appSettings.applicationsEnabled) {
      return {
        ok: false,
        error: {
          status: 403,
          code: 'FORBIDDEN',
          message: 'Applications are not open for this server',
        },
      };
    }
    storageKey = `echo/server-application-attachments/${serverId}/${userId}/${objectKey}`;
  } else if (serverId) {
    if (!isAllowedChatUploadContentType(contentType)) {
      return {
        ok: false,
        error: {
          status: 400,
          code: 'INVALID_BODY',
          message: 'Unsupported content type for chat upload',
        },
      };
    }
    const okMem = await isMemberOfServer(pool, serverId, userId);
    if (!okMem) {
      return {
        ok: false,
        error: {
          status: 403,
          code: 'FORBIDDEN',
          message: ECHO_MSG_NOT_SERVER_MEMBER,
          detail: 'NOT_SERVER_MEMBER',
        },
      };
    }
    const timeoutState = await getUserCommunicationTimeoutState(
      pool,
      serverId,
      userId,
    );
    if (timeoutState.active) {
      return {
        ok: false,
        error: {
          status: 403,
          code: 'FORBIDDEN',
          message:
            'You are in a communication timeout in this server and cannot upload here until it ends.',
          detail: 'COMMUNICATION_TIMEOUT',
        },
      };
    }
    storageKey = `echo/${serverId}/${userId}/${objectKey}`;
  } else {
    return {
      ok: false,
      error: {
        status: 400,
        code: 'INVALID_BODY',
        message:
          'channelId (preferred), serverId (legacy / emoji / server branding), user_avatar/user_banner, user_ringtone, or bug_report purpose',
      },
    };
  }

  return { ok: true, storageKey };
}

/** Chat channels use post-message access; paper channels use author capability. */
export async function canUserUploadToEchoChannel(
  pool: pg.Pool,
  userId: string,
  channelId: string,
): Promise<boolean> {
  const ch = await pool.query(
    `SELECT type FROM echo_channels WHERE id = $1 LIMIT 1`,
    [channelId],
  );
  const type = String(ch.rows[0]?.type ?? '');
  if (type === 'paper') {
    const caps = await getPaperCapabilitiesForUser(pool, channelId, userId);
    return caps.canAuthorPaper;
  }
  return canUserPostMessage(pool, userId, channelId);
}
