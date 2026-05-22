/**
 * Echo RBAC primitives — deterministic role aggregation: sort by position ASC, id ASC;
 * aggregate permissions as a union across all assigned roles.
 * `ADMINISTRATOR` on any role implies full allow.
 *
 * Permission **string keys** match [upstream API permission names (Discord docs)](https://discord.com/developers/docs/topics/permissions)
 * (bitfield flag identifiers). Legacy Echo keys from older rows are expanded via `LEGACY_ECHO_PERMISSION_ALIASES`.
 */

import { DISCORD_ECHO_PERMISSION_STRINGS } from '../../../shared/discordEchoPermissions';
import { ECHO_EXTENDED_PERMISSION_STRINGS } from '../../../shared/echoExtendedPermissions';
import { normalizeEchoRoleType } from '../../../shared/echoRoleTypes';

const THREAD_PERMISSION_NAMES = new Set([
  'MANAGE_THREADS',
  'CREATE_PUBLIC_THREADS',
  'CREATE_PRIVATE_THREADS',
  'SEND_MESSAGES_IN_THREADS',
]);
import type { ChannelPermissionKey } from '../../../shared/types/channel';
import { channelOverridesToEchoPartial } from '../../../shared/rolePermissionBridge';
import type {
  FoldTraceContext,
  ServerFoldTraceEventFull,
} from './echoPermissionTrace';
import {
  emitTraceEvent,
  recordCompressedBulkAdmin,
  recordCompressedSource,
} from './echoPermissionTrace';

export const ECHO_PERMISSIONS = [
  ...DISCORD_ECHO_PERMISSION_STRINGS.filter(
    (k) => !THREAD_PERMISSION_NAMES.has(k),
  ),
  ...ECHO_EXTENDED_PERMISSION_STRINGS,
] as const;

export type EchoPermission = (typeof ECHO_PERMISSIONS)[number];

const ALL_KEYS = new Set<string>(ECHO_PERMISSIONS);

/**
 * Legacy pre-canonical Echo tokens still stored in JSONB → canonical permission key(s).
 * One UI toggle may expand to multiple bits (e.g. legacy “use expressions”).
 */
export const LEGACY_ECHO_PERMISSION_ALIASES: Readonly<
  Record<string, readonly string[]>
> = {
  SEND_MESSAGE: ['SEND_MESSAGES'],
  CREATE_CHANNEL: ['MANAGE_CHANNELS'],
  CREATE_INVITE: ['CREATE_INSTANT_INVITE'],
  MANAGE_SERVER: ['MANAGE_GUILD'],
  USE_EXPRESSIONS: ['USE_EXTERNAL_EMOJIS', 'USE_EXTERNAL_STICKERS'],
  MANAGE_EXPRESSIONS: ['MANAGE_GUILD_EXPRESSIONS'],
  /** Same bit as `MANAGE_GUILD_EXPRESSIONS`; still appears in older Discord exports. */
  MANAGE_EMOJIS_AND_STICKERS: ['MANAGE_GUILD_EXPRESSIONS'],
  VC_MUTE: ['MUTE_MEMBERS'],
  VC_DEAFEN: ['DEAFEN_MEMBERS'],
  VC_MOVE: ['MOVE_MEMBERS'],
  CONNECT_TO_VOICE: ['CONNECT'],
  USE_VIDEO: ['STREAM'],
  MENTION_NICKNAMES: ['MENTION_EVERYONE'],
};

/** Resolve one stored/API token to zero or more canonical permission keys. */
export function resolveCanonicalPermissionKeys(
  token: string,
): readonly string[] {
  const mapped = LEGACY_ECHO_PERMISSION_ALIASES[token];
  if (mapped) return mapped;
  if (ALL_KEYS.has(token)) return [token];
  /** Channel settings UI keys (`sendMessages`, `viewChannel`, …) in JSONB merge rows / legacy blobs. */
  const fromChannelUi = channelOverridesToEchoPartial({
    [token]: true,
  } as Partial<Record<ChannelPermissionKey, boolean>>);
  const uiKeys = Object.keys(fromChannelUi);
  if (uiKeys.length > 0) return uiKeys;
  return [];
}

/** Expand role/overwrite keys for fold and storage normalization. */
export function expandPermissionTokensToCanonicalSet(
  tokens: readonly string[],
): Set<string> {
  const out = new Set<string>();
  for (const t of tokens) {
    for (const c of resolveCanonicalPermissionKeys(t)) out.add(c);
  }
  return out;
}

export function sortRolesForFold<T extends { id: string; position: number }>(
  roles: readonly T[],
): T[] {
  return [...roles].sort((a, b) => {
    if (a.position !== b.position) return a.position - b.position;
    return a.id.localeCompare(b.id);
  });
}

export function parsePermissionsArray(raw: unknown): string[] {
  if (raw == null) return [];
  if (Array.isArray(raw)) {
    return raw.filter((x): x is string => typeof x === 'string');
  }
  if (typeof raw === 'object' && !Array.isArray(raw)) {
    return Object.entries(raw as Record<string, unknown>)
      .filter(([, value]) => value === true)
      .map(([key]) => key);
  }
  return [];
}

/** Raw `echo_roles.permissions` JSONB → canonical permission keys granted by that role alone. */
export function expandStoredRolePermissionsToCanonSet(
  raw: unknown,
): Set<string> {
  return expandPermissionTokensToCanonicalSet(parsePermissionsArray(raw));
}

/** A write to bit p = value is exactly true or false (object / row normalized first). */
export function isWriteValue(v: unknown): v is boolean {
  return v === true || v === false;
}

/** Spec alias */
export const isWrite = isWriteValue;

export type FoldRolePermissionsOptions = {
  allKeys?: readonly string[];
  trace?: FoldTraceContext;
  /** When true, skip internal sort — caller guarantees (position ASC, id ASC) order. */
  presorted?: boolean;
};

function emitServerFoldTrace(
  ctx: FoldTraceContext | undefined,
  ev: ServerFoldTraceEventFull,
): void {
  if (!ctx || ctx.mode !== 'full' || !ctx.full) return;
  ctx.full.push(ev);
}

/** Frozen full-permission set reused for ADMIN materialization (avoids per-bit loop). */
const FULL_PERMISSION_SET: ReadonlySet<string> = new Set<string>(
  ECHO_PERMISSIONS,
);

/**
 * Single-source fold for role arrays (union across assigned roles). Call only from permission evaluation.
 *
 * Performance:
 * - `presorted: true` skips O(R log R) sort when caller guarantees (position ASC, id ASC) order.
 * - ADMIN short-circuit: if any role grants `ADMINISTRATOR`, return full permission set.
 * - Trace emission is branch-predicted on mode flags hoisted before the loop.
 */
export function foldRolePermissions(
  roles: ReadonlyArray<{
    id: string;
    position: number;
    permissions: unknown;
    /** When `visual`, this role contributes no permission bits (decorative only). */
    roleType?: string;
  }>,
  options?: FoldRolePermissionsOptions,
): Set<string> {
  const allKeys = options?.allKeys ?? [...ECHO_PERMISSIONS];
  const ordered = options?.presorted ? roles : sortRolesForFold(roles);
  const lastTrue = new Set<string>();

  const trace = options?.trace;
  const isFullTrace = trace?.mode === 'full' && trace.full != null;
  const isCompressedTrace =
    trace?.mode === 'compressed' && trace.compressed != null;

  let hasAdministrator = false;

  for (const role of ordered) {
    if (normalizeEchoRoleType(role.roleType) === 'visual') {
      continue;
    }
    const arr = parsePermissionsArray(role.permissions);
    const arrSet = expandPermissionTokensToCanonicalSet(arr);
    if (arr.includes('ADMINISTRATOR') || arrSet.has('ADMINISTRATOR')) {
      hasAdministrator = true;
      if (isFullTrace) {
        emitServerFoldTrace(trace, {
          kind: 'server_fold_bit',
          bit: '*',
          roleId: role.id,
          value: true,
          reason: 'administrator',
        });
      }
      if (isCompressedTrace) {
        recordCompressedBulkAdmin(trace!.compressed!, role.id, allKeys);
      }
    }
    for (const k of allKeys) {
      if (!ALL_KEYS.has(k)) continue;
      const v = arrSet.has(k);
      if (!v) continue;
      lastTrue.add(k);
      if (isFullTrace) {
        emitServerFoldTrace(trace, {
          kind: 'server_fold_bit',
          bit: k,
          roleId: role.id,
          value: v,
        });
      }
      if (isCompressedTrace) {
        recordCompressedSource(
          trace!.compressed!,
          k,
          'server',
          `role:${role.id}`,
        );
      }
    }
  }

  if (hasAdministrator) {
    return new Set(FULL_PERMISSION_SET);
  }

  return lastTrue;
}

export function aggregateServerRolesToSet(
  roles: ReadonlyArray<{
    id: string;
    position: number;
    permissions: unknown;
    roleType?: string;
  }>,
  allKeys: readonly string[] = [...ECHO_PERMISSIONS],
): Set<string> {
  return foldRolePermissions(roles, { allKeys });
}

/** Normalize channel/category overwrite JSON: legacy keys → Discord keys, boolean writes only. */
export function normalizePermissionOverwritePartial(
  raw: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (!isWriteValue(v)) continue;
    for (const canon of resolveCanonicalPermissionKeys(k)) {
      if (!ALL_KEYS.has(canon)) continue;
      out[canon] = v;
    }
  }
  return out;
}

/** Normalize JSON object to boolean writes only (missing / null / non-boolean dropped). */
export function parseNormalizedPermissionObject(
  raw: unknown,
): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const k of Object.keys(raw as Record<string, unknown>)) {
    const v = (raw as Record<string, unknown>)[k];
    if (isWriteValue(v)) out[k] = v;
  }
  return out;
}

/**
 * Apply partial JSON object overrides (boolean writes only); missing keys inherit from prev.
 * Iterates only `Object.keys(obj)` intersected with the allowed set — O(writes) not O(|allKeys|).
 */
export function applyLayerFromPartialObject(
  prev: Set<string>,
  obj: Record<string, unknown> | null | undefined,
  allKeys: readonly string[],
  opts?: { layer: 'category' | 'channel'; trace?: FoldTraceContext },
): Set<string> {
  const next = new Set(prev);
  if (!obj || typeof obj !== 'object') return next;
  const allowed =
    allKeys.length === ALL_KEYS.size ? ALL_KEYS : new Set(allKeys);
  const isFullTrace = opts?.trace?.mode === 'full' && opts.trace.full != null;
  for (const [k, rawV] of Object.entries(obj)) {
    if (!isWriteValue(rawV)) continue;
    for (const canon of resolveCanonicalPermissionKeys(k)) {
      if (!allowed.has(canon)) continue;
      if (rawV) next.add(canon);
      else next.delete(canon);
      if (isFullTrace) {
        emitTraceEvent(opts!.trace!, {
          kind: 'layer_apply_bit',
          layer: opts!.layer,
          bit: canon,
          value: rawV,
        });
      }
    }
  }
  return next;
}

export function normalizePermissionListForStorage(
  input: unknown,
  allowed: ReadonlySet<string>,
): string[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const x of input) {
    if (typeof x !== 'string') continue;
    for (const c of resolveCanonicalPermissionKeys(x)) {
      if (!allowed.has(c)) continue;
      if (seen.has(c)) continue;
      seen.add(c);
      out.push(c);
    }
  }
  return out;
}
