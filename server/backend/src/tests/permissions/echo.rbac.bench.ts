/**
 * Synthetic RBAC fold benchmark: measures foldRolePermissions and applyLayerFromPartialObject
 * under extreme conditions (500–1000 roles, admin-heavy, multi-layer).
 *
 * Run: npx ts-node src/tests/permissions/echo.rbac.bench.ts
 */

import {
  ECHO_PERMISSIONS,
  foldRolePermissions,
  applyLayerFromPartialObject,
} from '../../domain/permissions/echoPermissionPrimitives';
import { createTraceCollector } from '../../domain/permissions/echoPermissionTrace';
import type { FoldTraceContext } from '../../domain/permissions/echoPermissionTrace';

const ALL = [...ECHO_PERMISSIONS];
const ITERATIONS = 5_000;

function makeRoles(
  count: number,
  adminEvery: number,
): { id: string; position: number; permissions: string[] }[] {
  const roles: { id: string; position: number; permissions: string[] }[] = [];
  for (let i = 0; i < count; i++) {
    if (adminEvery > 0 && i % adminEvery === 0) {
      roles.push({ id: `r${i}`, position: i, permissions: ['ADMINISTRATOR'] });
    } else {
      const perms = ALL.filter((_, idx) => (i + idx) % 3 === 0);
      roles.push({ id: `r${i}`, position: i, permissions: perms });
    }
  }
  return roles;
}

function bench(label: string, fn: () => void): void {
  fn(); // warm
  const start = performance.now();
  for (let i = 0; i < ITERATIONS; i++) fn();
  const elapsed = performance.now() - start;
  const perOp = (elapsed / ITERATIONS).toFixed(4);
  console.log(
    `${label}: ${ITERATIONS} iterations in ${elapsed.toFixed(1)}ms (${perOp}ms/op)`,
  );
}

const roles500 = makeRoles(500, 0);
const roles500sorted = [...roles500].sort(
  (a, b) => a.position - b.position || a.id.localeCompare(b.id),
);
const roles1000admin = makeRoles(1000, 50);
const roles1000adminSorted = [...roles1000admin].sort(
  (a, b) => a.position - b.position || a.id.localeCompare(b.id),
);

console.log('--- foldRolePermissions ---');

bench('500 roles, no admin, unsorted', () => {
  foldRolePermissions(roles500, { allKeys: ALL });
});

bench('500 roles, no admin, presorted', () => {
  foldRolePermissions(roles500sorted, { allKeys: ALL, presorted: true });
});

bench('1000 roles, admin every 50, unsorted', () => {
  foldRolePermissions(roles1000admin, { allKeys: ALL });
});

bench('1000 roles, admin every 50, presorted', () => {
  foldRolePermissions(roles1000adminSorted, { allKeys: ALL, presorted: true });
});

bench('1000 roles, admin every 50, presorted + compressed trace', () => {
  const col = createTraceCollector('compressed');
  const ctx: FoldTraceContext = {
    mode: 'compressed',
    compressed: col.compressed!,
  };
  foldRolePermissions(roles1000adminSorted, {
    allKeys: ALL,
    presorted: true,
    trace: ctx,
  });
});

console.log('\n--- applyLayerFromPartialObject ---');

const baseState = new Set(ECHO_PERMISSIONS.slice(0, 5));
const sparseOverride: Record<string, unknown> = {
  VIEW_CHANNEL: false,
  MANAGE_GUILD: true,
};
const denseOverride: Record<string, unknown> = {};
for (const k of ALL) denseOverride[k] = true;

bench('sparse override (2 keys)', () => {
  applyLayerFromPartialObject(baseState, sparseOverride, ALL);
});

bench('dense override (all keys)', () => {
  applyLayerFromPartialObject(baseState, denseOverride, ALL);
});

console.log('\necho.rbac.bench: done');
