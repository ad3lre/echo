import { FastifyInstance, FastifyPluginOptions, FastifyRequest } from 'fastify';
import { getAuthUser, requireAuth } from '../../../auth/middleware';
import { ECHO_MSG_NOT_SERVER_MEMBER, sendError } from '../../errors';
import {
  assignEchoMemberRole,
  createEchoRole,
  createEchoRoleCategory,
  deleteEchoRole,
  deleteEchoRoleCategory,
  echoAuthorityRoleIdsForServer,
  getEchoRoleAuditMeta,
  getEchoRoleMetadataDisplay,
  getEchoRolePermissionsColumn,
  getEchoServerCapabilitiesForUser,
  insertEchoAudit,
  listEchoMemberRoleAssignmentsByUser,
  listEchoRoleLinksForServer,
  listEchoRoleCategories,
  listEchoRolesForServer,
  listEchoServerMembers,
  removeEchoMemberRole,
  replaceEchoRoleCategoryOrder,
  replaceEchoRoleLinksFromAnchor,
  replaceEchoServerRoleOrder,
  replaceEchoRoleOrderInCategory,
  updateEchoRole,
  updateEchoRoleCategory,
  withoutEchoAuthorityAssignments,
} from '../../../domain/echoStore';
import { isMemberOfServer } from '../../../domain/echoPermissions';
import { publishEchoWorkspaceEvent } from '../../../platform/echoPlatformEvents';
import {
  evictAllUsersFromEchoServerChannelRealtimeScopes,
  evictUserFromEchoServerRealtimeScopes,
} from '../../../platform/echoRealtimeMembership';
import { ECHO_ADMIN_MUTATION_RATE_LIMIT } from './echoMutationRateLimits';
import {
  echoPool,
  requireEchoStore,
  trimEchoPathParam,
} from './echoRouteUtils';

export default async function echoRolesRoutes(
  fastify: FastifyInstance,
  _opts: FastifyPluginOptions,
): Promise<void> {
  const roleMutationOpts = {
    config: { rateLimit: ECHO_ADMIN_MUTATION_RATE_LIMIT },
  } as const;

  function rolesReadRateLimitKey(req: FastifyRequest): string {
    return req.authUser?.id ? `uid:${req.authUser.id}` : `ip:${req.ip}`;
  }

  /** One round trip for layout role UI (replaces parallel capabilities + roles + member-role-assignments). */
  fastify.get<{ Params: { serverId: string } }>(
    '/servers/:serverId/role-ui-bootstrap',
    {
      preHandler: [requireAuth, requireEchoStore],
      config: {
        rateLimit: {
          max: 20,
          timeWindow: '1 minute',
          keyGenerator: rolesReadRateLimitKey,
        },
      },
    },
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
      const capabilities = await getEchoServerCapabilitiesForUser(
        pool,
        sid,
        getAuthUser(req).id,
      );
      const canReadGlobalRoleGraph =
        capabilities.canManageRoles || capabilities.canManageServer;
      const [roles, assignmentsRaw, roleLinks, roleCategories] =
        await Promise.all([
          listEchoRolesForServer(pool, sid, {
            includeAuthorityRoles: capabilities.canManageRoles,
          }),
          listEchoMemberRoleAssignmentsByUser(pool, sid),
          canReadGlobalRoleGraph
            ? listEchoRoleLinksForServer(pool, sid)
            : Promise.resolve([]),
          canReadGlobalRoleGraph
            ? listEchoRoleCategories(pool, sid)
            : Promise.resolve([]),
        ]);
      let assignments = assignmentsRaw;
      if (!capabilities.canManageRoles) {
        // Members without Manage Roles should not receive authority role assignments.
        const authIds = await echoAuthorityRoleIdsForServer(pool, sid);
        assignments = withoutEchoAuthorityAssignments(assignmentsRaw, authIds);
      }
      return reply.code(200).send({
        capabilities,
        roles,
        assignments,
        roleLinks,
        roleCategories,
      });
    },
  );

  fastify.get<{ Params: { serverId: string } }>(
    '/servers/:serverId/role-links',
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
      const roleLinks = await listEchoRoleLinksForServer(pool, sid);
      return reply.code(200).send({ roleLinks });
    },
  );

  fastify.get<{ Params: { serverId: string } }>(
    '/servers/:serverId/roles',
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
      const caps = await getEchoServerCapabilitiesForUser(
        pool,
        sid,
        getAuthUser(req).id,
      );
      const roles = await listEchoRolesForServer(pool, sid, {
        includeAuthorityRoles: caps.canManageRoles,
      });
      return reply.code(200).send({ roles });
    },
  );

  fastify.get<{ Params: { serverId: string } }>(
    '/servers/:serverId/role-categories',
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
      const categories = await listEchoRoleCategories(pool, sid);
      return reply.code(200).send({ categories });
    },
  );

  fastify.post<{ Params: { serverId: string }; Body: { name?: unknown } }>(
    '/servers/:serverId/role-categories',
    { preHandler: [requireAuth, requireEchoStore], ...roleMutationOpts },
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
      const r = await createEchoRoleCategory(
        pool,
        sid,
        getAuthUser(req).id,
        req.body?.name,
      );
      if (r === 'forbidden')
        return sendError(
          reply,
          403,
          'FORBIDDEN',
          'You cannot manage role categories in this server',
        );
      if (r === 'invalid_body')
        return sendError(
          reply,
          400,
          'INVALID_BODY',
          'Invalid category name or limit reached',
        );
      return reply.code(201).send({ id: r.id });
    },
  );

  fastify.patch<{
    Params: { serverId: string; categoryId: string };
    Body: {
      name?: unknown;
      defaultPermissions?: unknown;
      defaultHoist?: unknown;
      defaultOnJoin?: unknown;
      defaultRoleScope?: unknown;
      defaultRoleType?: unknown;
      selfAssignableDefaults?: unknown;
    };
  }>(
    '/servers/:serverId/role-categories/:categoryId',
    { preHandler: [requireAuth, requireEchoStore], ...roleMutationOpts },
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
      const r = await updateEchoRoleCategory(
        pool,
        sid,
        getAuthUser(req).id,
        categoryId,
        {
          name: req.body?.name,
          defaultPermissions: req.body?.defaultPermissions,
          defaultHoist: req.body?.defaultHoist,
          defaultOnJoin: req.body?.defaultOnJoin,
          defaultRoleScope: req.body?.defaultRoleScope,
          defaultRoleType: req.body?.defaultRoleType,
          selfAssignableDefaults: req.body?.selfAssignableDefaults,
        },
      );
      if (r === 'forbidden')
        return sendError(
          reply,
          403,
          'FORBIDDEN',
          'You cannot manage role categories in this server',
        );
      if (r === 'not_found')
        return sendError(reply, 404, 'NOT_FOUND', 'Category not found');
      if (r === 'invalid_body')
        return sendError(reply, 400, 'INVALID_BODY', 'Invalid category name');
      return reply.code(204).send();
    },
  );

  fastify.delete<{ Params: { serverId: string; categoryId: string } }>(
    '/servers/:serverId/role-categories/:categoryId',
    { preHandler: [requireAuth, requireEchoStore], ...roleMutationOpts },
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
      const r = await deleteEchoRoleCategory(
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
          'You cannot manage role categories in this server',
        );
      if (r === 'not_found')
        return sendError(reply, 404, 'NOT_FOUND', 'Category not found');
      if (r === 'cannot_delete_system')
        return sendError(
          reply,
          400,
          'CANNOT_DELETE_SYSTEM_CATEGORY',
          'The Global Roles category cannot be deleted',
        );
      return reply.code(204).send();
    },
  );

  fastify.put<{
    Params: { serverId: string };
    Body: { categoryIds?: unknown };
  }>(
    '/servers/:serverId/role-categories/order',
    { preHandler: [requireAuth, requireEchoStore], ...roleMutationOpts },
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
      const raw = req.body?.categoryIds;
      if (!Array.isArray(raw) || raw.some((x) => typeof x !== 'string')) {
        return sendError(
          reply,
          400,
          'INVALID_BODY',
          'categoryIds array required',
        );
      }
      const categoryIds = raw.map((x) => String(x).trim()).filter(Boolean);
      const r = await replaceEchoRoleCategoryOrder(
        pool,
        sid,
        getAuthUser(req).id,
        categoryIds,
      );
      if (r === 'forbidden')
        return sendError(
          reply,
          403,
          'FORBIDDEN',
          'You cannot manage role categories in this server',
        );
      if (r === 'invalid_body')
        return sendError(reply, 400, 'INVALID_BODY', 'Invalid category order');
      return reply.code(204).send();
    },
  );

  fastify.post<{
    Params: { serverId: string };
    Body: {
      name?: string;
      color?: string;
      darkColor?: string;
      lightColor?: string;
      separateThemeColors?: boolean;
      permissions?: unknown;
      hoist?: boolean;
      defaultOnJoin?: boolean;
      roleCategoryId?: string | null;
      roleScope?: unknown;
      insertAfterRoleId?: string | null;
      roleIconUrl?: string | null;
      roleIconEmojiId?: string | null;
      roleType?: unknown;
      syncWithCategoryDefaults?: boolean;
    };
  }>(
    '/servers/:serverId/roles',
    { preHandler: [requireAuth, requireEchoStore], ...roleMutationOpts },
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
      const body = req.body ?? {};
      const r = await createEchoRole(pool, sid, getAuthUser(req).id, {
        name: typeof body.name === 'string' ? body.name.trim() : '',
        color: typeof body.color === 'string' ? body.color : undefined,
        darkColor:
          typeof body.darkColor === 'string' ? body.darkColor : undefined,
        lightColor:
          typeof body.lightColor === 'string' ? body.lightColor : undefined,
        separateThemeColors: body.separateThemeColors === true,
        permissions: body.permissions,
        hoist: body.hoist === true,
        defaultOnJoin: body.defaultOnJoin === true,
        roleCategoryId:
          body.roleCategoryId === null
            ? null
            : typeof body.roleCategoryId === 'string'
              ? body.roleCategoryId
              : undefined,
        roleIconUrl:
          body.roleIconUrl === null
            ? null
            : typeof body.roleIconUrl === 'string'
              ? body.roleIconUrl
              : undefined,
        roleIconEmojiId:
          body.roleIconEmojiId === null
            ? null
            : typeof body.roleIconEmojiId === 'string'
              ? body.roleIconEmojiId
              : undefined,
        roleScope: body.roleScope,
        insertAfterRoleId:
          body.insertAfterRoleId === null
            ? null
            : typeof body.insertAfterRoleId === 'string'
              ? body.insertAfterRoleId
              : undefined,
        roleType: body.roleType,
        syncWithCategoryDefaults:
          typeof body.syncWithCategoryDefaults === 'boolean'
            ? body.syncWithCategoryDefaults
            : undefined,
      });
      if (r === 'forbidden')
        return sendError(
          reply,
          403,
          'FORBIDDEN',
          'You cannot create roles in this server',
        );
      if (r === 'limit_reached')
        return sendError(
          reply,
          409,
          'ROLE_LIMIT_REACHED',
          'Servers can have at most 512 roles.',
        );
      if (r === 'invalid_body')
        return sendError(reply, 400, 'INVALID_BODY', 'Invalid role body');
      return reply.code(201).send(r);
    },
  );

  fastify.put<{
    Params: { serverId: string };
    Body: { roleIds?: unknown; categoryId?: unknown };
  }>(
    '/servers/:serverId/roles/order',
    { preHandler: [requireAuth, requireEchoStore], ...roleMutationOpts },
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
      const raw = req.body?.roleIds;
      if (!Array.isArray(raw) || raw.some((x) => typeof x !== 'string')) {
        return sendError(reply, 400, 'INVALID_BODY', 'roleIds array required');
      }
      const roleIds = raw.map((x) => String(x).trim()).filter(Boolean);
      const categoryIdRaw = req.body?.categoryId;
      const categoryId =
        typeof categoryIdRaw === 'string' ? categoryIdRaw.trim() : '';
      const r = categoryId
        ? await replaceEchoRoleOrderInCategory(
            pool,
            sid,
            getAuthUser(req).id,
            categoryId,
            roleIds,
          )
        : await replaceEchoServerRoleOrder(
            pool,
            sid,
            getAuthUser(req).id,
            roleIds,
          );
      if (r === 'forbidden')
        return sendError(
          reply,
          403,
          'FORBIDDEN',
          'You cannot edit roles in this server',
        );
      if (r === 'invalid_body')
        return sendError(reply, 400, 'INVALID_BODY', 'Invalid role order');
      await evictAllUsersFromEchoServerChannelRealtimeScopes(
        fastify,
        pool,
        sid,
      );
      const auditId = await insertEchoAudit(
        pool,
        sid,
        getAuthUser(req).id,
        'role.order_update',
        'server',
        sid,
        { roleIds },
      );
      publishEchoWorkspaceEvent(
        fastify,
        { kind: 'role_graph_changed', version: auditId, serverId: sid },
        { serverId: sid },
      );
      return reply.code(204).send();
    },
  );

  fastify.patch<{
    Params: { serverId: string; roleId: string };
    Body: {
      name?: string;
      color?: string;
      darkColor?: string;
      lightColor?: string;
      separateThemeColors?: boolean;
      hoist?: boolean;
      defaultOnJoin?: boolean;
      permissions?: unknown;
      roleCategoryId?: string | null;
      roleScope?: unknown;
      roleIconUrl?: string | null;
      roleIconEmojiId?: string | null;
      roleType?: unknown;
      syncWithCategoryDefaults?: boolean;
    };
  }>(
    '/servers/:serverId/roles/:roleId',
    { preHandler: [requireAuth, requireEchoStore], ...roleMutationOpts },
    async (req, reply) => {
      const pool = echoPool(req);
      const sid = trimEchoPathParam(req.params.serverId);
      const roleId = trimEchoPathParam(req.params.roleId);
      const b = req.body ?? {};
      const hasName = typeof b.name === 'string';
      const hasColor = typeof b.color === 'string';
      const hasDarkColor = typeof b.darkColor === 'string';
      const hasLightColor = typeof b.lightColor === 'string';
      const hasSeparateThemeColors = typeof b.separateThemeColors === 'boolean';
      const hasHoist = typeof b.hoist === 'boolean';
      const hasDefaultOnJoin = typeof b.defaultOnJoin === 'boolean';
      const hasPerms = b.permissions !== undefined;
      const hasRoleCategoryId = Object.prototype.hasOwnProperty.call(
        b,
        'roleCategoryId',
      );
      const hasRoleIconUrl = Object.prototype.hasOwnProperty.call(
        b,
        'roleIconUrl',
      );
      const hasRoleIconEmojiId = Object.prototype.hasOwnProperty.call(
        b,
        'roleIconEmojiId',
      );
      const hasRoleType = Object.prototype.hasOwnProperty.call(b, 'roleType');
      const hasRoleScope = Object.prototype.hasOwnProperty.call(b, 'roleScope');
      const hasSyncWithCategoryDefaults = Object.prototype.hasOwnProperty.call(
        b,
        'syncWithCategoryDefaults',
      );
      if (
        !hasName &&
        !hasColor &&
        !hasDarkColor &&
        !hasLightColor &&
        !hasSeparateThemeColors &&
        !hasHoist &&
        !hasDefaultOnJoin &&
        !hasPerms &&
        !hasRoleCategoryId &&
        !hasRoleScope &&
        !hasRoleIconUrl &&
        !hasRoleIconEmojiId &&
        !hasRoleType &&
        !hasSyncWithCategoryDefaults
      ) {
        return sendError(
          reply,
          400,
          'INVALID_BODY',
          'At least one of name, color, darkColor, lightColor, separateThemeColors, hoist, defaultOnJoin, permissions, roleCategoryId, roleScope, roleIconUrl, roleIconEmojiId, roleType, syncWithCategoryDefaults required',
        );
      }

      const prevRow = await getEchoRoleAuditMeta(pool, sid, roleId);
      if (!prevRow) return sendError(reply, 404, 'NOT_FOUND', 'Role not found');
      const prevPerms: string[] = Array.isArray(prevRow.permissions)
        ? prevRow.permissions.filter((p) => typeof p === 'string')
        : [];

      const patch: {
        name?: string;
        color?: string;
        darkColor?: string;
        lightColor?: string;
        separateThemeColors?: boolean;
        hoist?: boolean;
        defaultOnJoin?: boolean;
        permissions?: unknown;
        roleCategoryId?: string | null;
        roleScope?: unknown;
        roleIconUrl?: string | null;
        roleIconEmojiId?: string | null;
        roleType?: unknown;
        syncWithCategoryDefaults?: boolean;
      } = {};
      if (hasName) patch.name = b.name as string;
      if (hasColor) patch.color = b.color as string;
      if (hasDarkColor) patch.darkColor = b.darkColor as string;
      if (hasLightColor) patch.lightColor = b.lightColor as string;
      if (hasSeparateThemeColors)
        patch.separateThemeColors = b.separateThemeColors as boolean;
      if (hasHoist) patch.hoist = b.hoist as boolean;
      if (hasDefaultOnJoin) patch.defaultOnJoin = b.defaultOnJoin as boolean;
      if (hasPerms) patch.permissions = b.permissions;
      if (hasRoleCategoryId) {
        if (b.roleCategoryId === null) patch.roleCategoryId = null;
        else if (typeof b.roleCategoryId === 'string')
          patch.roleCategoryId = b.roleCategoryId;
        else
          return sendError(
            reply,
            400,
            'INVALID_BODY',
            'roleCategoryId must be string or null',
          );
      }
      if (hasRoleScope) patch.roleScope = b.roleScope;
      if (hasRoleIconUrl) {
        if (b.roleIconUrl === null) patch.roleIconUrl = null;
        else if (typeof b.roleIconUrl === 'string')
          patch.roleIconUrl = b.roleIconUrl;
        else
          return sendError(
            reply,
            400,
            'INVALID_BODY',
            'roleIconUrl must be string or null',
          );
      }
      if (hasRoleIconEmojiId) {
        if (b.roleIconEmojiId === null) patch.roleIconEmojiId = null;
        else if (typeof b.roleIconEmojiId === 'string')
          patch.roleIconEmojiId = b.roleIconEmojiId;
        else
          return sendError(
            reply,
            400,
            'INVALID_BODY',
            'roleIconEmojiId must be string or null',
          );
      }
      if (hasRoleType) {
        patch.roleType = b.roleType;
      }
      if (hasSyncWithCategoryDefaults) {
        if (typeof b.syncWithCategoryDefaults !== 'boolean')
          return sendError(
            reply,
            400,
            'INVALID_BODY',
            'syncWithCategoryDefaults must be boolean',
          );
        patch.syncWithCategoryDefaults = b.syncWithCategoryDefaults;
      }

      const r = await updateEchoRole(
        pool,
        sid,
        getAuthUser(req).id,
        roleId,
        patch,
      );
      if (r === 'forbidden')
        return sendError(
          reply,
          403,
          'FORBIDDEN',
          'You cannot edit roles in this server',
        );
      if (r === 'not_found')
        return sendError(reply, 404, 'NOT_FOUND', 'Role not found');
      if (r === 'invalid_body')
        return sendError(reply, 400, 'INVALID_BODY', 'Invalid role patch');

      if (hasPerms || hasRoleType) {
        await evictAllUsersFromEchoServerChannelRealtimeScopes(
          fastify,
          pool,
          sid,
        );
      }
      if (hasPerms) {
        const permsCol = await getEchoRolePermissionsColumn(pool, sid, roleId);
        const newPerms: string[] = Array.isArray(permsCol)
          ? (permsCol as string[])
          : [];
        const prevSet = new Set(prevPerms);
        const added = newPerms.filter((p) => !prevSet.has(p));
        const removed = prevPerms.filter((p) => !newPerms.includes(p));
        const auditId = await insertEchoAudit(
          pool,
          sid,
          getAuthUser(req).id,
          'role.permissions_update',
          'role',
          roleId,
          {
            permissionDiff: { added, removed },
          },
        );
        publishEchoWorkspaceEvent(
          fastify,
          { kind: 'permission_invalidated', version: auditId, serverId: sid },
          { serverId: sid },
        );
      }

      if (hasName || hasColor || hasHoist || hasDefaultOnJoin) {
        const after = await getEchoRoleMetadataDisplay(pool, sid, roleId);
        if (!after) return reply.code(204).send();
        await insertEchoAudit(
          pool,
          sid,
          getAuthUser(req).id,
          'role.metadata_update',
          'role',
          roleId,
          {
            before: {
              name: prevRow.name,
              color: prevRow.color,
              hoist: Boolean(prevRow.hoist),
              defaultOnJoin: Boolean(prevRow.default_on_join),
            },
            after: {
              name: after.name,
              color: after.color,
              hoist: Boolean(after.hoist),
              defaultOnJoin: Boolean(after.default_on_join),
            },
          },
        );
      }

      return reply.code(204).send();
    },
  );

  fastify.delete<{ Params: { serverId: string; roleId: string } }>(
    '/servers/:serverId/roles/:roleId',
    { preHandler: [requireAuth, requireEchoStore], ...roleMutationOpts },
    async (req, reply) => {
      const pool = echoPool(req);
      const sid = trimEchoPathParam(req.params.serverId);
      const roleId = trimEchoPathParam(req.params.roleId);
      const prevRow = await getEchoRoleAuditMeta(pool, sid, roleId);
      if (!prevRow) return sendError(reply, 404, 'NOT_FOUND', 'Role not found');
      const r = await deleteEchoRole(pool, sid, getAuthUser(req).id, roleId);
      if (r === 'forbidden')
        return sendError(
          reply,
          403,
          'FORBIDDEN',
          'You cannot edit roles in this server',
        );
      if (r === 'cannot_delete_everyone')
        return sendError(reply, 400, 'INVALID_BODY', 'Cannot delete @everyone');
      if (r === 'not_found')
        return sendError(reply, 404, 'NOT_FOUND', 'Role not found');
      await evictAllUsersFromEchoServerChannelRealtimeScopes(
        fastify,
        pool,
        sid,
      );
      const auditId = await insertEchoAudit(
        pool,
        sid,
        getAuthUser(req).id,
        'role.delete',
        'role',
        roleId,
        { name: prevRow.name },
      );
      publishEchoWorkspaceEvent(
        fastify,
        { kind: 'role_graph_changed', version: auditId, serverId: sid },
        { serverId: sid },
      );
      return reply.code(204).send();
    },
  );

  fastify.put<{
    Params: { serverId: string; roleId: string };
    Body: { links?: unknown };
  }>(
    '/servers/:serverId/roles/:roleId/links',
    { preHandler: [requireAuth, requireEchoStore], ...roleMutationOpts },
    async (req, reply) => {
      const pool = echoPool(req);
      const sid = trimEchoPathParam(req.params.serverId);
      const roleId = trimEchoPathParam(req.params.roleId);
      const raw = req.body?.links;
      if (!Array.isArray(raw)) {
        return sendError(reply, 400, 'INVALID_BODY', 'links array required');
      }
      const links: { linkedRoleId: string; twoWay: boolean }[] = [];
      for (const item of raw) {
        if (!item || typeof item !== 'object') {
          return sendError(reply, 400, 'INVALID_BODY', 'Invalid link entry');
        }
        const o = item as Record<string, unknown>;
        const linkedRoleId =
          typeof o.linkedRoleId === 'string' ? o.linkedRoleId.trim() : '';
        if (!linkedRoleId) {
          return sendError(reply, 400, 'INVALID_BODY', 'linkedRoleId required');
        }
        if (typeof o.twoWay !== 'boolean') {
          return sendError(
            reply,
            400,
            'INVALID_BODY',
            'twoWay boolean required',
          );
        }
        links.push({ linkedRoleId, twoWay: o.twoWay });
      }
      const r = await replaceEchoRoleLinksFromAnchor(
        pool,
        sid,
        getAuthUser(req).id,
        roleId,
        links,
      );
      if (r === 'forbidden')
        return sendError(
          reply,
          403,
          'FORBIDDEN',
          'You cannot edit roles in this server',
        );
      if (r === 'not_found')
        return sendError(reply, 404, 'NOT_FOUND', 'Role not found');
      if (r === 'invalid_body')
        return sendError(reply, 400, 'INVALID_BODY', 'Invalid role links');
      const auditId = await insertEchoAudit(
        pool,
        sid,
        getAuthUser(req).id,
        'role.links_update',
        'role',
        roleId,
        { links },
      );
      publishEchoWorkspaceEvent(
        fastify,
        { kind: 'role_graph_changed', version: auditId, serverId: sid },
        { serverId: sid },
      );
      return reply.code(204).send();
    },
  );

  fastify.get<{ Params: { serverId: string } }>(
    '/servers/:serverId/members',
    {
      preHandler: [requireAuth, requireEchoStore],
      config: {
        rateLimit: {
          max: 30,
          timeWindow: '1 minute',
          keyGenerator: rolesReadRateLimitKey,
        },
      },
    },
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
      const members = await listEchoServerMembers(pool, sid);
      return reply.code(200).send({ members });
    },
  );

  fastify.get<{ Params: { serverId: string } }>(
    '/servers/:serverId/member-role-assignments',
    {
      preHandler: [requireAuth, requireEchoStore],
      config: {
        rateLimit: {
          max: 30,
          timeWindow: '1 minute',
          keyGenerator: rolesReadRateLimitKey,
        },
      },
    },
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
      const caps = await getEchoServerCapabilitiesForUser(
        pool,
        sid,
        getAuthUser(req).id,
      );
      const raw = await listEchoMemberRoleAssignmentsByUser(pool, sid);
      let assignments = raw;
      if (!caps.canManageRoles) {
        const authIds = await echoAuthorityRoleIdsForServer(pool, sid);
        assignments = withoutEchoAuthorityAssignments(raw, authIds);
      }
      return reply.code(200).send({ assignments });
    },
  );

  fastify.post<{
    Params: { serverId: string; userId: string };
    Body: { roleId?: string };
  }>(
    '/servers/:serverId/members/:userId/roles',
    { preHandler: [requireAuth, requireEchoStore], ...roleMutationOpts },
    async (req, reply) => {
      const pool = echoPool(req);
      const sid = trimEchoPathParam(req.params.serverId);
      const targetUserId = trimEchoPathParam(req.params.userId);
      const roleId =
        typeof req.body?.roleId === 'string' ? req.body.roleId.trim() : '';
      if (!roleId)
        return sendError(reply, 400, 'INVALID_BODY', 'roleId required');
      const r = await assignEchoMemberRole(
        pool,
        sid,
        getAuthUser(req).id,
        targetUserId,
        roleId,
      );
      if (r === 'forbidden')
        return sendError(
          reply,
          403,
          'FORBIDDEN',
          'You cannot manage roles in this server',
        );
      if (r === 'not_member')
        return sendError(
          reply,
          400,
          'INVALID_TARGET',
          'User is not a member of this server',
        );
      if (r === 'invalid_role')
        return sendError(reply, 400, 'INVALID_BODY', 'Unknown role');
      if (r === 'unchanged') return reply.code(204).send();
      await evictUserFromEchoServerRealtimeScopes(fastify, pool, {
        serverId: sid,
        userId: targetUserId,
      });
      const auditId = await insertEchoAudit(
        pool,
        sid,
        getAuthUser(req).id,
        'member.role_add',
        'user',
        targetUserId,
        { roleId },
      );
      publishEchoWorkspaceEvent(
        fastify,
        {
          kind: 'role_graph_changed',
          version: auditId,
          serverId: sid,
          userId: targetUserId,
        },
        { serverId: sid, userId: targetUserId },
      );
      return reply.code(204).send();
    },
  );

  fastify.delete<{
    Params: { serverId: string; userId: string; roleId: string };
  }>(
    '/servers/:serverId/members/:userId/roles/:roleId',
    { preHandler: [requireAuth, requireEchoStore], ...roleMutationOpts },
    async (req, reply) => {
      const pool = echoPool(req);
      const sid = trimEchoPathParam(req.params.serverId);
      const targetUserId = trimEchoPathParam(req.params.userId);
      const roleId = trimEchoPathParam(req.params.roleId);
      const r = await removeEchoMemberRole(
        pool,
        sid,
        getAuthUser(req).id,
        targetUserId,
        roleId,
      );
      if (r === 'forbidden')
        return sendError(
          reply,
          403,
          'FORBIDDEN',
          'You cannot manage roles in this server',
        );
      if (r === 'not_member')
        return sendError(
          reply,
          400,
          'INVALID_TARGET',
          'User is not a member of this server',
        );
      if (r === 'invalid_role')
        return sendError(reply, 400, 'INVALID_BODY', 'Unknown role');
      if (r === 'cannot_remove_everyone') {
        return sendError(
          reply,
          400,
          'INVALID_BODY',
          'Cannot remove the @everyone role',
        );
      }
      if (r === 'unchanged') return reply.code(204).send();
      await evictUserFromEchoServerRealtimeScopes(fastify, pool, {
        serverId: sid,
        userId: targetUserId,
      });
      const auditId = await insertEchoAudit(
        pool,
        sid,
        getAuthUser(req).id,
        'member.role_remove',
        'user',
        targetUserId,
        {
          roleId,
        },
      );
      publishEchoWorkspaceEvent(
        fastify,
        {
          kind: 'role_graph_changed',
          version: auditId,
          serverId: sid,
          userId: targetUserId,
        },
        { serverId: sid, userId: targetUserId },
      );
      return reply.code(204).send();
    },
  );
}
