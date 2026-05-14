import {
  ECHO_PERMISSIONS,
  expandPermissionTokensToCanonicalSet,
  parsePermissionsArray,
} from './echoPermissionPrimitives';
import type { FoldTraceContext } from './echoPermissionTrace';
import {
  recordCompressedBulkAdmin,
  recordCompressedSource,
  emitTraceEvent,
} from './echoPermissionTrace';
import { normalizeEchoRoleType } from '../../../shared/echoRoleTypes';

const ALL_KEYS = new Set<string>(ECHO_PERMISSIONS);

export function foldRolePermissionsSparse(
  roles: ReadonlyArray<{
    id: string;
    position: number;
    permissions: unknown;
    roleType?: string;
  }>,
  options?: {
    allKeys?: readonly string[];
    trace?: FoldTraceContext;
    presorted?: boolean;
  },
): Set<string> {
  const allKeys = options?.allKeys ?? [...ECHO_PERMISSIONS];
  const ordered = options?.presorted
    ? roles
    : [...roles].sort((a, b) => {
        if (a.position !== b.position) return a.position - b.position;
        return a.id.localeCompare(b.id);
      });

  let lastTrue = new Set<string>();

  const trace = options?.trace;
  const isFullTrace = trace?.mode === 'full' && trace.full != null;
  const isCompressedTrace =
    trace?.mode === 'compressed' && trace.compressed != null;

  let adminSentinel: string | null = null;

  for (const role of ordered) {
    if (normalizeEchoRoleType(role.roleType) === 'visual') {
      continue;
    }
    const perms = parsePermissionsArray(role.permissions);
    const canonSet = expandPermissionTokensToCanonicalSet(perms);
    if (perms.includes('ADMINISTRATOR') || canonSet.has('ADMINISTRATOR')) {
      adminSentinel = role.id;
      if (isFullTrace) {
        emitTraceEvent(
          trace as FoldTraceContext,
          {
            kind: 'server_fold_bit',
            bit: '*',
            roleId: role.id,
            value: true,
            reason: 'administrator',
          } as any,
        );
      }
      if (isCompressedTrace) {
        recordCompressedBulkAdmin(trace!.compressed!, role.id, allKeys);
      }
      continue;
    }
    if (adminSentinel !== null) {
      lastTrue = new Set(ECHO_PERMISSIONS);
      adminSentinel = null;
    }
    // Sparse iteration: only iterate permissions present on the role (writes)
    for (const k of canonSet) {
      if (!ALL_KEYS.has(k)) continue;
      // write true
      lastTrue.add(k);
      if (isFullTrace) {
        emitTraceEvent(
          trace as FoldTraceContext,
          {
            kind: 'server_fold_bit',
            bit: k,
            roleId: role.id,
            value: true,
          } as any,
        );
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
    // Note: removes (false) writes are not representable in sparse permission arrays; arrays imply "present = true"
  }

  if (adminSentinel !== null) {
    return new Set(ECHO_PERMISSIONS);
  }

  return lastTrue;
}
