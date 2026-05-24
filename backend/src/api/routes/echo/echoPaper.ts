import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { requireAuth } from '../../../auth/middleware';
import { sendEchoChannelAccessDenied, sendError } from '../../errors';
import {
  assertEchoPaperChannelAccess,
  getEchoPaperDocument,
  patchEchoPaperDocument,
} from '../../../domain/echoStore/paper';
import {
  createEchoPaperComment,
  deleteEchoPaperComment,
  echoPaperCommentToPayload,
  listEchoPaperComments,
  patchEchoPaperComment,
} from '../../../domain/echoStore/paperComments';
import {
  diagnoseEchoChannelAccess,
  getPaperCapabilitiesForUser,
} from '../../../domain/echoStore/access';
import {
  assertCanManagePaperShare,
  assertPaperContentVisibleToUser,
  isPaperSharePrivate,
  trimPaperDocumentWorkspacePayload,
  buildPaperShareAudience,
  ensurePaperShareToken,
  getPaperShareRow,
  updatePaperShareVisibility,
  type PaperShareVisibility,
} from '../../../domain/echoStore/paperShare';
import { publishEchoWorkspaceEvent } from '../../../platform/echoPlatformEvents';
import {
  getEchoChannelServerId,
  getEchoWorkspaceVersionForServers,
} from '../../../domain/echoStore';
import {
  echoPool,
  requireEchoStore,
  trimEchoPathParam,
} from './echoRouteUtils';

function paperDocumentPayload(
  channelId: string,
  row: Awaited<ReturnType<typeof getEchoPaperDocument>>,
  caps: Awaited<ReturnType<typeof getPaperCapabilitiesForUser>>,
) {
  if (!row) throw new Error('paper row required');
  return {
    channelId,
    contentJson: row.contentJson,
    contentSchemaVersion: row.contentSchemaVersion,
    revision: row.revision,
    updatedAt: row.updatedAt.toISOString(),
    updatedByUserId: row.updatedByUserId,
    paperCommentsEnabled: caps.paperCommentsEnabled,
    paperShowAuthorGutter: caps.paperShowAuthorGutter,
    canAuthorPaper: caps.canAuthorPaper,
    canCommentOnPaper: caps.canCommentOnPaper,
    canManagePaperComments: caps.canManagePaperComments,
    canDownloadPaper: caps.canDownloadPaper,
  };
}

export default async function echoPaperRoutes(
  fastify: FastifyInstance,
  _opts: FastifyPluginOptions,
): Promise<void> {
  fastify.get<{ Params: { channelId: string } }>(
    '/channels/:channelId/paper',
    { preHandler: [requireAuth, requireEchoStore] },
    async (req, reply) => {
      const pool = echoPool(req);
      const channelId = trimEchoPathParam(req.params.channelId);
      const userId = req.authUser!.id;
      const access = await assertEchoPaperChannelAccess(
        pool,
        userId,
        channelId,
      );
      if (!access.ok) {
        if (access.code === 'not_found') {
          return sendError(reply, 404, 'NOT_FOUND', 'Channel not found');
        }
        if (access.code === 'not_paper') {
          return sendError(
            reply,
            400,
            'INVALID_CHANNEL',
            'Not a paper channel',
          );
        }
        const denial = await diagnoseEchoChannelAccess(pool, userId, channelId);
        if (!denial.ok) return sendEchoChannelAccessDenied(reply, denial);
        return sendError(reply, 403, 'FORBIDDEN', 'Access denied');
      }
      const row = await getEchoPaperDocument(pool, channelId);
      if (!row) {
        return sendError(reply, 404, 'NOT_FOUND', 'Paper document not found');
      }
      const vis = await assertPaperContentVisibleToUser(
        pool,
        channelId,
        userId,
      );
      if (!vis.ok) {
        return sendError(reply, 403, 'FORBIDDEN', vis.message);
      }
      const caps = await getPaperCapabilitiesForUser(pool, channelId, userId);
      return reply.code(200).send(paperDocumentPayload(channelId, row, caps));
    },
  );

  fastify.get<{ Params: { channelId: string } }>(
    '/channels/:channelId/paper/share',
    { preHandler: [requireAuth, requireEchoStore] },
    async (req, reply) => {
      const pool = echoPool(req);
      const channelId = trimEchoPathParam(req.params.channelId);
      const userId = req.authUser!.id;
      const access = await assertEchoPaperChannelAccess(
        pool,
        userId,
        channelId,
      );
      if (!access.ok) {
        if (access.code === 'not_found') {
          return sendError(reply, 404, 'NOT_FOUND', 'Channel not found');
        }
        if (access.code === 'not_paper') {
          return sendError(
            reply,
            400,
            'INVALID_CHANNEL',
            'Not a paper channel',
          );
        }
        const denial = await diagnoseEchoChannelAccess(pool, userId, channelId);
        if (!denial.ok) return sendEchoChannelAccessDenied(reply, denial);
        return sendError(reply, 403, 'FORBIDDEN', 'Access denied');
      }
      const share = await getPaperShareRow(pool, channelId);
      if (!share) {
        return sendError(reply, 404, 'NOT_FOUND', 'Paper channel not found');
      }
      const manage = await assertCanManagePaperShare(pool, channelId, userId);
      const token =
        share.visibility === 'global'
          ? await ensurePaperShareToken(pool, channelId)
          : share.shareToken;
      const origin = String(req.headers.origin ?? '').replace(/\/$/, '');
      const base = origin || '';
      const serverUrl = `${base}/channels/${encodeURIComponent(share.serverId)}/${encodeURIComponent(channelId)}`;
      const publicShareUrl =
        share.visibility === 'global' && token
          ? `${base}/paper/s/${encodeURIComponent(token)}`
          : null;
      const audience = buildPaperShareAudience(share.visibility);
      return reply.code(200).send({
        channelId,
        serverId: share.serverId,
        visibility: share.visibility,
        shareUrl: serverUrl,
        publicShareUrl,
        shareToken: token,
        audience: { visibility: share.visibility, ...audience },
        canManageShare: manage.ok,
      });
    },
  );

  fastify.patch<{
    Params: { channelId: string };
    Body: { visibility?: PaperShareVisibility };
  }>(
    '/channels/:channelId/paper/share',
    { preHandler: [requireAuth, requireEchoStore] },
    async (req, reply) => {
      const pool = echoPool(req);
      const channelId = trimEchoPathParam(req.params.channelId);
      const userId = req.authUser!.id;
      const visibility = req.body?.visibility;
      if (
        visibility !== 'server' &&
        visibility !== 'private' &&
        visibility !== 'global'
      ) {
        return sendError(
          reply,
          400,
          'INVALID_BODY',
          'visibility must be server, private, or global',
        );
      }
      const result = await updatePaperShareVisibility(
        pool,
        channelId,
        userId,
        visibility,
      );
      if (!result.ok) {
        if (result.code === 'not_found') {
          return sendError(reply, 404, 'NOT_FOUND', 'Channel not found');
        }
        if (result.code === 'not_paper') {
          return sendError(
            reply,
            400,
            'INVALID_CHANNEL',
            'Not a paper channel',
          );
        }
        return sendError(
          reply,
          403,
          'FORBIDDEN',
          'Cannot manage share settings',
        );
      }
      const { row } = result;
      const token =
        row.visibility === 'global'
          ? await ensurePaperShareToken(pool, channelId)
          : row.shareToken;
      const origin = String(req.headers.origin ?? '').replace(/\/$/, '');
      const base = origin || '';
      const serverUrl = `${base}/channels/${encodeURIComponent(row.serverId)}/${encodeURIComponent(channelId)}`;
      const publicShareUrl =
        row.visibility === 'global' && token
          ? `${base}/paper/s/${encodeURIComponent(token)}`
          : null;
      const audience = buildPaperShareAudience(row.visibility);
      return reply.code(200).send({
        channelId,
        serverId: row.serverId,
        visibility: row.visibility,
        shareUrl: serverUrl,
        publicShareUrl,
        shareToken: token,
        audience: { visibility: row.visibility, ...audience },
        canManageShare: true,
      });
    },
  );

  fastify.patch<{
    Params: { channelId: string };
    Body: { contentJson?: unknown; expectedRevision?: number };
  }>(
    '/channels/:channelId/paper',
    { preHandler: [requireAuth, requireEchoStore] },
    async (req, reply) => {
      const pool = echoPool(req);
      const channelId = trimEchoPathParam(req.params.channelId);
      const userId = req.authUser!.id;
      const expectedRevision = Number(req.body?.expectedRevision);
      if (!Number.isFinite(expectedRevision) || expectedRevision < 1) {
        return sendError(
          reply,
          400,
          'INVALID_BODY',
          'expectedRevision required',
        );
      }
      const result = await patchEchoPaperDocument(
        pool,
        channelId,
        userId,
        req.body?.contentJson,
        expectedRevision,
      );
      if (!result.ok) {
        if (result.error === 'conflict') {
          return reply.code(409).send({
            error: 'CONFLICT',
            expectedRevision: result.expectedRevision,
            actualRevision: result.actualRevision,
          });
        }
        if (result.error === 'not_found') {
          return sendError(reply, 404, 'NOT_FOUND', result.message);
        }
        if (result.error === 'not_paper') {
          return sendError(reply, 400, 'INVALID_CHANNEL', result.message);
        }
        if (result.error === 'forbidden') {
          return sendError(reply, 403, 'FORBIDDEN', result.message);
        }
        return sendError(reply, 400, 'INVALID_BODY', result.message);
      }
      const caps = await getPaperCapabilitiesForUser(pool, channelId, userId);
      const payload = paperDocumentPayload(channelId, result.row, caps);
      const sid = await getEchoChannelServerId(pool, channelId);
      if (sid) {
        const version = await getEchoWorkspaceVersionForServers(pool, [sid]);
        const privatePaper = await isPaperSharePrivate(pool, channelId);
        publishEchoWorkspaceEvent(
          fastify,
          {
            kind: 'paper_document_updated',
            version,
            serverId: sid,
            paperDocument: trimPaperDocumentWorkspacePayload(
              payload,
              privatePaper,
            ),
          },
          { serverId: sid },
        );
      }
      return reply.code(200).send(payload);
    },
  );

  fastify.get<{ Params: { channelId: string } }>(
    '/channels/:channelId/paper/comments',
    { preHandler: [requireAuth, requireEchoStore] },
    async (req, reply) => {
      const pool = echoPool(req);
      const channelId = trimEchoPathParam(req.params.channelId);
      const userId = req.authUser!.id;
      const access = await assertEchoPaperChannelAccess(
        pool,
        userId,
        channelId,
      );
      if (!access.ok) {
        if (access.code === 'not_found') {
          return sendError(reply, 404, 'NOT_FOUND', 'Channel not found');
        }
        if (access.code === 'not_paper') {
          return sendError(
            reply,
            400,
            'INVALID_CHANNEL',
            'Not a paper channel',
          );
        }
        const denial = await diagnoseEchoChannelAccess(pool, userId, channelId);
        if (!denial.ok) return sendEchoChannelAccessDenied(reply, denial);
        return sendError(reply, 403, 'FORBIDDEN', 'Access denied');
      }
      const vis = await assertPaperContentVisibleToUser(
        pool,
        channelId,
        userId,
      );
      if (!vis.ok) {
        return sendError(reply, 403, 'FORBIDDEN', vis.message);
      }
      const rows = await listEchoPaperComments(pool, channelId);
      return reply.code(200).send({
        comments: rows.map(echoPaperCommentToPayload),
      });
    },
  );

  fastify.post<{
    Params: { channelId: string };
    Body: {
      anchorBlockId?: string;
      anchorFrom?: number | null;
      anchorTo?: number | null;
      anchorQuote?: string;
      body?: string;
      parentCommentId?: string | null;
    };
  }>(
    '/channels/:channelId/paper/comments',
    { preHandler: [requireAuth, requireEchoStore] },
    async (req, reply) => {
      const pool = echoPool(req);
      const channelId = trimEchoPathParam(req.params.channelId);
      const userId = req.authUser!.id;
      const result = await createEchoPaperComment(pool, channelId, userId, {
        anchorBlockId: String(req.body?.anchorBlockId ?? ''),
        anchorFrom: req.body?.anchorFrom ?? null,
        anchorTo: req.body?.anchorTo ?? null,
        anchorQuote: req.body?.anchorQuote,
        body: String(req.body?.body ?? ''),
        parentCommentId: req.body?.parentCommentId ?? null,
      });
      if (!result.ok) {
        return sendError(reply, result.status, 'FORBIDDEN', result.error);
      }
      const comment = echoPaperCommentToPayload(result.row);
      const sid = await getEchoChannelServerId(pool, channelId);
      if (sid && !(await isPaperSharePrivate(pool, channelId))) {
        const version = await getEchoWorkspaceVersionForServers(pool, [sid]);
        publishEchoWorkspaceEvent(
          fastify,
          {
            kind: 'paper_comment_updated',
            version,
            serverId: sid,
            paperComment: { action: 'created', channelId, comment },
          },
          { serverId: sid },
        );
      }
      return reply.code(201).send({ comment });
    },
  );

  fastify.patch<{
    Params: { channelId: string; commentId: string };
    Body: {
      body?: string;
      resolve?: boolean;
      unresolve?: boolean;
    };
  }>(
    '/channels/:channelId/paper/comments/:commentId',
    { preHandler: [requireAuth, requireEchoStore] },
    async (req, reply) => {
      const pool = echoPool(req);
      const channelId = trimEchoPathParam(req.params.channelId);
      const commentId = trimEchoPathParam(req.params.commentId);
      const userId = req.authUser!.id;
      const visPatch = await assertPaperContentVisibleToUser(
        pool,
        channelId,
        userId,
      );
      if (!visPatch.ok) {
        return sendError(reply, 403, 'FORBIDDEN', visPatch.message);
      }
      const result = await patchEchoPaperComment(
        pool,
        channelId,
        commentId,
        userId,
        {
          body: req.body?.body,
          resolve: req.body?.resolve,
          unresolve: req.body?.unresolve,
        },
      );
      if (!result.ok) {
        return sendError(reply, result.status, 'FORBIDDEN', result.error);
      }
      const comment = echoPaperCommentToPayload(result.row);
      const sid = await getEchoChannelServerId(pool, channelId);
      if (sid && !(await isPaperSharePrivate(pool, channelId))) {
        const version = await getEchoWorkspaceVersionForServers(pool, [sid]);
        publishEchoWorkspaceEvent(
          fastify,
          {
            kind: 'paper_comment_updated',
            version,
            serverId: sid,
            paperComment: { action: 'updated', channelId, comment },
          },
          { serverId: sid },
        );
      }
      return reply.code(200).send({ comment });
    },
  );

  fastify.delete<{
    Params: { channelId: string; commentId: string };
  }>(
    '/channels/:channelId/paper/comments/:commentId',
    { preHandler: [requireAuth, requireEchoStore] },
    async (req, reply) => {
      const pool = echoPool(req);
      const channelId = trimEchoPathParam(req.params.channelId);
      const commentId = trimEchoPathParam(req.params.commentId);
      const userId = req.authUser!.id;
      const visDel = await assertPaperContentVisibleToUser(
        pool,
        channelId,
        userId,
      );
      if (!visDel.ok) {
        return sendError(reply, 403, 'FORBIDDEN', visDel.message);
      }
      const result = await deleteEchoPaperComment(
        pool,
        channelId,
        commentId,
        userId,
      );
      if (!result.ok) {
        return sendError(reply, result.status, 'FORBIDDEN', result.error);
      }
      const sid = await getEchoChannelServerId(pool, channelId);
      if (sid && !(await isPaperSharePrivate(pool, channelId))) {
        const version = await getEchoWorkspaceVersionForServers(pool, [sid]);
        publishEchoWorkspaceEvent(
          fastify,
          {
            kind: 'paper_comment_updated',
            version,
            serverId: sid,
            paperComment: {
              action: 'deleted',
              channelId,
              comment: { id: commentId, channelId },
            },
          },
          { serverId: sid },
        );
      }
      return reply.code(204).send();
    },
  );
}
