import type { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { requireAuth } from '../../../auth/middleware';
import { ECHO_MSG_NOT_SERVER_MEMBER, sendError } from '../../errors';
import {
  isEchoServerOwner,
  getMergedRolePermissions,
} from '../../../domain/echoStore';
import { isMemberOfServer } from '../../../domain/echoPermissions';
import {
  echoPool,
  requireEchoStore,
  trimEchoPathParam,
} from './echoRouteUtils';
import {
  deleteEchoAutomodRule,
  getEchoAutomodRuleById,
  insertEchoAutomodRule,
  listEchoAutomodHitsForUserServerRecent,
  listEchoAutomodRuleHits,
  listEchoAutomodRulesForServer,
  listEchoMemberRoleIdsForServerUser,
  reorderEchoAutomodRules,
  updateEchoAutomodRule,
} from '../../../domain/echoStore/automod/rulesDal';
import {
  parseAutomodNode,
  parseActions,
  validateAutomodRuleDraft,
  type AutomodSchemaErrorCode,
} from '../../../domain/echoStore/automod/schema';
import { isRe2AutomodAvailable } from '../../../domain/echoStore/automod/re2Safe';
import {
  annotateAutomodNode,
  buildAutomodEvalContext,
} from '../../../domain/echoStore/automod/evaluator';

async function assertAutomodManage(
  pool: ReturnType<typeof echoPool>,
  serverId: string,
  userId: string,
): Promise<boolean> {
  if (await isEchoServerOwner(pool, serverId, userId)) return true;
  const p = await getMergedRolePermissions(pool, serverId, userId);
  return p.has('MANAGE_GUILD');
}

async function getServerOwnerId(
  pool: ReturnType<typeof echoPool>,
  serverId: string,
): Promise<string | null> {
  const r = await pool.query(
    `SELECT owner_id::text AS owner_id FROM echo_servers WHERE id = $1 LIMIT 1`,
    [serverId],
  );
  return r.rows[0] ? String(r.rows[0].owner_id) : null;
}

function schemaErrorToHttp(code: AutomodSchemaErrorCode): string {
  switch (code) {
    case 'regex_requires_re2':
      return 'Regex conditions require the RE2 module on this server.';
    default:
      return 'Invalid AutoMod rule payload';
  }
}

export default async function echoAutomodRoutes(
  fastify: FastifyInstance,
  _opts: FastifyPluginOptions,
): Promise<void> {
  fastify.get<{ Params: { serverId: string } }>(
    '/servers/:serverId/automod/effective-capabilities',
    { preHandler: [requireAuth, requireEchoStore] },
    async (req, reply) => {
      const pool = echoPool(req);
      const sid = trimEchoPathParam(req.params.serverId);
      const okMem = await isMemberOfServer(pool, sid, req.authUser!.id);
      if (!okMem)
        return sendError(
          reply,
          403,
          'FORBIDDEN',
          ECHO_MSG_NOT_SERVER_MEMBER,
          'NOT_SERVER_MEMBER',
        );
      if (!(await assertAutomodManage(pool, sid, req.authUser!.id)))
        return sendError(reply, 403, 'FORBIDDEN', 'MANAGE_GUILD required');
      const ownerId = await getServerOwnerId(pool, sid);
      if (!ownerId)
        return sendError(reply, 404, 'NOT_FOUND', 'Server not found');
      return reply.code(200).send({
        re2RegexAvailable: isRe2AutomodAvailable(),
        automodActorUserId: ownerId,
        ownerActsAsAutomod: true,
      });
    },
  );

  fastify.get<{ Params: { serverId: string } }>(
    '/servers/:serverId/automod/rules',
    { preHandler: [requireAuth, requireEchoStore] },
    async (req, reply) => {
      const pool = echoPool(req);
      const sid = trimEchoPathParam(req.params.serverId);
      const okMem = await isMemberOfServer(pool, sid, req.authUser!.id);
      if (!okMem)
        return sendError(
          reply,
          403,
          'FORBIDDEN',
          ECHO_MSG_NOT_SERVER_MEMBER,
          'NOT_SERVER_MEMBER',
        );
      if (!(await assertAutomodManage(pool, sid, req.authUser!.id)))
        return sendError(reply, 403, 'FORBIDDEN', 'MANAGE_GUILD required');
      const rules = await listEchoAutomodRulesForServer(pool, sid);
      return reply.code(200).send({ rules });
    },
  );

  fastify.post<{
    Params: { serverId: string };
    Body: Record<string, unknown>;
  }>(
    '/servers/:serverId/automod/rules',
    { preHandler: [requireAuth, requireEchoStore] },
    async (req, reply) => {
      const pool = echoPool(req);
      const sid = trimEchoPathParam(req.params.serverId);
      const okMem = await isMemberOfServer(pool, sid, req.authUser!.id);
      if (!okMem)
        return sendError(
          reply,
          403,
          'FORBIDDEN',
          ECHO_MSG_NOT_SERVER_MEMBER,
          'NOT_SERVER_MEMBER',
        );
      if (!(await assertAutomodManage(pool, sid, req.authUser!.id)))
        return sendError(reply, 403, 'FORBIDDEN', 'MANAGE_GUILD required');
      const body = req.body ?? {};
      const name = typeof body.name === 'string' ? body.name.trim() : '';
      const tree = parseAutomodNode(body.conditionTree);
      const actions = parseActions(body.actions);
      if (!name || !tree || !actions)
        return sendError(reply, 400, 'INVALID_BODY', 'Invalid rule body');
      const exemptRoleIds = Array.isArray(body.exemptRoleIds)
        ? body.exemptRoleIds.filter((x): x is string => typeof x === 'string')
        : [];
      const exemptChannelIds = Array.isArray(body.exemptChannelIds)
        ? body.exemptChannelIds.filter((x): x is string => typeof x === 'string')
        : [];
      const logChannelId =
        typeof body.logChannelId === 'string' && body.logChannelId.trim()
          ? body.logChannelId.trim()
          : null;
      const draft = {
        name,
        conditionTree: tree,
        actions,
        exemptRoleIds,
        exemptChannelIds,
        logChannelId,
      };
      const v = validateAutomodRuleDraft(draft);
      if (!v.ok)
        return sendError(
          reply,
          400,
          'INVALID_BODY',
          schemaErrorToHttp(v.code),
        );
      const existing = await listEchoAutomodRulesForServer(pool, sid);
      const position = existing.length;
      try {
        const id = await insertEchoAutomodRule(pool, {
          serverId: sid,
          createdByUserId: req.authUser!.id,
          name,
          icon:
            typeof body.icon === 'string' && body.icon.trim()
              ? body.icon.trim()
              : 'shield',
          enabled: body.enabled !== false,
          position,
          triggerType:
            typeof body.triggerType === 'string'
              ? body.triggerType
              : 'message.create',
          conditionTree: tree,
          actions,
          exemptRoleIds,
          exemptChannelIds,
          logChannelId,
        });
        const created = await getEchoAutomodRuleById(pool, sid, id);
        return reply.code(201).send({ rule: created });
      } catch (e) {
        if (e instanceof Error && e.message === 'AUTOMOD_RULE_LIMIT')
          return sendError(
            reply,
            400,
            'INVALID_BODY',
            'Maximum AutoMod rules reached',
          );
        throw e;
      }
    },
  );

  fastify.put<{
    Params: { serverId: string; ruleId: string };
    Body: Record<string, unknown>;
  }>(
    '/servers/:serverId/automod/rules/:ruleId',
    { preHandler: [requireAuth, requireEchoStore] },
    async (req, reply) => {
      const pool = echoPool(req);
      const sid = trimEchoPathParam(req.params.serverId);
      const ruleId = trimEchoPathParam(req.params.ruleId);
      const okMem = await isMemberOfServer(pool, sid, req.authUser!.id);
      if (!okMem)
        return sendError(
          reply,
          403,
          'FORBIDDEN',
          ECHO_MSG_NOT_SERVER_MEMBER,
          'NOT_SERVER_MEMBER',
        );
      if (!(await assertAutomodManage(pool, sid, req.authUser!.id)))
        return sendError(reply, 403, 'FORBIDDEN', 'MANAGE_GUILD required');
      const prev = await getEchoAutomodRuleById(pool, sid, ruleId);
      if (!prev) return sendError(reply, 404, 'NOT_FOUND', 'Rule not found');
      const body = req.body ?? {};

      let conditionTree = prev.conditionTree;
      if (body.conditionTree !== undefined) {
        const t = parseAutomodNode(body.conditionTree);
        if (!t)
          return sendError(
            reply,
            400,
            'INVALID_BODY',
            'Invalid condition tree',
          );
        conditionTree = t;
      }
      let actions = prev.actions;
      if (body.actions !== undefined) {
        const pa = parseActions(body.actions);
        if (!pa)
          return sendError(reply, 400, 'INVALID_BODY', 'Invalid actions');
        actions = pa;
      }
      const name =
        typeof body.name === 'string' && body.name.trim()
          ? body.name.trim()
          : prev.name;
      const icon =
        typeof body.icon === 'string' && body.icon.trim()
          ? body.icon.trim()
          : prev.icon;
      const enabled =
        typeof body.enabled === 'boolean' ? body.enabled : prev.enabled;
      const triggerType =
        typeof body.triggerType === 'string' && body.triggerType.trim()
          ? body.triggerType.trim()
          : prev.triggerType;
      const exemptRoleIds = Array.isArray(body.exemptRoleIds)
        ? body.exemptRoleIds.filter((x): x is string => typeof x === 'string')
        : prev.exemptRoleIds;
      const exemptChannelIds = Array.isArray(body.exemptChannelIds)
        ? body.exemptChannelIds.filter(
            (x): x is string => typeof x === 'string',
          )
        : prev.exemptChannelIds;
      const logChannelId =
        body.logChannelId !== undefined
          ? typeof body.logChannelId === 'string' && body.logChannelId.trim()
            ? body.logChannelId.trim()
            : null
          : prev.logChannelId;

      const draft = {
        name,
        conditionTree,
        actions,
        exemptRoleIds,
        exemptChannelIds,
        logChannelId,
      };
      const v = validateAutomodRuleDraft(draft);
      if (!v.ok)
        return sendError(
          reply,
          400,
          'INVALID_BODY',
          schemaErrorToHttp(v.code),
        );

      const patch: Parameters<typeof updateEchoAutomodRule>[3] = {};
      if (typeof body.name === 'string') patch.name = body.name;
      if (typeof body.icon === 'string') patch.icon = body.icon;
      if (typeof body.enabled === 'boolean') patch.enabled = body.enabled;
      if (typeof body.triggerType === 'string')
        patch.triggerType = body.triggerType;
      if (body.conditionTree !== undefined)
        patch.conditionTree = conditionTree;
      if (body.actions !== undefined) patch.actions = actions;
      if (Array.isArray(body.exemptRoleIds)) patch.exemptRoleIds = exemptRoleIds;
      if (Array.isArray(body.exemptChannelIds))
        patch.exemptChannelIds = exemptChannelIds;
      if (body.logChannelId !== undefined) patch.logChannelId = logChannelId;

      await updateEchoAutomodRule(pool, sid, ruleId, patch);
      const next = await getEchoAutomodRuleById(pool, sid, ruleId);
      if (!next) return sendError(reply, 404, 'NOT_FOUND', 'Rule not found');
      return reply.code(200).send({ rule: next });
    },
  );

  fastify.delete<{ Params: { serverId: string; ruleId: string } }>(
    '/servers/:serverId/automod/rules/:ruleId',
    { preHandler: [requireAuth, requireEchoStore] },
    async (req, reply) => {
      const pool = echoPool(req);
      const sid = trimEchoPathParam(req.params.serverId);
      const ruleId = trimEchoPathParam(req.params.ruleId);
      const okMem = await isMemberOfServer(pool, sid, req.authUser!.id);
      if (!okMem)
        return sendError(
          reply,
          403,
          'FORBIDDEN',
          ECHO_MSG_NOT_SERVER_MEMBER,
          'NOT_SERVER_MEMBER',
        );
      if (!(await assertAutomodManage(pool, sid, req.authUser!.id)))
        return sendError(reply, 403, 'FORBIDDEN', 'MANAGE_GUILD required');
      const ok = await deleteEchoAutomodRule(pool, sid, ruleId);
      if (!ok) return sendError(reply, 404, 'NOT_FOUND', 'Rule not found');
      return reply.code(204).send();
    },
  );

  fastify.patch<{
    Params: { serverId: string };
    Body: { orderedIds?: string[] };
  }>(
    '/servers/:serverId/automod/rules/order',
    { preHandler: [requireAuth, requireEchoStore] },
    async (req, reply) => {
      const pool = echoPool(req);
      const sid = trimEchoPathParam(req.params.serverId);
      const okMem = await isMemberOfServer(pool, sid, req.authUser!.id);
      if (!okMem)
        return sendError(
          reply,
          403,
          'FORBIDDEN',
          ECHO_MSG_NOT_SERVER_MEMBER,
          'NOT_SERVER_MEMBER',
        );
      if (!(await assertAutomodManage(pool, sid, req.authUser!.id)))
        return sendError(reply, 403, 'FORBIDDEN', 'MANAGE_GUILD required');
      const ids = Array.isArray(req.body?.orderedIds)
        ? req.body!.orderedIds!.filter(
            (x): x is string =>
              typeof x === 'string' && x.trim().length > 0,
          )
        : [];
      if (ids.length === 0)
        return sendError(reply, 400, 'INVALID_BODY', 'orderedIds required');
      await reorderEchoAutomodRules(pool, sid, ids);
      const rules = await listEchoAutomodRulesForServer(pool, sid);
      return reply.code(200).send({ rules });
    },
  );

  fastify.post<{
    Params: { serverId: string; ruleId: string };
    Body: Record<string, unknown>;
  }>(
    '/servers/:serverId/automod/rules/:ruleId/test',
    { preHandler: [requireAuth, requireEchoStore] },
    async (req, reply) => {
      const pool = echoPool(req);
      const sid = trimEchoPathParam(req.params.serverId);
      const ruleId = trimEchoPathParam(req.params.ruleId);
      const okMem = await isMemberOfServer(pool, sid, req.authUser!.id);
      if (!okMem)
        return sendError(
          reply,
          403,
          'FORBIDDEN',
          ECHO_MSG_NOT_SERVER_MEMBER,
          'NOT_SERVER_MEMBER',
        );
      if (!(await assertAutomodManage(pool, sid, req.authUser!.id)))
        return sendError(reply, 403, 'FORBIDDEN', 'MANAGE_GUILD required');
      const rule = await getEchoAutomodRuleById(pool, sid, ruleId);
      if (!rule) return sendError(reply, 404, 'NOT_FOUND', 'Rule not found');
      const sampleContent =
        typeof req.body?.sampleContent === 'string' ? req.body.sampleContent : '';
      const sampleChannelId =
        typeof req.body?.sampleChannelId === 'string'
          ? req.body.sampleChannelId.trim()
          : rule.exemptChannelIds[0] ?? '';
      const sampleRoles = Array.isArray(req.body?.sampleAuthorRoleIds)
        ? (req.body!.sampleAuthorRoleIds as unknown[]).filter(
            (x): x is string => typeof x === 'string',
          )
        : await listEchoMemberRoleIdsForServerUser(
            pool,
            sid,
            req.authUser!.id,
          );
      const mentionCount =
        typeof req.body?.mentionCount === 'number' &&
        Number.isFinite(req.body.mentionCount)
          ? Math.max(0, Math.floor(req.body.mentionCount))
          : 0;
      const recentHits = await listEchoAutomodHitsForUserServerRecent(
        pool,
        sid,
        req.authUser!.id,
      );
      const ctx = await buildAutomodEvalContext(pool, {
        serverId: sid,
        channelId: sampleChannelId || 'unknown',
        userId: req.authUser!.id,
        content: sampleContent,
        mentionCount,
        memberRoleIds: sampleRoles,
        recentHits,
      });
      const annotation = annotateAutomodNode(ctx, rule.conditionTree);
      return reply.code(200).send({
        annotation,
        wouldMatch: annotation.matched,
        rule,
      });
    },
  );

  fastify.get<{
    Params: { serverId: string; ruleId: string };
    Querystring: { limit?: string };
  }>(
    '/servers/:serverId/automod/rules/:ruleId/hits',
    { preHandler: [requireAuth, requireEchoStore] },
    async (req, reply) => {
      const pool = echoPool(req);
      const sid = trimEchoPathParam(req.params.serverId);
      const ruleId = trimEchoPathParam(req.params.ruleId);
      const okMem = await isMemberOfServer(pool, sid, req.authUser!.id);
      if (!okMem)
        return sendError(
          reply,
          403,
          'FORBIDDEN',
          ECHO_MSG_NOT_SERVER_MEMBER,
          'NOT_SERVER_MEMBER',
        );
      if (!(await assertAutomodManage(pool, sid, req.authUser!.id)))
        return sendError(reply, 403, 'FORBIDDEN', 'MANAGE_GUILD required');
      const rule = await getEchoAutomodRuleById(pool, sid, ruleId);
      if (!rule) return sendError(reply, 404, 'NOT_FOUND', 'Rule not found');
      const limit = Math.min(
        200,
        Math.max(1, parseInt(req.query.limit ?? '50', 10) || 50),
      );
      const hits = await listEchoAutomodRuleHits(pool, ruleId, limit);
      return reply.code(200).send({ hits });
    },
  );
}
