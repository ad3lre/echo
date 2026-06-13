import assert from 'node:assert/strict';
import {
  getCachedServerMemberUserIds,
  setCachedServerMemberUserIds,
  invalidateServerMemberUserIds,
  resetEchoServerMemberIdsCacheForTests,
} from '../domain/echoServerMemberIdsCache';
import {
  invalidateEchoPermissionCacheForServer,
  invalidateEchoPermissionCacheForUser,
} from '../domain/echoPermissionCache';
import { resetCacheInvalidationBusForTests } from '../domain/cacheInvalidationBus';

function run() {
  const s1 = 'server-1';
  const s2 = 'server-2';

  resetEchoServerMemberIdsCacheForTests();

  // Round-trips store and read back.
  setCachedServerMemberUserIds(s1, ['u1', 'u2']);
  assert.deepEqual(getCachedServerMemberUserIds(s1), ['u1', 'u2']);
  assert.equal(getCachedServerMemberUserIds(s2), null, 'miss for other server');

  // Direct invalidation drops only that server.
  setCachedServerMemberUserIds(s2, ['u3']);
  invalidateServerMemberUserIds(s1);
  assert.equal(getCachedServerMemberUserIds(s1), null, 's1 dropped');
  assert.deepEqual(getCachedServerMemberUserIds(s2), ['u3'], 's2 retained');

  // Server-scoped permission invalidation cascades into the member-id cache,
  // so every existing membership mutation site clears the list for free.
  setCachedServerMemberUserIds(s1, ['u1']);
  invalidateEchoPermissionCacheForServer(s1);
  assert.equal(
    getCachedServerMemberUserIds(s1),
    null,
    'server invalidator cascades',
  );

  // User-scoped permission invalidation (join/leave/kick are user-scoped
  // mutations) also drops the server's member-id list.
  setCachedServerMemberUserIds(s1, ['u1']);
  invalidateEchoPermissionCacheForUser(s1, 'u1');
  assert.equal(
    getCachedServerMemberUserIds(s1),
    null,
    'user invalidator cascades',
  );

  console.log('echo.serverMemberIdsCache.test: ok');
  resetCacheInvalidationBusForTests();
}

run();
