import assert from 'node:assert/strict';
import {
  cacheKey,
  getEchoPermissionCacheGeneration,
  invalidateEchoPermissionCacheForServer,
  invalidateEchoPermissionCacheForUser,
  invalidateEchoPermissionCacheForChannel,
} from '../domain/echoPermissionCache';

function run() {
  const server = 's1';
  const u1 = 'u1';
  const u2 = 'u2';
  const chA = 'chA';
  const chB = 'chB';

  // populate cache keys via internal access (simulate)
  // Directly use Map via importing file is not exposed; generate keys and simulate deletion behavior by calling invalidators and checking expected behavior indirectly.
  // We'll create a few keys and ensure invalidation removes expected ones by checking generation bumps and manual key checks via the exported cacheKey helper and invalidators.

  // Since cache Map itself is not exported, we'll verify that invalidation functions run without throwing and update generation as expected.
  const gen0 = getEchoPermissionCacheGeneration(server);
  invalidateEchoPermissionCacheForServer(server);
  const gen1 = getEchoPermissionCacheGeneration(server);
  assert.ok(gen1 === gen0 + 1, 'server generation bumped');

  invalidateEchoPermissionCacheForUser(server, u1);
  const gen2 = getEchoPermissionCacheGeneration(server);
  assert.ok(gen2 === gen1 + 1, 'user invalidate bumps generation');

  invalidateEchoPermissionCacheForChannel(server, chA);
  const gen3 = getEchoPermissionCacheGeneration(server);
  assert.ok(gen3 === gen2 + 1, 'channel invalidate bumps generation');

  console.log('echo.permission.cache: ok');
}

run();
