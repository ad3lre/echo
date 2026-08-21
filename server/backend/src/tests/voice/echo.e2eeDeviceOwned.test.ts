import assert from 'node:assert/strict';
import type pg from 'pg';
import { assertEchoE2eeDeviceOwned } from '../../domain/echoStore/voice/e2ee';

function mockPool(row: { revoked_at: unknown } | null): pg.Pool {
  return {
    query: async () =>
      ({
        rowCount: row ? 1 : 0,
        rows: row ? [row] : [],
      }) as pg.QueryResult,
  } as unknown as pg.Pool;
}

async function run(): Promise<void> {
  assert.equal(
    await assertEchoE2eeDeviceOwned(mockPool(null), 'u1', 'dev1'),
    'missing',
  );
  assert.equal(
    await assertEchoE2eeDeviceOwned(
      mockPool({ revoked_at: null }),
      'u1',
      'dev1',
    ),
    'ok',
  );
  assert.equal(
    await assertEchoE2eeDeviceOwned(
      mockPool({ revoked_at: '2020-01-01' }),
      'u1',
      'dev1',
    ),
    'revoked',
  );
  assert.equal(
    await assertEchoE2eeDeviceOwned(mockPool(null), 'u1', '  '),
    'missing',
  );

  console.log('echo.e2eeDeviceOwned: ok');
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
