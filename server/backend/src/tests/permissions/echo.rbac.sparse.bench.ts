/**
 * Compare standard foldRolePermissions vs sparse fold implementation.
 * Run: npx ts-node src/tests/permissions/echo.rbac.sparse.bench.ts
 */

import {
  ECHO_PERMISSIONS,
  foldRolePermissions,
} from '../../domain/permissions/echoPermissionPrimitives';
import { foldRolePermissionsSparse } from '../../domain/permissions/echoPermissionPrimitivesSparse';

const ALL = [...ECHO_PERMISSIONS];
const ITERATIONS = 2000;

function makeRoles(
  count: number,
  adminEvery: number,
): { id: string; position: number; permissions: string[] }[] {
  const roles: { id: string; position: number; permissions: string[] }[] = [];
  for (let i = 0; i < count; i++) {
    if (adminEvery > 0 && i % adminEvery === 0) {
      roles.push({ id: `r${i}`, position: i, permissions: ['ADMINISTRATOR'] });
    } else {
      const perms = ALL.filter((_, idx) => (i + idx) % 4 === 0);
      roles.push({ id: `r${i}`, position: i, permissions: perms });
    }
  }
  return roles;
}

function bench(label: string, fn: () => void): void {
  fn();
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

bench('foldRolePermissions 500 presorted', () =>
  foldRolePermissions(roles500sorted, { allKeys: ALL, presorted: true }),
);
bench('foldRolePermissionsSparse 500 presorted', () =>
  foldRolePermissionsSparse(roles500sorted, { allKeys: ALL, presorted: true }),
);

console.log('sparse bench done');
