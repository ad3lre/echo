import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import { sendError } from '../../errors';
import {
  getEchoStore,
  type EchoPermissionOverwriteRowInput,
} from '../../../domain/echoStore';

declare module 'fastify' {
  interface FastifyRequest {
    /** Set by `requireEchoStore` when Echo DB is available. */
    echoPool?: Pool;
  }
}

export function echoDisabled(reply: Parameters<typeof sendError>[0]) {
  return sendError(
    reply,
    503,
    'ECHO_UNAVAILABLE',
    'Echo domain requires PostgreSQL (DATABASE_URL)',
  );
}

export function parsePermissionOverwriteRowsBody(
  raw: unknown,
): EchoPermissionOverwriteRowInput[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: EchoPermissionOverwriteRowInput[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object' || Array.isArray(item))
      return undefined;
    const o = item as Record<string, unknown>;
    const tt = o.targetType;
    if (
      tt !== 'everyone' &&
      tt !== 'members' &&
      tt !== 'global' &&
      tt !== 'role' &&
      tt !== 'member'
    )
      return undefined;
    const partial = o.partial;
    if (
      typeof partial !== 'object' ||
      partial === null ||
      Array.isArray(partial)
    )
      return undefined;
    if (tt === 'everyone' || tt === 'members' || tt === 'global') {
      const normalized =
        tt === 'everyone' ? 'members' : (tt as 'members' | 'global');
      out.push({
        targetType: normalized,
        partial: partial as Record<string, unknown>,
      });
      continue;
    }
    if (typeof o.targetId !== 'string' || !o.targetId.trim()) return undefined;
    out.push({
      targetType: tt,
      targetId: o.targetId.trim(),
      partial: partial as Record<string, unknown>,
    });
  }
  return out;
}

export async function requireEchoStore(
  req: FastifyRequest,
  reply: FastifyReply,
) {
  const { pool, enabled } = await getEchoStore();
  if (!enabled || !pool) {
    return echoDisabled(reply);
  }
  req.echoPool = pool;
}

/** Use in handlers after `requireEchoStore` in `preHandler`. */
export function echoPool(req: FastifyRequest): Pool {
  return req.echoPool as Pool;
}

/** Normalize path segment IDs (snowflakes, UUIDs) so padded URL segments match DB rows. */
export function trimEchoPathParam(raw: string): string {
  return raw.trim();
}
