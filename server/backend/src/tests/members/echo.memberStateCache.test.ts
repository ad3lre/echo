import assert from 'node:assert/strict';
import {
  getCachedMemberAccessState,
  setCachedMemberAccessState,
  invalidateMemberAccessStateForServer,
  invalidateMemberAccessStateForUser,
  resetEchoMemberStateCacheForTests,
} from '../../domain/echoMemberStateCache';
import {
  getEchoPermissionCacheGeneration,
  invalidateEchoPermissionCacheForServer,
  invalidateEchoPermissionCacheForUser,
} from '../../domain/permissions/echoPermissionCache';

function run() {
  const server = 's1';
  const u1 = 'u1';
  const u2 = 'u2';

  resetEchoMemberStateCacheForTests();

  // Round-trips store and read back.
  setCachedMemberAccessState(server, u1, {
    isMember: true,
    banned: false,
    timeoutUntilEpochMs: null,
  });
  const hit = getCachedMemberAccessState(server, u1);
  assert.ok(hit, 'member state cached');
  assert.equal(hit?.isMember, true);
  assert.equal(hit?.banned, false);
  assert.equal(hit?.timeoutUntilEpochMs, null);

  // Per-user invalidation drops only that user.
  setCachedMemberAccessState(server, u2, {
    isMember: true,
    banned: false,
    timeoutUntilEpochMs: null,
  });
  invalidateMemberAccessStateForUser(server, u1);
  assert.equal(getCachedMemberAccessState(server, u1), null, 'u1 dropped');
  assert.ok(getCachedMemberAccessState(server, u2), 'u2 retained');

  // Per-server invalidation drops everyone in the server.
  invalidateMemberAccessStateForServer(server);
  assert.equal(getCachedMemberAccessState(server, u2), null, 'server cleared');

  // The permission cache invalidators must cascade into the member-state cache,
  // so every existing mutation site clears membership/ban/timeout for free.
  setCachedMemberAccessState(server, u1, {
    isMember: true,
    banned: false,
    timeoutUntilEpochMs: null,
  });
  invalidateEchoPermissionCacheForUser(server, u1);
  assert.equal(
    getCachedMemberAccessState(server, u1),
    null,
    'perm user invalidate cascades to member state',
  );

  setCachedMemberAccessState(server, u1, {
    isMember: true,
    banned: false,
    timeoutUntilEpochMs: null,
  });
  setCachedMemberAccessState(server, u2, {
    isMember: true,
    banned: true,
    timeoutUntilEpochMs: null,
  });
  invalidateEchoPermissionCacheForServer(server);
  assert.equal(
    getCachedMemberAccessState(server, u1),
    null,
    'perm server invalidate cascades (u1)',
  );
  assert.equal(
    getCachedMemberAccessState(server, u2),
    null,
    'perm server invalidate cascades (u2)',
  );

  // Generation guard: a fill started before invalidation must not repopulate stale state.
  resetEchoMemberStateCacheForTests();
  const genBefore = getEchoPermissionCacheGeneration(server);
  setCachedMemberAccessState(server, u1, {
    isMember: true,
    banned: false,
    timeoutUntilEpochMs: null,
  });
  invalidateEchoPermissionCacheForServer(server);
  assert.ok(
    getEchoPermissionCacheGeneration(server) > genBefore,
    'invalidation bumps generation',
  );
  assert.equal(
    getCachedMemberAccessState(server, u1),
    null,
    'invalidation clears member state before a guarded fill could land',
  );

  console.log('echo.memberStateCache: ok');
}

run();
