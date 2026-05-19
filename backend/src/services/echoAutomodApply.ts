import type { FastifyInstance, FastifyBaseLogger } from 'fastify';
import type pg from 'pg';
import type { AutomodAction, AutomodDeleteRecentMinutes, EchoAutomodRule } from '../../../shared/types/automod';
import {
  AUTOMOD_DELETE_RECENT_MAX_MESSAGES,
} from '../../../shared/types/automod';
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
        if (
          out.timeoutMinutes == null ||
          a.minutes > out.timeoutMinutes
        ) {
          out.timeoutMinutes = a.minutes;
        }
      } else if (a.kind === 'kick') {
        out.kick = true;
      } else if (a.kind === 'ban') {
        out.ban = true;
        const h = a.deleteRecentMessagesHours;
        if (typeof h === 'number' && h > 0) {
          out.banDeleteHours =
            out.banDeleteHours == null
              ? h
              : Math.max(out.banDeleteHours, h);
        }
      }
    }
  }
  return out;
}

function collectBestEffort(rules: EchoAutomodRule[]): AutomodAction[] {
  const seen = new Set<string>();
  const list: AutomodAction[] = [];
  for (const r of rules) {
    for (const a of r.actions) {
      if (a.phase !== 'best_effort_post') continue;
      const key = `${a.kind}:${JSON.stringify(a)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      list.push(a);
    }
  }
  return list;
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
  const best = collectBestEffort(firedRules);

  let mustOk = true;
  try {
    if (merged.deleteWindowMin != null) {
      const since = new Date(
        Date.now() - merged.deleteWindowMin * 60 * 1000,
      );
      const rows = await bulkSoftDeleteEchoMessagesForAuthorInChannelSinceExcludePins(
        pool,
        input.channelId,
        input.userId,
        since,
        AUTOMOD_DELETE_RECENT_MAX_MESSAGES,
      );
      const io = (fastify as FastifyInstance & { io?: import('socket.io').Server })
        .io;
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

  for (const a of best) {
    try {
      if (a.kind === 'warn_user_dm') {
        await insertEchoAudit(
          pool,
          input.serverId,
          input.ownerActorId,
          'automod.warn_dm',
          'user',
          input.userId,
          { text: a.text, correlationId: input.correlationId },
        );
      } else if (a.kind === 'alert_log_channel') {
        await insertEchoAudit(
          pool,
          input.serverId,
          input.ownerActorId,
          'automod.alert',
          'user',
          input.userId,
          {
            text: a.text,
            correlationId: input.correlationId,
            messageId: input.messageId,
          },
        );
      } else if (a.kind === 'system_notice_in_channel') {
        await insertEchoAudit(
          pool,
          input.serverId,
          input.ownerActorId,
          'automod.notice',
          'channel',
          a.channelId ?? input.channelId,
          { text: a.text },
        );
      } else if (a.kind === 'add_role') {
        await assignEchoMemberRole(
          pool,
          input.serverId,
          input.ownerActorId,
          input.userId,
          a.roleId,
        );
      } else if (a.kind === 'remove_role') {
        await removeEchoMemberRole(
          pool,
          input.serverId,
          input.ownerActorId,
          input.userId,
          a.roleId,
        );
      }
    } catch (err) {
      input.log.warn(
        { err, msg: 'echo.automod.best_effort_failed', kind: a.kind },
        'AutoMod best-effort action failed',
      );
    }
  }
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
