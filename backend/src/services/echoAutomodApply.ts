import type { FastifyInstance, FastifyBaseLogger } from 'fastify';
import type { Server } from 'socket.io';
import type pg from 'pg';
import type {
  AutomodAction,
  AutomodDeleteRecentMinutes,
  EchoAutomodRule,
} from '../../../shared/types/automod';
import { AUTOMOD_DELETE_RECENT_MAX_MESSAGES } from '../../../shared/types/automod';
import { getMergedRolePermissions } from '../domain/echoStore/permissions';
import { insertEchoAudit } from '../domain/echoStore/auditLog';
import {
  parseDeleteRecentMessagesHours,
  runEchoModerationActionAndBroadcast,
} from './echoModerationOps';
import {
  assignEchoMemberRole,
  removeEchoMemberRole,
} from '../domain/echoStore/roles';
import { bulkSoftDeleteEchoMessagesForAuthorInChannelSinceExcludePins } from '../domain/echoMessagesDal';
import { broadcastToEchoChannel } from '../sockets/channelBroadcast';
import { nextEchoSnowflakeId } from '../domain/echoSnowflake';
import { insertEchoAutomodRuleHit } from '../domain/echoStore/automod/rulesDal';
import { buildAutomodMessageBody } from './echoAutomodChannelDelivery';
import { echoAutomodPostOwnerChannelNotice } from './echoPersistedMessageCreate';
import { getOrCreateEchoDmThread } from '../domain/echoStore';

async function mayBypassAutomod(
  pool: pg.Pool,
  serverId: string,
  userId: string,
): Promise<boolean> {
  const perms = await getMergedRolePermissions(pool, serverId, userId);
  return (
    perms.has('ADMINISTRATOR') ||
    perms.has('MANAGE_GUILD') ||
    perms.has('MANAGE_MESSAGES')
  );
}

type MergedMust = {
  deleteWindowMin: AutomodDeleteRecentMinutes | null;
  timeoutMinutes: number | null;
  kick: boolean;
  ban: boolean;
  banDeleteHours: number | null;
};

function mergeMustSucceedActions(rules: EchoAutomodRule[]): MergedMust {
  const out: MergedMust = {
    deleteWindowMin: null,
    timeoutMinutes: null,
    kick: false,
    ban: false,
    banDeleteHours: null,
  };
  for (const r of rules) {
    for (const a of r.actions) {
      if (a.kind === 'delete_recent_messages') {
        if (
          out.deleteWindowMin == null ||
          a.windowMinutes < out.deleteWindowMin
        ) {
          out.deleteWindowMin = a.windowMinutes;
        }
      } else if (a.kind === 'timeout') {
        if (out.timeoutMinutes == null || a.minutes > out.timeoutMinutes) {
          out.timeoutMinutes = a.minutes;
        }
      } else if (a.kind === 'kick') {
        out.kick = true;
      } else if (a.kind === 'ban') {
        out.ban = true;
        const h = a.deleteRecentMessagesHours;
        if (typeof h === 'number' && h > 0) {
          out.banDeleteHours =
            out.banDeleteHours == null ? h : Math.max(out.banDeleteHours, h);
        }
      }
    }
  }
  return out;
}

type AutomodDeliveryCtx = {
  pool: pg.Pool;
  fastify: FastifyInstance;
  serverId: string;
  ownerActorId: string;
  channelId: string;
  userId: string;
  messageId: string;
  correlationId: string;
  log: FastifyBaseLogger;
};

async function deliverAutomodCommunication(
  ctx: AutomodDeliveryCtx,
  rule: EchoAutomodRule,
  a: AutomodAction,
): Promise<void> {
  const io = (ctx.fastify as FastifyInstance & { io?: Server }).io;
  const vars = {
    ruleName: rule.name,
    ruleId: rule.id,
    userId: ctx.userId,
    channelId: ctx.channelId,
    messageId: ctx.messageId,
    correlationId: ctx.correlationId,
  };

  if (a.kind === 'system_notice_in_channel') {
    const text = buildAutomodMessageBody(a.text, vars);
    const target = (a.channelId ?? '').trim() || ctx.channelId;
    const posted = await echoAutomodPostOwnerChannelNotice(
      ctx.pool,
      io,
      ctx.log,
      {
        guildServerId: ctx.serverId,
        targetChannelId: target,
        ownerActorId: ctx.ownerActorId,
        content: text,
        correlationId: ctx.correlationId,
      },
    );
    if (!posted.ok) {
      ctx.log.warn(
        {
          msg: 'echo.automod.notice_skipped',
          reason: posted.reason,
          targetChannelId: target,
          correlationId: ctx.correlationId,
        },
        'AutoMod channel notice skipped',
      );
    }
    await insertEchoAudit(
      ctx.pool,
      ctx.serverId,
      ctx.ownerActorId,
      'automod.notice',
      'channel',
      target,
      { text, correlationId: ctx.correlationId, delivered: posted.ok },
    );
    return;
  }

  if (a.kind === 'alert_log_channel') {
    const logCh = (rule.logChannelId ?? '').trim();
    if (!logCh) {
      ctx.log.warn(
        {
          msg: 'echo.automod.alert_no_log_channel',
          ruleId: rule.id,
          correlationId: ctx.correlationId,
        },
        'AutoMod alert_log_channel skipped: rule has no log channel',
      );
      await insertEchoAudit(
        ctx.pool,
        ctx.serverId,
        ctx.ownerActorId,
        'automod.alert',
        'user',
        ctx.userId,
        {
          text: a.text,
          correlationId: ctx.correlationId,
          messageId: ctx.messageId,
          skipped: true,
          reason: 'no_log_channel',
        },
      );
      return;
    }
    const text = buildAutomodMessageBody(a.text, vars);
    const posted = await echoAutomodPostOwnerChannelNotice(
      ctx.pool,
      io,
      ctx.log,
      {
        guildServerId: ctx.serverId,
        targetChannelId: logCh,
        ownerActorId: ctx.ownerActorId,
        content: text,
        correlationId: ctx.correlationId,
      },
    );
    if (!posted.ok) {
      ctx.log.warn(
        {
          msg: 'echo.automod.alert_post_failed',
          reason: posted.reason,
          logChannelId: logCh,
          correlationId: ctx.correlationId,
        },
        'AutoMod log alert post skipped',
      );
    }
    await insertEchoAudit(
      ctx.pool,
      ctx.serverId,
      ctx.ownerActorId,
      'automod.alert',
      'user',
      ctx.userId,
      {
        text: a.text,
        correlationId: ctx.correlationId,
        messageId: ctx.messageId,
        logChannelId: logCh,
        delivered: posted.ok,
      },
    );
    return;
  }

  if (a.kind === 'warn_user_dm') {
    const text = buildAutomodMessageBody(a.text, vars);
    const warnBody = `[AutoMod: ${rule.name}]\n${text}`;
    let posted = false;
    const logCh = (rule.logChannelId ?? '').trim();
    if (logCh) {
      const r = await echoAutomodPostOwnerChannelNotice(ctx.pool, io, ctx.log, {
        guildServerId: ctx.serverId,
        targetChannelId: logCh,
        ownerActorId: ctx.ownerActorId,
        content: warnBody,
        correlationId: ctx.correlationId,
      });
      posted = r.ok;
      if (!r.ok) {
        ctx.log.warn(
          {
            msg: 'echo.automod.warn_log_post_failed',
            reason: r.reason,
            correlationId: ctx.correlationId,
          },
          'AutoMod warn (log channel) failed',
        );
      }
    } else {
      const dm = await getOrCreateEchoDmThread(
        ctx.pool,
        ctx.ownerActorId,
        ctx.userId,
      );
      if (dm.ok) {
        const r = await echoAutomodPostOwnerChannelNotice(
          ctx.pool,
          io,
          ctx.log,
          {
            guildServerId: ctx.serverId,
            targetChannelId: dm.channelId,
            ownerActorId: ctx.ownerActorId,
            content: warnBody,
            correlationId: ctx.correlationId,
          },
        );
        posted = r.ok;
        if (!r.ok) {
          ctx.log.warn(
            {
              msg: 'echo.automod.warn_dm_post_failed',
              reason: r.reason,
              correlationId: ctx.correlationId,
            },
            'AutoMod warn DM post failed',
          );
        }
      } else {
        ctx.log.warn(
          {
            msg: 'echo.automod.warn_dm_no_thread',
            reason: dm.reason,
            correlationId: ctx.correlationId,
          },
          'AutoMod warn: could not open DM thread',
        );
      }
    }
    await insertEchoAudit(
      ctx.pool,
      ctx.serverId,
      ctx.ownerActorId,
      'automod.warn_dm',
      'user',
      ctx.userId,
      {
        text: a.text,
        correlationId: ctx.correlationId,
        delivered: posted,
      },
    );
  }
}

async function runBestEffortActionsForRules(
  ctx: AutomodDeliveryCtx,
  firedRules: EchoAutomodRule[],
  opts?: { communicationOnly?: boolean },
): Promise<void> {
  const roleHandled = new Set<string>();
  for (const rule of firedRules) {
    for (const a of rule.actions) {
      if (a.phase !== 'best_effort_post') continue;
      try {
        if (a.kind === 'add_role' || a.kind === 'remove_role') {
          if (opts?.communicationOnly) continue;
          const rk = `${a.kind}:${a.roleId}`;
          if (roleHandled.has(rk)) continue;
          roleHandled.add(rk);
          if (a.kind === 'add_role') {
            await assignEchoMemberRole(
              ctx.pool,
              ctx.serverId,
              ctx.ownerActorId,
              ctx.userId,
              a.roleId,
            );
          } else {
            await removeEchoMemberRole(
              ctx.pool,
              ctx.serverId,
              ctx.ownerActorId,
              ctx.userId,
              a.roleId,
            );
          }
          continue;
        }
        if (
          a.kind === 'warn_user_dm' ||
          a.kind === 'alert_log_channel' ||
          a.kind === 'system_notice_in_channel'
        ) {
          await deliverAutomodCommunication(ctx, rule, a);
        }
      } catch (err) {
        ctx.log.warn(
          { err, msg: 'echo.automod.best_effort_failed', kind: a.kind },
          'AutoMod best-effort action failed',
        );
      }
    }
  }
}

export async function applyAutomodAfterMessagePersisted(
  fastify: FastifyInstance,
  pool: pg.Pool,
  input: {
    serverId: string;
    ownerActorId: string;
    channelId: string;
    userId: string;
    messageId: string;
    correlationId: string;
    firedRules: EchoAutomodRule[];
    log: FastifyBaseLogger;
  },
): Promise<void> {
  const { firedRules } = input;
  if (firedRules.length === 0) return;
  if (await mayBypassAutomod(pool, input.serverId, input.userId)) return;

  const merged = mergeMustSucceedActions(firedRules);

  let mustOk = true;
  try {
    if (merged.deleteWindowMin != null) {
      const since = new Date(Date.now() - merged.deleteWindowMin * 60 * 1000);
      const rows =
        await bulkSoftDeleteEchoMessagesForAuthorInChannelSinceExcludePins(
          pool,
          input.channelId,
          input.userId,
          since,
          AUTOMOD_DELETE_RECENT_MAX_MESSAGES,
        );
      const io = (
        fastify as FastifyInstance & { io?: import('socket.io').Server }
      ).io;
      if (io) {
        for (const { channelId, messageId } of rows) {
          broadcastToEchoChannel(io, channelId, 'message:deleted', {
            channelId,
            messageId,
          });
        }
      }
    }
    if (merged.timeoutMinutes != null) {
      const r = await runEchoModerationActionAndBroadcast(
        fastify,
        pool,
        input.serverId,
        input.ownerActorId,
        'timeout',
        input.userId,
        { timeoutMinutes: merged.timeoutMinutes, reason: 'AutoMod rule' },
      );
      if (!r.ok) throw new Error(String(r.code ?? 'TIMEOUT_FAILED'));
    }
    if (merged.kick) {
      const r = await runEchoModerationActionAndBroadcast(
        fastify,
        pool,
        input.serverId,
        input.ownerActorId,
        'kick',
        input.userId,
        { reason: 'AutoMod rule' },
      );
      if (!r.ok) throw new Error(String(r.code ?? 'KICK_FAILED'));
    }
    if (merged.ban) {
      const meta: Record<string, unknown> = {
        reason: 'AutoMod rule',
      };
      if (merged.banDeleteHours != null && merged.banDeleteHours > 0) {
        const purgeH = parseDeleteRecentMessagesHours({
          deleteRecentMessagesHours: merged.banDeleteHours,
        });
        if (purgeH > 0) meta.deleteRecentMessagesHours = purgeH;
      }
      const r = await runEchoModerationActionAndBroadcast(
        fastify,
        pool,
        input.serverId,
        input.ownerActorId,
        'ban',
        input.userId,
        meta,
      );
      if (!r.ok) throw new Error(String(r.code ?? 'BAN_FAILED'));
    }
  } catch (e) {
    mustOk = false;
    input.log.error(
      {
        err: e,
        msg: 'echo.automod.must_succeed_failed',
        serverId: input.serverId,
        channelId: input.channelId,
        userId: input.userId,
        messageId: input.messageId,
        correlationId: input.correlationId,
      },
      'AutoMod must-succeed action failed',
    );
    await insertEchoAudit(
      pool,
      input.serverId,
      input.ownerActorId,
      'automod.action.failed',
      'user',
      input.userId,
      {
        correlationId: input.correlationId,
        messageId: input.messageId,
        channelId: input.channelId,
        error: e instanceof Error ? e.message : String(e),
      },
    );
  }

  if (mustOk) {
    for (const rule of firedRules) {
      const hitId = nextEchoSnowflakeId();
      await insertEchoAutomodRuleHit(pool, {
        id: hitId,
        ruleId: rule.id,
        serverId: input.serverId,
        userId: input.userId,
        channelId: input.channelId,
        messageId: input.messageId,
        correlationId: input.correlationId,
        outcome: 'applied',
        actionsApplied: { merged: true },
      });
      await insertEchoAudit(
        pool,
        input.serverId,
        input.ownerActorId,
        'automod.rule.triggered',
        'automod_rule',
        rule.id,
        {
          targetUserId: input.userId,
          messageId: input.messageId,
          channelId: input.channelId,
          ruleName: rule.name,
          correlationId: input.correlationId,
        },
      );
    }
  }

  const dctx: AutomodDeliveryCtx = {
    pool,
    fastify,
    serverId: input.serverId,
    ownerActorId: input.ownerActorId,
    channelId: input.channelId,
    userId: input.userId,
    messageId: input.messageId,
    correlationId: input.correlationId,
    log: input.log,
  };
  await runBestEffortActionsForRules(dctx, firedRules);
}

export async function recordAutomodBlockHits(
  pool: pg.Pool,
  input: {
    serverId: string;
    ownerActorId: string;
    channelId: string;
    userId: string;
    correlationId: string;
    firedRules: EchoAutomodRule[];
    log: FastifyBaseLogger;
  },
): Promise<void> {
  for (const rule of input.firedRules) {
    if (!rule.actions.some((a) => a.kind === 'block_message')) continue;
    try {
      const hitId = nextEchoSnowflakeId();
      await insertEchoAutomodRuleHit(pool, {
        id: hitId,
        ruleId: rule.id,
        serverId: input.serverId,
        userId: input.userId,
        channelId: input.channelId,
        messageId: null,
        correlationId: input.correlationId,
        outcome: 'blocked',
        actionsApplied: { blocked: true },
      });
      await insertEchoAudit(
        pool,
        input.serverId,
        input.ownerActorId,
        'automod.rule.triggered',
        'automod_rule',
        rule.id,
        {
          targetUserId: input.userId,
          channelId: input.channelId,
          ruleName: rule.name,
          outcome: 'blocked',
          correlationId: input.correlationId,
        },
      );
    } catch (e) {
      input.log.error(
        { err: e, msg: 'echo.automod.block_hit_failed', ruleId: rule.id },
        'Failed to record AutoMod block hit',
      );
    }
  }
}

/**
 * After a block, run best-effort comms (notice / alert / warn) so staff or the channel
 * still see context even though the user message was not stored.
 */
export async function applyAutomodBlockDeliveries(
  fastify: FastifyInstance,
  pool: pg.Pool,
  input: {
    serverId: string;
    ownerActorId: string;
    channelId: string;
    userId: string;
    correlationId: string;
    firedRules: EchoAutomodRule[];
    log: FastifyBaseLogger;
  },
): Promise<void> {
  if (input.firedRules.length === 0) return;
  if (await mayBypassAutomod(pool, input.serverId, input.userId)) return;
  const dctx: AutomodDeliveryCtx = {
    pool,
    fastify,
    serverId: input.serverId,
    ownerActorId: input.ownerActorId,
    channelId: input.channelId,
    userId: input.userId,
    messageId: '',
    correlationId: input.correlationId,
    log: input.log,
  };
  await runBestEffortActionsForRules(dctx, input.firedRules, {
    communicationOnly: true,
  });
}
