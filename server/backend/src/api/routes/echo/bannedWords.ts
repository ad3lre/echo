import type { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { requireAuth, getAuthUser } from '../../../auth/middleware';
import { ECHO_MSG_NOT_SERVER_MEMBER, sendError } from '../../errors';
import {
  isEchoServerOwner,
  getMergedRolePermissions,
} from '../../../domain/echoStore';
import { isMemberOfServer } from '../../../domain/permissions/echoPermissions';
import { echoPool, requireEchoStore, trimEchoPathParam } from './routeUtils';
import {
  getEchoBannedWordsConfig,
  upsertEchoBannedWordsConfig,
} from '../../../domain/echoStore/bannedWords/configDal';
import {
  BANNED_WORD_CATEGORIES,
  BANNED_WORD_ACTION_KINDS,
  BANNED_WORD_PRESET_LEVELS,
  BANNED_WORDS_MAX_CUSTOM_WORDS,
  BANNED_WORDS_MAX_EXEMPT_ROLES,
  BANNED_WORDS_MAX_WORD_LENGTH,
  BANNED_WORD_PRESET_DEFAULTS,
  type BannedWordCategory,
  type BannedWordActionKind,
  type BannedWordCategoryConfig,
  type BannedWordPresetLevel,
} from '../../../../../../contracts/types/bannedWords';

async function assertManage(
  pool: ReturnType<typeof echoPool>,
  serverId: string,
  userId: string,
): Promise<boolean> {
  if (await isEchoServerOwner(pool, serverId, userId)) return true;
  const p = await getMergedRolePermissions(pool, serverId, userId);
  return p.has('MANAGE_GUILD');
}

export default async function echoBannedWordsRoutes(
  fastify: FastifyInstance,
  _opts: FastifyPluginOptions,
): Promise<void> {
  fastify.get<{ Params: { serverId: string } }>(
    '/servers/:serverId/banned-words/config',
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
      if (!(await assertManage(pool, sid, getAuthUser(req).id)))
        return sendError(reply, 403, 'FORBIDDEN', 'MANAGE_GUILD required');
      const config = await getEchoBannedWordsConfig(pool, sid);
      return reply.code(200).send({ config });
    },
  );

  fastify.put<{
    Params: { serverId: string };
    Body: Record<string, unknown>;
  }>(
    '/servers/:serverId/banned-words/config',
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
      if (!(await assertManage(pool, sid, getAuthUser(req).id)))
        return sendError(reply, 403, 'FORBIDDEN', 'MANAGE_GUILD required');

      const body = req.body ?? {};

      const presetLevel = BANNED_WORD_PRESET_LEVELS.includes(
        body.presetLevel as BannedWordPresetLevel,
      )
        ? (body.presetLevel as BannedWordPresetLevel)
        : 'off';

      let categories: Record<BannedWordCategory, BannedWordCategoryConfig>;
      if (
        presetLevel !== 'off' &&
        presetLevel !== 'custom' &&
        presetLevel in BANNED_WORD_PRESET_DEFAULTS
      ) {
        categories =
          BANNED_WORD_PRESET_DEFAULTS[
            presetLevel as keyof typeof BANNED_WORD_PRESET_DEFAULTS
          ];
      } else if (
        presetLevel === 'custom' &&
        body.categories &&
        typeof body.categories === 'object'
      ) {
        const raw = body.categories as Record<string, unknown>;
        categories = {} as Record<BannedWordCategory, BannedWordCategoryConfig>;
        for (const cat of BANNED_WORD_CATEGORIES) {
          const entry = raw[cat] as Record<string, unknown> | undefined;
          categories[cat] = {
            enabled: entry?.enabled === true,
            action: BANNED_WORD_ACTION_KINDS.includes(
              entry?.action as BannedWordActionKind,
            )
              ? (entry!.action as BannedWordActionKind)
              : 'block_message',
          };
        }
      } else {
        categories = {} as Record<BannedWordCategory, BannedWordCategoryConfig>;
        for (const cat of BANNED_WORD_CATEGORIES) {
          categories[cat] = { enabled: false, action: 'block_message' };
        }
      }

      const customWords = Array.isArray(body.customWords)
        ? (body.customWords as unknown[])
            .filter(
              (x): x is string => typeof x === 'string' && x.trim().length > 0,
            )
            .map((w) =>
              w.trim().toLowerCase().slice(0, BANNED_WORDS_MAX_WORD_LENGTH),
            )
            .slice(0, BANNED_WORDS_MAX_CUSTOM_WORDS)
        : [];

      const exemptRoleIds = Array.isArray(body.exemptRoleIds)
        ? (body.exemptRoleIds as unknown[])
            .filter(
              (x): x is string => typeof x === 'string' && x.trim().length > 0,
            )
            .slice(0, BANNED_WORDS_MAX_EXEMPT_ROLES)
        : [];

      const config = await upsertEchoBannedWordsConfig(pool, {
        serverId: sid,
        presetLevel,
        categories,
        customWords,
        exemptRoleIds,
        updatedAt: new Date().toISOString(),
      });

      return reply.code(200).send({ config });
    },
  );
}
