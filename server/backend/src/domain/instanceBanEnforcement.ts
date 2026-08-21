import type { FastifyReply } from 'fastify';
import { config } from '../config';
import { getPgPool } from '../db/pg';
import { sendError } from '../api/errors';
import {
  evaluateInstanceBan,
  resolveHwidHashFromClientHwid,
  type InstanceBanDimension,
} from './echoStore/safety/instanceBans';

export type InstanceBanCheckContext = {
  userId?: string | null;
  rawIp?: string | null;
  clientHwid?: string | null;
  hwidHash?: string | null;
};

function hitsDetail(hits: InstanceBanDimension[]): string | undefined {
  if (hits.length === 0) return undefined;
  return hits.join(',');
}

export async function checkInstanceBanBlocked(
  ctx: InstanceBanCheckContext,
): Promise<{
  blocked: boolean;
  hits: InstanceBanDimension[];
  reason: string | null;
}> {
  if (!config.instanceBansEnabled) {
    return { blocked: false, hits: [], reason: null };
  }
  const pool = getPgPool();
  if (!pool) return { blocked: false, hits: [], reason: null };

  const hwidHash =
    ctx.hwidHash?.trim() ||
    resolveHwidHashFromClientHwid(ctx.clientHwid) ||
    null;

  return evaluateInstanceBan(pool, {
    userId: ctx.userId,
    rawIp: ctx.rawIp,
    hwidHash,
  });
}

export async function replyIfInstanceBanned(
  reply: FastifyReply,
  ctx: InstanceBanCheckContext,
): Promise<boolean> {
  const result = await checkInstanceBanBlocked(ctx);
  if (!result.blocked) return false;
  sendError(
    reply,
    403,
    'INSTANCE_BANNED',
    'You are not allowed to use this Echo instance.',
    hitsDetail(result.hits),
  );
  return true;
}
