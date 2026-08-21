import assert from 'node:assert/strict';
import {
  getCachedServerAggregate,
  setCachedServerAggregate,
  invalidateServerAggregate,
  getEchoServerAggregateGeneration,
  resetEchoServerAggregateCacheForTests,
  type ServerPermissionAggregate,
} from '../../domain/echoServerPermissionAggregateCache';
import {
  getCachedMemberRoleIds,
  setCachedMemberRoleIds,
  invalidateMemberRoleIdsForUser,
  invalidateMemberRoleIdsForServer,
  resetEchoMemberRoleIdsCacheForTests,
} from '../../domain/echoMemberRoleIdsCache';
import {
  invalidateEchoPermissionCacheForServer,
  invalidateEchoPermissionCacheForUser,
  invalidateEchoPermissionCacheForChannel,
} from '../../domain/permissions/echoPermissionCache';
import { resetCacheInvalidationBusForTests } from '../../domain/cacheInvalidationBus';

function emptyAgg(): ServerPermissionAggregate {
  return {
    ownerId: null,
    roles: [],
    minPosition: 0,
    channelInfo: new Map(),
    channelOverwriteRows: new Map(),
    categoryOverwriteRows: new Map(),
    categoryLegacyOverride: new Map(),
  };
}

function run() {
  resetEchoServerAggregateCacheForTests();
  resetEchoMemberRoleIdsCacheForTests();

  // Round-trip.
  setCachedServerAggregate('s1', emptyAgg());
  assert.ok(getCachedServerAggregate('s1'), 'aggregate cached');
  assert.equal(getCachedServerAggregate('s2'), null);

  setCachedMemberRoleIds('s1', 'u1', new Set(['r1', 'r2']));
  assert.deepEqual(
    [...(getCachedMemberRoleIds('s1', 'u1') ?? [])],
    ['r1', 'r2'],
  );

  // Direct invalidation bumps generation.
  const g0 = getEchoServerAggregateGeneration();
  invalidateServerAggregate('s1');
  assert.equal(getCachedServerAggregate('s1'), null);
  assert.ok(getEchoServerAggregateGeneration() > g0);

  // Member role-ids: per-user vs per-server invalidation.
  setCachedMemberRoleIds('s1', 'u1', new Set(['r1']));
  setCachedMemberRoleIds('s1', 'u2', new Set(['r2']));
  invalidateMemberRoleIdsForUser('s1', 'u1');
  assert.equal(getCachedMemberRoleIds('s1', 'u1'), null, 'u1 dropped');
  assert.ok(getCachedMemberRoleIds('s1', 'u2'), 'u2 retained');
  invalidateMemberRoleIdsForServer('s1');
  assert.equal(getCachedMemberRoleIds('s1', 'u2'), null, 'server sweep');

  // Cascade: the permission cache invalidators must drop both new caches, so every existing
  // role/overwrite/channel mutation site clears them for free.
  setCachedServerAggregate('s1', emptyAgg());
  setCachedMemberRoleIds('s1', 'u1', new Set(['r1']));
  invalidateEchoPermissionCacheForServer('s1');
  assert.equal(
    getCachedServerAggregate('s1'),
    null,
    'server invalidator → aggregate',
  );
  assert.equal(
    getCachedMemberRoleIds('s1', 'u1'),
    null,
    'server invalidator → member roles',
  );

  setCachedMemberRoleIds('s1', 'u1', new Set(['r1']));
  invalidateEchoPermissionCacheForUser('s1', 'u1');
  assert.equal(
    getCachedMemberRoleIds('s1', 'u1'),
    null,
    'user invalidator → member roles',
  );

  setCachedServerAggregate('s1', emptyAgg());
  invalidateEchoPermissionCacheForChannel('s1', 'c1');
  assert.equal(
    getCachedServerAggregate('s1'),
    null,
    'channel invalidator → aggregate (channel overwrite edits)',
  );

  console.log('echo.serverAggregateCache.test: ok');
  resetCacheInvalidationBusForTests();
}

run();
