import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { getAuthUser, requireAuth } from '../../../auth/middleware';
import { ECHO_MSG_NOT_SERVER_MEMBER, sendError } from '../../errors';
import {
  applyEchoCategoryPlacement,
  createEchoCategory,
  deleteEchoCategory,
  getEchoCategoryPermissionOverridesPrevious,
  getMergedRolePermissions,
  insertEchoAudit,
  listEchoCategories,
  listEchoCategoryPermissionOverwrites,
  replaceEchoCategoryPermissionOverwrites,
  updateEchoCategory,
  updateEchoCategoryPermissionOverrides,
} from '../../../domain/echoStore';
import { isMemberOfServer } from '../../../domain/echoPermissions';
import { publishEchoWorkspaceEvent } from '../../../platform/echoPlatformEvents';
import {
  echoPool,
  parsePermissionOverwriteRowsBody,
  requireEchoStore,
  trimEchoPathParam,
} from './echoRouteUtils';

export default async function echoCategoriesRoutes(
  fastify: FastifyInstance,
  _opts: FastifyPluginOptions,
): Promise<void> {
  fastify.patch<{
    Params: { serverId: string };
    Body: { categoryId?: string; permissionOverrides?: unknown };
  }>(
    '/servers/:serverId/category-permission-overrides',
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
      const categoryId =
        typeof req.body?.categoryId === 'string'
          ? req.body.categoryId.trim()
          : '';
      if (!categoryId)
        return sendError(reply, 400, 'INVALID_BODY', 'categoryId required');
      const raw = req.body?.permissionOverrides;
      let permissionOverrides: Record<string, unknown> | null = null;
      if (raw === null || raw === undefined) {
        permissionOverrides = null;
      } else if (typeof raw === 'object' && !Array.isArray(raw)) {
        permissionOverrides = raw as Record<string, unknown>;
      } else {
        return sendError(
          reply,
          400,
          'INVALID_BODY',
          'permissionOverrides must be an object or null',
        );
      }
      const prevCat = await getEchoCategoryPermissionOverridesPrevious(
        pool,
        sid,
        categoryId,
      );

      const r = await updateEchoCategoryPermissionOverrides(
        pool,
        sid,
        getAuthUser(req).id,
        categoryId,
        permissionOverrides,
      );
      if (r === 'forbidden')
        return sendError(
          reply,
          403,
          'FORBIDDEN',
          'You cannot edit category permissions',
        );
      if (r === 'not_found')
        return sendError(
          reply,
          404,
          'NOT_FOUND',
          'Category not found on this server',
        );
      if (r === 'invalid_body')
        return sendError(
          reply,
          400,
          'INVALID_BODY',
          'Invalid category or body',
        );
      const auditId = await insertEchoAudit(
        pool,
        sid,
        getAuthUser(req).id,
        'category.permission_overrides',
        'category',
        categoryId,
        {
          previous: prevCat,
          current: permissionOverrides,
        },
      );
      publishEchoWorkspaceEvent(
        fastify,
        { kind: 'permission_invalidated', version: auditId, serverId: sid },
        { serverId: sid },
      );
      return reply.code(204).send();
    },
  );

  fastify.get<{ Params: { serverId: string } }>(
    '/servers/:serverId/categories',
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
      const categories = await listEchoCategories(pool, sid);
      return reply.code(200).send({ categories });
    },
  );

  fastify.post<{
    Params: { serverId: string };
    Body: { name?: string; position?: number };
  }>(
    '/servers/:serverId/categories',
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
      const r = await createEchoCategory(pool, sid, getAuthUser(req).id, {
        name: typeof req.body?.name === 'string' ? req.body.name : '',
        position: req.body?.position,
      });
      if (r === 'forbidden')
        return sendError(
          reply,
          403,
          'FORBIDDEN',
          'Not allowed to create categories',
        );
      if (r === 'invalid_body')
        return sendError(reply, 400, 'INVALID_BODY', 'Invalid category name');
      if (r === 'duplicate_name')
        return sendError(
          reply,
          409,
          'DUPLICATE',
          'Category name already exists',
        );
      const auditId = await insertEchoAudit(
        pool,
        sid,
        getAuthUser(req).id,
        'category.create',
        'category',
        r.categoryId,
        {},
      );
      publishEchoWorkspaceEvent(
        fastify,
        { kind: 'channel_tree_changed', version: auditId, serverId: sid },
        { serverId: sid },
      );
      return reply.code(201).send({ categoryId: r.categoryId });
    },
  );

  fastify.patch<{
    Params: { serverId: string; categoryId: string };
    Body: {
      name?: string;
      position?: number;
      siblingIndex?: number;
      autoDeleteAfterSeconds?: number | null;
    };
  }>(
    '/servers/:serverId/categories/:categoryId',
    { preHandler: [requireAuth, requireEchoStore] },
    async (req, reply) => {
      const pool = echoPool(req);
      const sid = trimEchoPathParam(req.params.serverId);
      const categoryId = trimEchoPathParam(req.params.categoryId);
      const okMem = await isMemberOfServer(pool, sid, getAuthUser(req).id);
      if (!okMem)
        return sendError(
          reply,
          403,
          'FORBIDDEN',
          ECHO_MSG_NOT_SERVER_MEMBER,
          'NOT_SERVER_MEMBER',
        );
      const b = req.body ?? {};
      const hasSibling =
        typeof b.siblingIndex === 'number' && Number.isFinite(b.siblingIndex);

      if (hasSibling) {
        const sr = await applyEchoCategoryPlacement(
          pool,
          sid,
          getAuthUser(req).id,
          categoryId,
          Math.floor(b.siblingIndex as number),
        );
        if (sr === 'forbidden')
          return sendError(
            reply,
            403,
            'FORBIDDEN',
            'Not allowed to edit categories',
          );
        if (sr === 'not_found')
          return sendError(reply, 404, 'NOT_FOUND', 'Category not found');
        if (sr === 'invalid_body')
          return sendError(reply, 400, 'INVALID_BODY', 'Invalid body');
      }

      const namePatch =
        typeof b.name === 'string' ? (b.name as string) : undefined;
      const positionPatch =
        !hasSibling && typeof b.position === 'number'
          ? (b.position as number)
          : undefined;
      const autoDeletePatch =
        'autoDeleteAfterSeconds' in b ? b.autoDeleteAfterSeconds : undefined;

      if (
        namePatch !== undefined ||
        positionPatch !== undefined ||
        autoDeletePatch !== undefined
      ) {
        const r = await updateEchoCategory(
          pool,
          sid,
          getAuthUser(req).id,
          categoryId,
          {
            name: namePatch,
            position: positionPatch,
            ...(autoDeletePatch !== undefined
              ? { autoDeleteAfterSeconds: autoDeletePatch }
              : {}),
          },
        );
        if (r === 'forbidden')
          return sendError(
            reply,
            403,
            'FORBIDDEN',
            'Not allowed to edit categories',
          );
        if (r === 'not_found')
          return sendError(reply, 404, 'NOT_FOUND', 'Category not found');
        if (r === 'invalid_body')
          return sendError(reply, 400, 'INVALID_BODY', 'Invalid body');
        if (r === 'duplicate_name')
          return sendError(
            reply,
            409,
            'DUPLICATE',
            'Category name already exists',
          );
      } else if (!hasSibling) {
        const r = await updateEchoCategory(
          pool,
          sid,
          getAuthUser(req).id,
          categoryId,
          {},
        );
        if (r === 'forbidden')
          return sendError(
            reply,
            403,
            'FORBIDDEN',
            'Not allowed to edit categories',
          );
        if (r === 'not_found')
          return sendError(reply, 404, 'NOT_FOUND', 'Category not found');
        if (r === 'invalid_body')
          return sendError(reply, 400, 'INVALID_BODY', 'Invalid body');
        if (r === 'duplicate_name')
          return sendError(
            reply,
            409,
            'DUPLICATE',
            'Category name already exists',
          );
      }

      const auditId = await insertEchoAudit(
        pool,
        sid,
        getAuthUser(req).id,
        'category.update',
        'category',
        categoryId,
        req.body ?? {},
      );
      publishEchoWorkspaceEvent(
        fastify,
        { kind: 'channel_tree_changed', version: auditId, serverId: sid },
        { serverId: sid },
      );
      return reply.code(204).send();
    },
  );

  fastify.delete<{ Params: { serverId: string; categoryId: string } }>(
    '/servers/:serverId/categories/:categoryId',
    { preHandler: [requireAuth, requireEchoStore] },
    async (req, reply) => {
      const pool = echoPool(req);
      const sid = trimEchoPathParam(req.params.serverId);
      const categoryId = trimEchoPathParam(req.params.categoryId);
      const okMem = await isMemberOfServer(pool, sid, getAuthUser(req).id);
      if (!okMem)
        return sendError(
          reply,
          403,
          'FORBIDDEN',
          ECHO_MSG_NOT_SERVER_MEMBER,
          'NOT_SERVER_MEMBER',
        );
      const r = await deleteEchoCategory(
        pool,
        sid,
        getAuthUser(req).id,
        categoryId,
      );
      if (r === 'forbidden')
        return sendError(
          reply,
          403,
          'FORBIDDEN',
          'Not allowed to delete categories',
        );
      if (r === 'not_found')
        return sendError(reply, 404, 'NOT_FOUND', 'Category not found');
      const auditId = await insertEchoAudit(
        pool,
        sid,
        getAuthUser(req).id,
        'category.delete',
        'category',
        categoryId,
        {},
      );
      publishEchoWorkspaceEvent(
        fastify,
        { kind: 'channel_tree_changed', version: auditId, serverId: sid },
        { serverId: sid },
      );
      return reply.code(204).send();
    },
  );

  fastify.get<{ Params: { serverId: string; categoryId: string } }>(
    '/servers/:serverId/categories/:categoryId/permission-overwrites',
    { preHandler: [requireAuth, requireEchoStore] },
    async (req, reply) => {
      const pool = echoPool(req);
      const sid = trimEchoPathParam(req.params.serverId);
      const categoryId = trimEchoPathParam(req.params.categoryId);
      const okMem = await isMemberOfServer(pool, sid, getAuthUser(req).id);
      if (!okMem)
        return sendError(
          reply,
          403,
          'FORBIDDEN',
          ECHO_MSG_NOT_SERVER_MEMBER,
          'NOT_SERVER_MEMBER',
        );
      const gate = await getMergedRolePermissions(
        pool,
        sid,
        getAuthUser(req).id,
      );
      if (!gate.has('MANAGE_ROLES') && !gate.has('MANAGE_GUILD')) {
        return sendError(
          reply,
          403,
          'FORBIDDEN',
          'You cannot view category permission overwrites',
        );
      }
      const rows = await listEchoCategoryPermissionOverwrites(
        pool,
        sid,
        categoryId,
      );
      return reply.code(200).send({ rows });
    },
  );

  fastify.put<{
    Params: { serverId: string; categoryId: string };
    Body: { rows?: unknown };
  }>(
    '/servers/:serverId/categories/:categoryId/permission-overwrites',
    { preHandler: [requireAuth, requireEchoStore] },
    async (req, reply) => {
      const pool = echoPool(req);
      const sid = trimEchoPathParam(req.params.serverId);
      const categoryId = trimEchoPathParam(req.params.categoryId);
      const okMem = await isMemberOfServer(pool, sid, getAuthUser(req).id);
      if (!okMem)
        return sendError(
          reply,
          403,
          'FORBIDDEN',
          ECHO_MSG_NOT_SERVER_MEMBER,
          'NOT_SERVER_MEMBER',
        );
      const parsed = parsePermissionOverwriteRowsBody(req.body?.rows);
      if (parsed === undefined)
        return sendError(reply, 400, 'INVALID_BODY', 'rows must be an array');
      let r: Awaited<
        ReturnType<typeof replaceEchoCategoryPermissionOverwrites>
      >;
      try {
        r = await replaceEchoCategoryPermissionOverwrites(
          pool,
          sid,
          getAuthUser(req).id,
          categoryId,
          parsed,
        );
      } catch {
        return sendError(
          reply,
          500,
          'SERVER_ERROR',
          'Failed to save permission overwrites',
        );
      }
      if (r === 'forbidden')
        return sendError(
          reply,
          403,
          'FORBIDDEN',
          'You cannot edit category permissions',
        );
      if (r === 'not_found')
        return sendError(reply, 404, 'NOT_FOUND', 'Category not found');
      if (r === 'invalid_body')
        return sendError(reply, 400, 'INVALID_BODY', 'Invalid overwrites');
      const auditId = await insertEchoAudit(
        pool,
        sid,
        getAuthUser(req).id,
        'category.permission_overwrites',
        'category',
        categoryId,
        {
          rowCount: parsed.length,
        },
      );
      publishEchoWorkspaceEvent(
        fastify,
        { kind: 'permission_invalidated', version: auditId, serverId: sid },
        { serverId: sid },
      );
      return reply.code(204).send();
    },
  );
}
