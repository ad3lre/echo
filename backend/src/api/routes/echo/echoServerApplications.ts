import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { getAuthUser, requireAuth } from '../../../auth/middleware';
import { ECHO_MSG_NOT_SERVER_MEMBER, sendError } from '../../errors';
import {
  approveEchoServerApplication,
  getEchoServerApplicationSettings,
  listEchoServerApplications,
  rejectEchoServerApplication,
  submitEchoServerApplication,
} from '../../../domain/echoStore';
import { echoApplicationFormForClient } from '../../../domain/echoStore/applicationForm';
import { getMergedRolePermissions } from '../../../domain/echoStore/permissions';
import { isMemberOfServer } from '../../../domain/echoPermissions';
import { clientIpFromFastifyRequest } from '../../../net/clientIp';
import { publishEchoWorkspaceEvent } from '../../../platform/echoPlatformEvents';
import {
  echoPool,
  requireEchoStore,
  trimEchoPathParam,
} from './echoRouteUtils';

export default async function echoServerApplicationsRoutes(
  fastify: FastifyInstance,
  _opts: FastifyPluginOptions,
): Promise<void> {
  fastify.get<{ Params: { serverId: string } }>(
    '/servers/:serverId/join-application-preview',
    { preHandler: [requireAuth, requireEchoStore] },
    async (req, reply) => {
      if (req.authUser?.isGuest) {
        return sendError(reply, 403, 'FORBIDDEN', 'Guests cannot apply');
      }
      const pool = echoPool(req);
      const sid = trimEchoPathParam(req.params.serverId);
      const okMem = await isMemberOfServer(pool, sid, getAuthUser(req).id);
      if (okMem) {
        return sendError(
          reply,
          400,
          'ALREADY_MEMBER',
          'You are already a member of this server',
        );
      }
      const s = await getEchoServerApplicationSettings(pool, sid);
      if (!s || !s.applicationsEnabled) {
        return sendError(
          reply,
          404,
          'NOT_FOUND',
          'Applications are not open for this server',
        );
      }
      return reply.code(200).send({
        applicationForm: echoApplicationFormForClient(s.applicationForm),
      });
    },
  );

  fastify.get<{ Params: { serverId: string } }>(
    '/servers/:serverId/application-settings',
    { preHandler: [requireAuth, requireEchoStore] },
    async (req, reply) => {
      const pool = echoPool(req);
      const sid = trimEchoPathParam(req.params.serverId);
      const okMem = await isMemberOfServer(pool, sid, getAuthUser(req).id);
      if (!okMem)
        return sendError(
          reply,
          403,
          'FORBIDDEN',
          ECHO_MSG_NOT_SERVER_MEMBER,
          'NOT_SERVER_MEMBER',
        );
      const perms = await getMergedRolePermissions(
        pool,
        sid,
        getAuthUser(req).id,
      );
      if (!perms.has('MANAGE_GUILD'))
        return sendError(
          reply,
          403,
          'FORBIDDEN',
          'Not allowed to manage applications for this server',
        );
      const s = await getEchoServerApplicationSettings(pool, sid);
      if (!s) return sendError(reply, 404, 'NOT_FOUND', 'Server not found');
      return reply.code(200).send({
        applicationsEnabled: s.applicationsEnabled,
        applicationForm: echoApplicationFormForClient(s.applicationForm),
      });
    },
  );

  fastify.get<{
    Params: { serverId: string };
    Querystring: { status?: string };
  }>(
    '/servers/:serverId/applications',
    { preHandler: [requireAuth, requireEchoStore] },
    async (req, reply) => {
      const pool = echoPool(req);
      const sid = trimEchoPathParam(req.params.serverId);
      const okMem = await isMemberOfServer(pool, sid, getAuthUser(req).id);
      if (!okMem)
        return sendError(
          reply,
          403,
          'FORBIDDEN',
          ECHO_MSG_NOT_SERVER_MEMBER,
          'NOT_SERVER_MEMBER',
        );
      const perms = await getMergedRolePermissions(
        pool,
        sid,
        getAuthUser(req).id,
      );
      if (!perms.has('MANAGE_GUILD'))
        return sendError(
          reply,
          403,
          'FORBIDDEN',
          'Not allowed to view applications for this server',
        );
      const raw = typeof req.query.status === 'string' ? req.query.status : '';
      const st =
        raw === 'pending' ||
        raw === 'approved' ||
        raw === 'rejected' ||
        raw === 'all'
          ? raw
          : 'pending';
      const rows = await listEchoServerApplications(pool, sid, st);
      return reply.code(200).send({ applications: rows });
    },
  );

  fastify.post<{
    Params: { serverId: string };
    Body: {
      source?: string;
      inviteToken?: string | null;
      answers?: unknown;
    };
  }>(
    '/servers/:serverId/applications',
    { preHandler: [requireAuth, requireEchoStore] },
    async (req, reply) => {
      if (req.authUser?.isGuest)
        return sendError(reply, 403, 'FORBIDDEN', 'Guests cannot apply');
      const pool = echoPool(req);
      const sid = trimEchoPathParam(req.params.serverId);
      const src = req.body?.source;
      if (src !== 'invite' && src !== 'directory')
        return sendError(
          reply,
          400,
          'INVALID_BODY',
          'source must be invite or directory',
        );
      const r = await submitEchoServerApplication(
        pool,
        sid,
        getAuthUser(req).id,
        {
          source: src,
          inviteToken: req.body?.inviteToken,
          answers: req.body?.answers ?? {},
        },
      );
      if (!r.ok) {
        if (r.reason === 'not_found')
          return sendError(reply, 404, 'NOT_FOUND', 'Server not found');
        if (r.reason === 'disabled')
          return sendError(
            reply,
            400,
            'APPLICATIONS_DISABLED',
            'This server is not accepting applications',
          );
        if (r.reason === 'already_member')
          return sendError(
            reply,
            400,
            'ALREADY_MEMBER',
            'You are already a member of this server',
          );
        if (r.reason === 'banned')
          return sendError(
            reply,
            403,
            'FORBIDDEN',
            'You are banned from this server',
            'BANNED_FROM_SERVER',
          );
        if (r.reason === 'invite_mismatch' || r.reason === 'not_listed')
          return sendError(
            reply,
            403,
            'FORBIDDEN',
            'You cannot apply to this server with the given source',
          );
        if (r.reason === 'duplicate_pending')
          return sendError(
            reply,
            409,
            'APPLICATION_PENDING',
            'You already have a pending application for this server',
          );
        return sendError(
          reply,
          400,
          'INVALID_BODY',
          'Invalid application answers',
        );
      }
      return reply.code(201).send({ applicationId: r.applicationId });
    },
  );

  fastify.post<{ Params: { serverId: string; applicationId: string } }>(
    '/servers/:serverId/applications/:applicationId/approve',
    { preHandler: [requireAuth, requireEchoStore] },
    async (req, reply) => {
      const pool = echoPool(req);
      const sid = trimEchoPathParam(req.params.serverId);
      const aid = trimEchoPathParam(req.params.applicationId);
      const okMem = await isMemberOfServer(pool, sid, getAuthUser(req).id);
      if (!okMem)
        return sendError(
          reply,
          403,
          'FORBIDDEN',
          ECHO_MSG_NOT_SERVER_MEMBER,
          'NOT_SERVER_MEMBER',
        );
      const perms = await getMergedRolePermissions(
        pool,
        sid,
        getAuthUser(req).id,
      );
      if (!perms.has('MANAGE_GUILD'))
        return sendError(
          reply,
          403,
          'FORBIDDEN',
          'Not allowed to approve applications',
        );
      const r = await approveEchoServerApplication(
        pool,
        sid,
        aid,
        getAuthUser(req).id,
        clientIpFromFastifyRequest(req),
        { io: fastify.io, log: req.log },
      );
      if (!r.ok) {
        if (r.reason === 'not_found')
          return sendError(reply, 404, 'NOT_FOUND', 'Application not found');
        if (r.reason === 'bad_status')
          return sendError(
            reply,
            400,
            'INVALID_STATUS',
            'Application is not pending',
          );
        if (r.reason === 'banned')
          return sendError(
            reply,
            403,
            'FORBIDDEN',
            'User is banned from this server',
            'BANNED_FROM_SERVER',
          );
        return sendError(
          reply,
          503,
          'JOIN_FAILED',
          'Could not add member; try again later',
        );
      }
      if (!r.alreadyMember && r.joinAuditId) {
        publishEchoWorkspaceEvent(
          fastify,
          {
            kind: 'membership_changed',
            version: r.joinAuditId,
            serverId: sid,
            userId: r.approvedUserId,
          },
          { serverId: sid, userId: r.approvedUserId },
        );
      }
      return reply.code(204).send();
    },
  );

  fastify.post<{
    Params: { serverId: string; applicationId: string };
    Body: { note?: string };
  }>(
    '/servers/:serverId/applications/:applicationId/reject',
    { preHandler: [requireAuth, requireEchoStore] },
    async (req, reply) => {
      const pool = echoPool(req);
      const sid = trimEchoPathParam(req.params.serverId);
      const aid = trimEchoPathParam(req.params.applicationId);
      const okMem = await isMemberOfServer(pool, sid, getAuthUser(req).id);
      if (!okMem)
        return sendError(
          reply,
          403,
          'FORBIDDEN',
          ECHO_MSG_NOT_SERVER_MEMBER,
          'NOT_SERVER_MEMBER',
        );
      const perms = await getMergedRolePermissions(
        pool,
        sid,
        getAuthUser(req).id,
      );
      if (!perms.has('MANAGE_GUILD'))
        return sendError(
          reply,
          403,
          'FORBIDDEN',
          'Not allowed to reject applications',
        );
      const r = await rejectEchoServerApplication(
        pool,
        sid,
        aid,
        getAuthUser(req).id,
        req.body?.note,
      );
      if (r === 'not_found')
        return sendError(reply, 404, 'NOT_FOUND', 'Application not found');
      if (r === 'bad_status')
        return sendError(
          reply,
          400,
          'INVALID_STATUS',
          'Application is not pending',
        );
      return reply.code(204).send();
    },
  );
}
