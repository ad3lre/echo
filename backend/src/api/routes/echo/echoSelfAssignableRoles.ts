import type { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { requireAuth, getAuthUser } from '../../../auth/middleware';
import { sendError } from '../../errors';
import {
  canManageSelfRolesConfig,
  getEchoSelfRolesConfig,
  resolveEchoSelfRolesPanel,
  toggleSelfAssignableMemberRole,
  updateEchoSelfRolesConfig,
} from '../../../domain/echoStore';
import { isMemberOfServer } from '../../../domain/echoPermissions';
import {
  echoPool,
  requireEchoStore,
  trimEchoPathParam,
} from './echoRouteUtils';
import type { SelfRolesCustomCategory } from '../../../../../shared/types/selfAssignableRoles';

function parseCustomCategories(raw: unknown): SelfRolesCustomCategory[] | null {
  if (!Array.isArray(raw)) return null;
  const out: SelfRolesCustomCategory[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') return null;
    const o = item as Record<string, unknown>;
    if (typeof o.id !== 'string' || typeof o.name !== 'string') return null;
    if (typeof o.position !== 'number') return null;
    if (o.roleIds != null && !Array.isArray(o.roleIds)) return null;
    if (o.roleIds != null && o.roleIds.some((x) => typeof x !== 'string')) {
      return null;
    }
    if (o.randomEligible != null && typeof o.randomEligible !== 'boolean') {
      return null;
    }
    out.push({
      id: o.id.trim(),
      name: o.name.trim(),
      position: o.position,
      roleIds: Array.isArray(o.roleIds)
        ? o.roleIds.map((x) => String(x).trim()).filter(Boolean)
        : [],
      randomEligible: o.randomEligible === true,
    });
  }
  return out;
}

export default async function echoSelfAssignableRolesRoutes(
  fastify: FastifyInstance,
  _opts: FastifyPluginOptions,
): Promise<void> {
  fastify.get<{ Params: { serverId: string } }>(
    '/servers/:serverId/self-roles-config',
    { preHandler: [requireAuth, requireEchoStore] },
    async (req, reply) => {
      const pool = echoPool(req);
      const sid = trimEchoPathParam(req.params.serverId);
      const okMem = await isMemberOfServer(pool, sid, getAuthUser(req).id);
      if (!okMem) {
        return sendError(reply, 403, 'FORBIDDEN', 'Not a server member');
      }
      return reply.send(await getEchoSelfRolesConfig(pool, sid));
    },
  );

  fastify.patch<{
    Params: { serverId: string };
    Body: Record<string, unknown>;
  }>(
    '/servers/:serverId/self-roles-config',
    { preHandler: [requireAuth, requireEchoStore] },
    async (req, reply) => {
      const pool = echoPool(req);
      const sid = trimEchoPathParam(req.params.serverId);
      const uid = getAuthUser(req).id;
      if (!(await canManageSelfRolesConfig(pool, sid, uid))) {
        return sendError(reply, 403, 'FORBIDDEN', 'Missing MANAGE_ROLES');
      }
      const body = req.body;
      if (!body || typeof body !== 'object') {
        return sendError(reply, 400, 'INVALID_BODY', 'Invalid body');
      }
      let customCategories: SelfRolesCustomCategory[] | undefined;
      if (body.customCategories !== undefined) {
        const parsed = parseCustomCategories(body.customCategories);
        if (!parsed) {
          return sendError(
            reply,
            400,
            'INVALID_BODY',
            'Invalid customCategories',
          );
        }
        customCategories = parsed;
      }
      const updated = await updateEchoSelfRolesConfig(pool, sid, {
        enabled: typeof body.enabled === 'boolean' ? body.enabled : undefined,
        panelChannelId:
          body.panelChannelId !== undefined
            ? (body.panelChannelId as string | null)
            : undefined,
        customCategories,
      });
      return reply.send(updated);
    },
  );

  fastify.get<{ Params: { serverId: string } }>(
    '/servers/:serverId/self-roles-panel',
    { preHandler: [requireAuth, requireEchoStore] },
    async (req, reply) => {
      const pool = echoPool(req);
      const sid = trimEchoPathParam(req.params.serverId);
      const uid = getAuthUser(req).id;
      const okMem = await isMemberOfServer(pool, sid, uid);
      if (!okMem) {
        return sendError(reply, 403, 'FORBIDDEN', 'Not a server member');
      }
      const config = await getEchoSelfRolesConfig(pool, sid);
      if (!config.enabled) {
        return reply.send({ categories: [], assignedRoleIds: [] });
      }
      return reply.send(await resolveEchoSelfRolesPanel(pool, sid, uid));
    },
  );

  fastify.post<{
    Params: { serverId: string };
    Body: { roleId?: unknown; assign?: unknown };
  }>(
    '/servers/:serverId/self-roles/toggle',
    { preHandler: [requireAuth, requireEchoStore] },
    async (req, reply) => {
      const pool = echoPool(req);
      const sid = trimEchoPathParam(req.params.serverId);
      const uid = getAuthUser(req).id;
      const okMem = await isMemberOfServer(pool, sid, uid);
      if (!okMem) {
        return sendError(reply, 403, 'FORBIDDEN', 'Not a server member');
      }
      const roleId =
        typeof req.body?.roleId === 'string' ? req.body.roleId.trim() : '';
      const assign = req.body?.assign === true;
      if (!roleId || typeof req.body?.assign !== 'boolean') {
        return sendError(
          reply,
          400,
          'INVALID_BODY',
          'roleId and assign required',
        );
      }
      const r = await toggleSelfAssignableMemberRole(
        pool,
        sid,
        uid,
        roleId,
        assign,
      );
      if (r === 'disabled') {
        return sendError(reply, 403, 'FORBIDDEN', 'Self-assign roles disabled');
      }
      if (r === 'forbidden') {
        return sendError(
          reply,
          403,
          'FORBIDDEN',
          'You cannot assign this role to yourself',
        );
      }
      if (r === 'not_member') {
        return sendError(reply, 403, 'FORBIDDEN', 'Not a server member');
      }
      if (r === 'invalid_role' || r === 'not_self_selectable') {
        return sendError(
          reply,
          400,
          'INVALID_ROLE',
          'Role is not self-selectable',
        );
      }
      if (r === 'not_exposed') {
        return sendError(
          reply,
          400,
          'NOT_EXPOSED',
          'Role is not available in the self-assign channel',
        );
      }
      if (r === 'unchanged') {
        return reply.code(204).send();
      }
      const panel = await resolveEchoSelfRolesPanel(pool, sid, uid);
      return reply.send(panel);
    },
  );
}
