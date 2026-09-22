import assert from 'node:assert/strict';
import test from 'node:test';
import { listEchoMutualServers } from './mutualServers.ts';

test('listEchoMutualServers returns empty for self or blank ids', async () => {
  const pool = {
    query: async () => {
      throw new Error('should not query');
    },
  } as never;

  assert.deepEqual(await listEchoMutualServers(pool, 'a', 'a'), []);
  assert.deepEqual(await listEchoMutualServers(pool, '', 'b'), []);
  assert.deepEqual(await listEchoMutualServers(pool, 'a', '  '), []);
});

test('listEchoMutualServers maps shared server rows', async () => {
  const calls: unknown[] = [];
  const pool = {
    query: async (_sql: string, params: unknown[]) => {
      calls.push(params);
      return {
        rows: [
          { id: 's1', name: 'Alpha', icon_url: 'https://cdn/a.png' },
          { id: 's2', name: 'Beta', icon_url: '  ' },
        ],
      };
    },
  } as never;

  const servers = await listEchoMutualServers(pool, 'viewer', 'peer');
  assert.deepEqual(calls, [['viewer', 'peer', 'echo_dm_realm']]);
  assert.deepEqual(servers, [
    { id: 's1', name: 'Alpha', iconUrl: 'https://cdn/a.png' },
    { id: 's2', name: 'Beta', iconUrl: '' },
  ]);
});
