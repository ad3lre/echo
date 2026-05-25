import type { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { requireAuth, getAuthUser } from '../../../auth/middleware';
import { sendError } from '../../errors';
import {
  canManageTickets,
  createEchoTicket,
  assignEchoTicket,
  deleteEchoTicket,
  getEchoTicketByChannelId,
  getEchoTicketById,
  getEchoTicketConfig,
  isTicketHandler,
  listEchoTicketsForServer,
  updateEchoTicketConfig,
  updateEchoTicketStatus,
} from '../../../domain/echoStore';
import { isMemberOfServer } from '../../../domain/echoPermissions';
import { publishEchoWorkspaceEvent } from '../../../platform/echoPlatformEvents';
import { getEchoWorkspaceVersionForServers } from '../../../domain/echoStore';
import {
  echoPool,
  requireEchoStore,
  trimEchoPathParam,
} from './echoRouteUtils';
import type { EchoTicketStatus } from '../../../../../shared/types/ticket';

export default async function echoTicketRoutes(
  fastify: FastifyInstance,
  _opts: FastifyPluginOptions,
): Promise<void> {
  // ─── Get ticket config (any member) ────────────────────────────────────────
  fastify.get<{ Params: { serverId: string } }>(
    '/servers/:serverId/ticket-config',
    { preHandler: [requireAuth, requireEchoStore] },
    async (req, reply) => {
      const pool = echoPool(req);
      const sid = trimEchoPathParam(req.params.serverId);
      const okMem = await isMemberOfServer(pool, sid, getAuthUser(req).id);
      if (!okMem) {
        return sendError(reply, 403, 'FORBIDDEN', 'Not a server member');
      }
      const config = await getEchoTicketConfig(pool, sid);
      return reply.send(config);
    },
  );

  // ─── Update ticket config (manage tickets permission) ──────────────────────
  fastify.patch<{
    Params: { serverId: string };
    Body: Record<string, unknown>;
  }>(
    '/servers/:serverId/ticket-config',
    { preHandler: [requireAuth, requireEchoStore] },
    async (req, reply) => {
      const pool = echoPool(req);
      const sid = trimEchoPathParam(req.params.serverId);
      const uid = getAuthUser(req).id;

      if (!(await canManageTickets(pool, sid, uid))) {
        return sendError(reply, 403, 'FORBIDDEN', 'Missing MANAGE_TICKETS');
      }

      const body = req.body;
      if (!body || typeof body !== 'object') {
        return sendError(reply, 400, 'INVALID_BODY', 'Invalid body');
      }

      const updated = await updateEchoTicketConfig(pool, sid, {
        enabled: typeof body.enabled === 'boolean' ? body.enabled : undefined,
        panelChannelId:
          body.panelChannelId !== undefined
            ? (body.panelChannelId as string | null)
            : undefined,
        ticketCategoryId:
          body.ticketCategoryId !== undefined
            ? (body.ticketCategoryId as string | null)
            : undefined,
        handlerRoleIds: Array.isArray(body.handlerRoleIds)
          ? (body.handlerRoleIds as string[])
          : undefined,
        logChannelId:
          body.logChannelId !== undefined
            ? (body.logChannelId as string | null)
            : undefined,
        formFields: Array.isArray(body.formFields)
          ? (body.formFields as never[])
          : undefined,
        maxOpenPerUser:
          typeof body.maxOpenPerUser === 'number'
            ? body.maxOpenPerUser
            : undefined,
        greetingMessage:
          typeof body.greetingMessage === 'string'
            ? body.greetingMessage
            : undefined,
        requireCategory:
          typeof body.requireCategory === 'boolean'
            ? body.requireCategory
            : undefined,
        ticketCategories: Array.isArray(body.ticketCategories)
          ? (body.ticketCategories as never[])
          : undefined,
      });

      const version = await getEchoWorkspaceVersionForServers(pool, [sid]);
      publishEchoWorkspaceEvent(
        fastify,
        { kind: 'server_updated', version, serverId: sid },
        { serverId: sid },
      );

      return reply.send(updated);
    },
  );

  // ─── Create ticket (any member) ────────────────────────────────────────────
  fastify.post<{ Params: { serverId: string }; Body: Record<string, unknown> }>(
    '/servers/:serverId/tickets',
    { preHandler: [requireAuth, requireEchoStore] },
    async (req, reply) => {
      const pool = echoPool(req);
      const sid = trimEchoPathParam(req.params.serverId);
      const uid = getAuthUser(req).id;

      const okMem = await isMemberOfServer(pool, sid, uid);
      if (!okMem) {
        return sendError(reply, 403, 'FORBIDDEN', 'Not a server member');
      }

      const body = req.body;
      if (!body || typeof body !== 'object') {
        return sendError(reply, 400, 'INVALID_BODY', 'Invalid body');
      }

      const subject =
        typeof body.subject === 'string' ? body.subject.trim() : '';
      if (!subject || subject.length > 200) {
        return sendError(
          reply,
          400,
          'INVALID_BODY',
          'Subject is required (max 200 chars)',
        );
      }

      const category = typeof body.category === 'string' ? body.category : null;

      const result = await createEchoTicket(pool, sid, uid, {
        subject,
        category,
        answers: body.answers,
      });

      if (!result.ok) {
        const statusMap: Record<string, number> = {
          disabled: 403,
          max_open_reached: 429,
          missing_category: 400,
          invalid_category: 400,
          no_ticket_category: 500,
          channel_create_failed: 500,
        };
        return sendError(
          reply,
          statusMap[result.reason] ?? 400,
          'TICKET_CREATE_FAILED',
          result.reason,
        );
      }

      const version = await getEchoWorkspaceVersionForServers(pool, [sid]);
      publishEchoWorkspaceEvent(
        fastify,
        {
          kind: 'ticket_created',
          version,
          serverId: sid,
          ticketEvent: {
            ticketId: result.ticket.id,
            channelId: result.ticket.channelId,
            authorId: result.ticket.authorId,
            subject: result.ticket.subject,
            status: result.ticket.status,
          },
        },
        { serverId: sid },
      );

      // Also emit channel_tree_changed so clients pick up the new channel
      publishEchoWorkspaceEvent(
        fastify,
        { kind: 'channel_tree_changed', version, serverId: sid },
        { serverId: sid },
      );

      return reply.status(201).send(result.ticket);
    },
  );

  // ─── List tickets (handlers only, or own tickets) ──────────────────────────
  fastify.get<{
    Params: { serverId: string };
    Querystring: { status?: string; mine?: string };
  }>(
    '/servers/:serverId/tickets',
    { preHandler: [requireAuth, requireEchoStore] },
    async (req, reply) => {
      const pool = echoPool(req);
      const sid = trimEchoPathParam(req.params.serverId);
      const uid = getAuthUser(req).id;

      const okMem = await isMemberOfServer(pool, sid, uid);
      if (!okMem) {
        return sendError(reply, 403, 'FORBIDDEN', 'Not a server member');
      }

      const isMine = req.query.mine === 'true';
      const handler = await isTicketHandler(pool, sid, uid);

      if (!isMine && !handler) {
        return sendError(
          reply,
          403,
          'FORBIDDEN',
          'Only ticket handlers can list all tickets',
        );
      }

      const status = req.query.status as EchoTicketStatus | undefined;
      const validStatuses = ['open', 'in_progress', 'resolved', 'closed'];
      const statusFilter =
        status && validStatuses.includes(status) ? status : undefined;

      const tickets = await listEchoTicketsForServer(pool, sid, {
        status: statusFilter,
        authorId: isMine ? uid : undefined,
      });

      return reply.send({ tickets });
    },
  );

  // ─── Get single ticket ─────────────────────────────────────────────────────
  fastify.get<{ Params: { serverId: string; ticketId: string } }>(
    '/servers/:serverId/tickets/:ticketId',
    { preHandler: [requireAuth, requireEchoStore] },
    async (req, reply) => {
      const pool = echoPool(req);
      const sid = trimEchoPathParam(req.params.serverId);
      const tid = trimEchoPathParam(req.params.ticketId);
      const uid = getAuthUser(req).id;

      const ticket = await getEchoTicketById(pool, tid);
      if (!ticket || ticket.serverId !== sid) {
        return sendError(reply, 404, 'NOT_FOUND', 'Ticket not found');
      }

      const isAuthor = ticket.authorId === uid;
      const handler = await isTicketHandler(pool, sid, uid);
      if (!isAuthor && !handler) {
        return sendError(reply, 403, 'FORBIDDEN', 'Access denied');
      }

      return reply.send(ticket);
    },
  );

  // ─── Get ticket by channel ID ──────────────────────────────────────────────
  fastify.get<{ Params: { serverId: string; channelId: string } }>(
    '/servers/:serverId/ticket-by-channel/:channelId',
    { preHandler: [requireAuth, requireEchoStore] },
    async (req, reply) => {
      const pool = echoPool(req);
      const sid = trimEchoPathParam(req.params.serverId);
      const cid = trimEchoPathParam(req.params.channelId);
      const uid = getAuthUser(req).id;

      const okMem = await isMemberOfServer(pool, sid, uid);
      if (!okMem) {
        return sendError(reply, 403, 'FORBIDDEN', 'Not a server member');
      }

      const ticket = await getEchoTicketByChannelId(pool, cid);
      if (!ticket || ticket.serverId !== sid) {
        return sendError(reply, 404, 'NOT_FOUND', 'Not a ticket channel');
      }

      return reply.send(ticket);
    },
  );

  // ─── Update ticket status ──────────────────────────────────────────────────
  fastify.patch<{
    Params: { serverId: string; ticketId: string };
    Body: Record<string, unknown>;
  }>(
    '/servers/:serverId/tickets/:ticketId',
    { preHandler: [requireAuth, requireEchoStore] },
    async (req, reply) => {
      const pool = echoPool(req);
      const sid = trimEchoPathParam(req.params.serverId);
      const tid = trimEchoPathParam(req.params.ticketId);
      const uid = getAuthUser(req).id;

      const ticket = await getEchoTicketById(pool, tid);
      if (!ticket || ticket.serverId !== sid) {
        return sendError(reply, 404, 'NOT_FOUND', 'Ticket not found');
      }

      const isAuthor = ticket.authorId === uid;
      const handler = await isTicketHandler(pool, sid, uid);
      if (!isAuthor && !handler) {
        return sendError(reply, 403, 'FORBIDDEN', 'Access denied');
      }

      const body = req.body;

      // Handle status change
      if (typeof body?.status === 'string') {
        if (!handler && body.status !== 'closed') {
          return sendError(
            reply,
            403,
            'FORBIDDEN',
            'Only handlers can change ticket status',
          );
        }

        const result = await updateEchoTicketStatus(
          pool,
          sid,
          tid,
          uid,
          body.status as EchoTicketStatus,
        );
        if (!result.ok) {
          return sendError(reply, 400, 'TICKET_UPDATE_FAILED', result.reason);
        }

        const version = await getEchoWorkspaceVersionForServers(pool, [sid]);
        publishEchoWorkspaceEvent(
          fastify,
          {
            kind: 'ticket_updated',
            version,
            serverId: sid,
            ticketEvent: {
              ticketId: result.ticket.id,
              channelId: result.ticket.channelId,
              authorId: result.ticket.authorId,
              subject: result.ticket.subject,
              status: result.ticket.status,
              assignedTo: result.ticket.assignedTo,
            },
          },
          { serverId: sid },
        );

        return reply.send(result.ticket);
      }

      // Handle assignment change
      if (body?.assignedTo !== undefined) {
        if (!handler) {
          return sendError(
            reply,
            403,
            'FORBIDDEN',
            'Only handlers can assign tickets',
          );
        }
        const assigneeId =
          typeof body.assignedTo === 'string' ? body.assignedTo : null;
        const result = await assignEchoTicket(pool, sid, tid, assigneeId);
        if (!result.ok) {
          return sendError(reply, 400, 'TICKET_UPDATE_FAILED', result.reason);
        }

        const version = await getEchoWorkspaceVersionForServers(pool, [sid]);
        publishEchoWorkspaceEvent(
          fastify,
          {
            kind: 'ticket_updated',
            version,
            serverId: sid,
            ticketEvent: {
              ticketId: result.ticket.id,
              channelId: result.ticket.channelId,
              authorId: result.ticket.authorId,
              subject: result.ticket.subject,
              status: result.ticket.status,
              assignedTo: result.ticket.assignedTo,
            },
          },
          { serverId: sid },
        );

        return reply.send(result.ticket);
      }

      return sendError(reply, 400, 'INVALID_BODY', 'Nothing to update');
    },
  );

  // ─── Delete ticket ─────────────────────────────────────────────────────────
  fastify.delete<{ Params: { serverId: string; ticketId: string } }>(
    '/servers/:serverId/tickets/:ticketId',
    { preHandler: [requireAuth, requireEchoStore] },
    async (req, reply) => {
      const pool = echoPool(req);
      const sid = trimEchoPathParam(req.params.serverId);
      const tid = trimEchoPathParam(req.params.ticketId);
      const uid = getAuthUser(req).id;

      if (!(await canManageTickets(pool, sid, uid))) {
        return sendError(reply, 403, 'FORBIDDEN', 'Missing MANAGE_TICKETS');
      }

      const ok = await deleteEchoTicket(pool, sid, tid);
      if (!ok) {
        return sendError(reply, 404, 'NOT_FOUND', 'Ticket not found');
      }

      const version = await getEchoWorkspaceVersionForServers(pool, [sid]);
      publishEchoWorkspaceEvent(
        fastify,
        { kind: 'channel_tree_changed', version, serverId: sid },
        { serverId: sid },
      );

      return reply.status(204).send();
    },
  );
}
