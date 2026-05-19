import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { requireAuth } from '../../../auth/middleware';
import { sendEchoChannelAccessDenied, sendError } from '../../errors';
import {
  diagnoseEchoChannelAccess,
  deleteEchoChannel,
  getEchoChannelCapabilitiesForUser,
  getEchoChannelAuditSnapshot,
  getEchoChannelServerId,
  getEchoForumChannelRow,
  insertEchoAudit,
  listEchoForumPosts,
  patchEchoChannel,
  patchEchoForumPost,
  validateEchoForumPostCreateFirstMessagePoll,
  copyEchoChannelPermissionOverwrites,
  createEchoChannel,
  forumCreatorCanManagePostFlags,
  getForumPostCreatorAccess,
  type PatchEchoChannelInput,
} from '../../../domain/echoStore';
import { isMemberOfServer } from '../../../domain/echoPermissions';
import { publishEchoWorkspaceEvent } from '../../../platform/echoPlatformEvents';
import { config } from '../../../config';
import {
  deleteLiveKitRoom,
  liveKitRoomName,
} from '../../../services/livekit/livekitAdapter';
import { vcTrace } from '../../../observability/voiceTraceLog';
import {
  echoPool,
  requireEchoStore,
  trimEchoPathParam,
} from './echoRouteUtils';
import { echoPersistedMessageCreateAndBroadcast } from '../../../services/echoPersistedMessageCreate';
import { validateMessagePayload } from '../../../sockets/messageValidation';

export default async function echoChannelsRoutes(
  fastify: FastifyInstance,
  _opts: FastifyPluginOptions,
): Promise<void> {
  function deriveForumPostTitle(content: string): string {
    const raw =
      content
        .replace(/\r\n/g, '\n')
        .split('\n')
        .map((l) => l.trim())
        .find((l) => l.length > 0) ?? '';
    const noCodeFence = raw.replace(/```.*$/g, '').trim();
    const noMd = noCodeFence
      .replace(/[*_~`>#]+/g, '')
      .replace(/\[(.*?)\]\((.*?)\)/g, '$1')
      .replace(/\s+/g, ' ')
      .trim();
    const t = noMd || 'Post';
    return t.length > 120 ? t.slice(0, 120) : t;
  }

  fastify.get<{
    Params: { channelId: string };
    Querystring: { sort?: string; includeArchived?: string; limit?: string };
  }>(
    '/channels/:channelId/forum/posts',
    { preHandler: [requireAuth, requireEchoStore] },
    async (req, reply) => {
      const pool = echoPool(req);
      const forumChannelId = trimEchoPathParam(req.params.channelId);
      const sid = await getEchoChannelServerId(pool, forumChannelId);
      if (!sid) return sendError(reply, 404, 'NOT_FOUND', 'Channel not found');
      const access = await diagnoseEchoChannelAccess(
        pool,
        req.authUser!.id,
        forumChannelId,
      );
      if (!access.ok) return sendEchoChannelAccessDenied(reply, access);

      const forum = await getEchoForumChannelRow(pool, forumChannelId);
      if (!forum || forum.type !== 'forum') {
        return sendError(
          reply,
          400,
          'INVALID_CHANNEL',
          'Channel is not a forum',
        );
      }

      const sort =
        req.query?.sort === 'creation_date'
          ? 'creation_date'
          : 'latest_activity';
      const includeArchived = req.query?.includeArchived === 'true';
      const limit =
        req.query?.limit != null ? Number(req.query.limit) : undefined;

      return reply.code(200).send(
        await listEchoForumPosts(pool, forumChannelId, {
          sort,
          includeArchived,
          limit,
        }),
      );
    },
  );

  fastify.post<{
    Params: { channelId: string };
    Body: {
      content?: unknown;
      tagIds?: unknown;
      mentions?: unknown;
      imageUrl?: unknown;
      videoUrl?: unknown;
      gif?: unknown;
      imageSpoiler?: unknown;
      poll?: unknown;
      attachments?: unknown;
      stickers?: unknown;
      contentJson?: unknown;
      contentSchemaVersion?: unknown;
      messageFormatVersion?: unknown;
    };
  }>(
    '/channels/:channelId/forum/posts',
    { preHandler: [requireAuth, requireEchoStore] },
    async (req, reply) => {
      const pool = echoPool(req);
      const forumChannelId = trimEchoPathParam(req.params.channelId);
      const sid = await getEchoChannelServerId(pool, forumChannelId);
      if (!sid) return sendError(reply, 404, 'NOT_FOUND', 'Channel not found');

      const access = await diagnoseEchoChannelAccess(
        pool,
        req.authUser!.id,
        forumChannelId,
      );
      if (!access.ok) return sendEchoChannelAccessDenied(reply, access);

      const caps = await getEchoChannelCapabilitiesForUser(
        pool,
        forumChannelId,
        req.authUser!.id,
      );
      if (!caps.canSendMessages) {
        return sendError(
          reply,
          403,
          'FORBIDDEN',
          'You do not have permission to create posts in this forum.',
          'NO_SEND',
        );
      }

      const forum = await getEchoForumChannelRow(pool, forumChannelId);
      if (!forum || forum.type !== 'forum') {
        return sendError(
          reply,
          400,
          'INVALID_CHANNEL',
          'Channel is not a forum',
        );
      }

      const pollCheck = validateEchoForumPostCreateFirstMessagePoll(
        req.body?.poll,
      );
      if (!pollCheck.ok) {
        req.log.info(
          {
            userId: req.authUser!.id,
            forumChannelId,
          },
          'forum.post.create.reject_poll_first_message',
        );
        return sendError(
          reply,
          400,
          'INVALID_BODY',
          pollCheck.error,
          'POLL_FIRST',
        );
      }

      const content =
        typeof req.body?.content === 'string' ? req.body.content.trim() : '';
      const tagIdsRaw = req.body?.tagIds;
      const tagIds = Array.isArray(tagIdsRaw)
        ? tagIdsRaw.filter((x): x is string => typeof x === 'string')
        : [];
      if (!content) {
        return sendError(reply, 400, 'INVALID_BODY', 'Missing post content');
      }
      const title = deriveForumPostTitle(content);

      const postChannelId = await createEchoChannel(
        pool,
        forum.serverId,
        title,
        'text',
        forum.categoryId,
        undefined,
        {
          parentChannelId: forumChannelId,
          forumPostTagIds: tagIds,
          forumPostPinned: false,
          forumPostLocked: false,
          forumPostArchivedAt: null,
          forumPostCreatorUserId: req.authUser!.id,
        },
      );
      if (postChannelId === 'invalid_category') {
        return sendError(reply, 409, 'CONFLICT', 'Invalid category');
      }

      await copyEchoChannelPermissionOverwrites(
        pool,
        forum.serverId,
        forumChannelId,
        postChannelId,
      );

      const validated = validateMessagePayload({
        channelId: postChannelId,
        content,
        ...(req.body?.mentions !== undefined
          ? { mentions: req.body.mentions }
          : {}),
        ...(req.body?.imageUrl !== undefined
          ? { imageUrl: req.body.imageUrl }
          : {}),
        ...(req.body?.videoUrl !== undefined
          ? { videoUrl: req.body.videoUrl }
          : {}),
        ...(req.body?.gif !== undefined ? { gif: req.body.gif } : {}),
        ...(req.body?.imageSpoiler !== undefined
          ? { imageSpoiler: req.body.imageSpoiler }
          : {}),
        ...(req.body?.poll !== undefined ? { poll: req.body.poll } : {}),
        ...(req.body?.attachments !== undefined
          ? { attachments: req.body.attachments }
          : {}),
        ...(req.body?.contentJson !== undefined
          ? { contentJson: req.body.contentJson }
          : {}),
        ...(req.body?.contentSchemaVersion !== undefined
          ? { contentSchemaVersion: req.body.contentSchemaVersion }
          : {}),
      });
      if (!validated.ok) {
        return sendError(reply, 400, 'INVALID_BODY', validated.error);
      }

      const persistRes = await echoPersistedMessageCreateAndBroadcast(
        pool,
        fastify.io,
        fastify.log,
        req.authUser!.id,
        {
          ...validated.value,
        },
      );
      if (!persistRes.ok) {
        if (persistRes.code === 'E2EE_STORAGE_UNAVAILABLE') {
          return sendError(
            reply,
            503,
            'E2EE_STORAGE_UNAVAILABLE',
            persistRes.detail ??
              'Encrypted message storage is not enabled on this database.',
          );
        }
        if (persistRes.code === 'INVALID_ATTACHMENT') {
          return sendError(
            reply,
            400,
            'INVALID_BODY',
            persistRes.detail ?? 'Attachment URL is not valid for this channel',
          );
        }
        return sendError(
          reply,
          500,
          'PERSIST_FAILED',
          persistRes.detail ?? 'Failed to persist post message',
        );
      }

      return reply.code(200).send({
        channelId: postChannelId,
        ...(persistRes.kind === 'broadcast' ||
        persistRes.kind === 'duplicate_ack'
          ? { messageId: persistRes.message.id }
          : {}),
      });
    },
  );

  fastify.patch<{
    Params: { channelId: string };
    Body: {
      pinned?: unknown;
      locked?: unknown;
      archivedAt?: unknown;
      tagIds?: unknown;
    };
  }>(
    '/channels/:channelId/forum/post',
    { preHandler: [requireAuth, requireEchoStore] },
    async (req, reply) => {
      const pool = echoPool(req);
      const postChannelId = trimEchoPathParam(req.params.channelId);
      const sid = await getEchoChannelServerId(pool, postChannelId);
      if (!sid) return sendError(reply, 404, 'NOT_FOUND', 'Channel not found');

      const access = await diagnoseEchoChannelAccess(
        pool,
        req.authUser!.id,
        postChannelId,
      );
      if (!access.ok) return sendEchoChannelAccessDenied(reply, access);

      const caps = await getEchoChannelCapabilitiesForUser(
        pool,
        postChannelId,
        req.authUser!.id,
      );
      const postAccess = await getForumPostCreatorAccess(pool, postChannelId);
      const creatorManage =
        postAccess &&
        forumCreatorCanManagePostFlags(postAccess, req.authUser!.id);
      if (!caps.canManageChannel && !creatorManage) {
        return sendError(
          reply,
          403,
          'FORBIDDEN',
          'You do not have permission to manage this post.',
          'NO_MANAGE_CHANNEL',
        );
      }

      const b = req.body ?? {};
      const res = await patchEchoForumPost(pool, postChannelId, {
        ...(b.tagIds !== undefined ? { tagIds: b.tagIds } : {}),
        ...(typeof b.pinned === 'boolean' ? { pinned: b.pinned } : {}),
        ...(typeof b.locked === 'boolean' ? { locked: b.locked } : {}),
        ...('archivedAt' in b
          ? b.archivedAt === null || typeof b.archivedAt === 'string'
            ? { archivedAt: b.archivedAt as string | null }
            : {}
          : {}),
      });
      if (res === 'not_found') {
        return sendError(reply, 404, 'NOT_FOUND', 'Channel not found');
      }
      return reply.code(200).send({ ok: true });
    },
  );

  fastify.get<{ Params: { channelId: string } }>(
    '/channels/:channelId/capabilities',
    { preHandler: [requireAuth, requireEchoStore] },
    async (req, reply) => {
      const pool = echoPool(req);
      const channelId = trimEchoPathParam(req.params.channelId);
      const sid = await getEchoChannelServerId(pool, channelId);
      if (!sid) return sendError(reply, 404, 'NOT_FOUND', 'Channel not found');
      // DM / group-DM channels use `echo_dm_realm`; users are not `echo_server_members` there.
      const access = await diagnoseEchoChannelAccess(
        pool,
        req.authUser!.id,
        channelId,
      );
      if (!access.ok) return sendEchoChannelAccessDenied(reply, access);
      return reply
        .code(200)
        .send(
          await getEchoChannelCapabilitiesForUser(
            pool,
            channelId,
            req.authUser!.id,
          ),
        );
    },
  );

  fastify.patch<{
    Params: { channelId: string };
    Body: {
      permissionOverrides?: unknown;
      name?: string;
      categoryId?: string | null;
      siblingIndex?: number;
      moveOutOfCategoryPermission?: 'sync' | 'keep';
      slowmodeSeconds?: number;
      userLimit?: number;
      bitrateBps?: number | null;
      nsfw?: boolean;
      iconKey?: string;
      /** Text channels: open chat scrolled to newest (bottom) or start of loaded page (top). */
      messageHistoryAnchor?: 'top' | 'bottom';
      forumCreatorDefaultPerms?: unknown;
      voiceE2eeEnabled?: boolean;
      autoDeleteAfterSeconds?: number | null;
      autoDeleteSyncedToCategory?: boolean;
      messageFormatTemplate?: string;
      messageFormatHard?: boolean;
    };
  }>(
    '/channels/:channelId',
    { preHandler: [requireAuth, requireEchoStore] },
    async (req, reply) => {
      const pool = echoPool(req);
      const channelId = trimEchoPathParam(req.params.channelId);
      const sid = await getEchoChannelServerId(pool, channelId);
      if (!sid) return sendError(reply, 404, 'NOT_FOUND', 'Channel not found');
      const okMem = await isMemberOfServer(pool, sid, req.authUser!.id);
      if (!okMem)
        return sendError(
          reply,
          403,
          'FORBIDDEN',
          'You are not a member of this server. Ask for an invite or join from Explore if the server is public.',
          'NOT_SERVER_MEMBER',
        );

      const b = req.body ?? {};
      const patch: PatchEchoChannelInput = {};
      if (typeof b.name === 'string') patch.name = b.name;
      if ('categoryId' in b) {
        if (b.categoryId === null) patch.categoryId = null;
        else if (typeof b.categoryId === 'string')
          patch.categoryId = b.categoryId;
      }
      if (typeof b.siblingIndex === 'number')
        patch.siblingIndex = b.siblingIndex;
      if (
        b.moveOutOfCategoryPermission === 'sync' ||
        b.moveOutOfCategoryPermission === 'keep'
      ) {
        patch.moveOutOfCategoryPermission = b.moveOutOfCategoryPermission;
      }
      if (typeof b.slowmodeSeconds === 'number')
        patch.slowmodeSeconds = b.slowmodeSeconds;
      if (typeof b.userLimit === 'number') patch.userLimit = b.userLimit;
      if (b.bitrateBps === null) patch.bitrateBps = null;
      else if (typeof b.bitrateBps === 'number')
        patch.bitrateBps = b.bitrateBps;
      if (typeof b.nsfw === 'boolean') patch.nsfw = b.nsfw;
      if (typeof b.iconKey === 'string') patch.iconKey = b.iconKey;
      if (
        b.messageHistoryAnchor === 'top' ||
        b.messageHistoryAnchor === 'bottom'
      )
        patch.messageHistoryAnchor = b.messageHistoryAnchor;
      const raw = b.permissionOverrides;
      if (raw !== undefined) {
        if (raw === null) {
          patch.permissionOverrides = null;
        } else if (typeof raw === 'object' && !Array.isArray(raw)) {
          patch.permissionOverrides = raw as Record<string, unknown>;
        } else {
          return sendError(
            reply,
            400,
            'INVALID_BODY',
            'permissionOverrides must be an object or null',
          );
        }
      }
      if ('forumCreatorDefaultPerms' in b) {
        patch.forumCreatorDefaultPerms = b.forumCreatorDefaultPerms;
      }
      if (typeof b.voiceE2eeEnabled === 'boolean') {
        patch.voiceE2eeEnabled = b.voiceE2eeEnabled;
      }
      if ('autoDeleteAfterSeconds' in b) {
        patch.autoDeleteAfterSeconds = b.autoDeleteAfterSeconds ?? null;
      }
      if (typeof b.autoDeleteSyncedToCategory === 'boolean') {
        patch.autoDeleteSyncedToCategory = b.autoDeleteSyncedToCategory;
      }
      if (
        'messageFormatTemplate' in b &&
        typeof b.messageFormatTemplate === 'string'
      ) {
        patch.messageFormatTemplate = b.messageFormatTemplate;
      }
      if (typeof b.messageFormatHard === 'boolean') {
        patch.messageFormatHard = b.messageFormatHard;
      }

      const prevRow = await getEchoChannelAuditSnapshot(pool, channelId, sid);

      const r = await patchEchoChannel(
        pool,
        sid,
        req.authUser!.id,
        channelId,
        patch,
      );
      if (r === 'forbidden')
        return sendError(
          reply,
          403,
          'FORBIDDEN',
          'You cannot edit this channel',
        );
      if (r === 'not_found')
        return sendError(reply, 404, 'NOT_FOUND', 'Channel not found');
      if (r === 'invalid_body')
        return sendError(reply, 400, 'INVALID_BODY', 'Invalid channel patch');

      const after = await getEchoChannelAuditSnapshot(pool, channelId, sid);
      const auditId = await insertEchoAudit(
        pool,
        sid,
        req.authUser!.id,
        'channel.patch',
        'channel',
        channelId,
        {
          before: prevRow ?? null,
          after: after ?? null,
        },
      );
      publishEchoWorkspaceEvent(
        fastify,
        {
          kind:
            patch.permissionOverrides !== undefined
              ? 'permission_invalidated'
              : 'channel_tree_changed',
          version: auditId,
          serverId: sid,
        },
        { serverId: sid },
      );
      return reply.code(204).send();
    },
  );

  fastify.delete<{ Params: { channelId: string } }>(
    '/channels/:channelId',
    { preHandler: [requireAuth, requireEchoStore] },
    async (req, reply) => {
      const pool = echoPool(req);
      const channelId = trimEchoPathParam(req.params.channelId);
      const sid = await getEchoChannelServerId(pool, channelId);
      if (!sid) return sendError(reply, 404, 'NOT_FOUND', 'Channel not found');
      const okMem = await isMemberOfServer(pool, sid, req.authUser!.id);
      if (!okMem)
        return sendError(
          reply,
          403,
          'FORBIDDEN',
          'You are not a member of this server. Ask for an invite or join from Explore if the server is public.',
          'NOT_SERVER_MEMBER',
        );

      const row = await pool.query(
        `SELECT type FROM echo_channels WHERE id = $1 AND server_id = $2`,
        [channelId, sid],
      );
      if (!row.rows[0])
        return sendError(reply, 404, 'NOT_FOUND', 'Channel not found');
      const chType = String(row.rows[0].type);

      const r = await deleteEchoChannel(pool, sid, req.authUser!.id, channelId);
      if (r === 'forbidden')
        return sendError(
          reply,
          403,
          'FORBIDDEN',
          'You cannot delete this channel',
        );
      if (r === 'not_found')
        return sendError(reply, 404, 'NOT_FOUND', 'Channel not found');

      if (chType === 'voice' && config.liveKitEnabled) {
        const lkRoom = liveKitRoomName(sid, channelId);
        vcTrace(req.log, 'channel.delete:livekit_room', {
          serverId: sid,
          channelId,
          roomName: lkRoom,
        });
        try {
          await deleteLiveKitRoom(lkRoom);
        } catch (e) {
          vcTrace(req.log, 'channel.delete:livekit_room_error', {
            roomName: lkRoom,
            err: e instanceof Error ? e.message : String(e),
          });
          req.log.warn(
            { err: e },
            '[LiveKit] deleteRoom on voice channel delete failed',
          );
        }
      }

      const auditId = await insertEchoAudit(
        pool,
        sid,
        req.authUser!.id,
        'channel.delete',
        'channel',
        channelId,
        { type: chType },
      );
      publishEchoWorkspaceEvent(
        fastify,
        {
          kind: 'channel_tree_changed',
          version: auditId,
          serverId: sid,
        },
        { serverId: sid },
      );
      return reply.code(204).send();
    },
  );
}
