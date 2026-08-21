import assert from 'node:assert/strict';
import pg from 'pg';
import { ECHO_VC_ACTIVITY_KEYS } from '../../../../activities/cores/vcActivityCatalog';
import { ensureEchoTables } from '../../db/echoTables';
import {
  incrementEchoVcActivityOpen,
  listEchoVcActivityPopularityOrdered,
} from '../../domain/echoStore/voice/vcActivityPopularity';

async function run(): Promise<void> {
  const databaseUrl = process.env.PG_TEST_URL ?? process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.log(
      'Skipping echo.vcActivityPopularity: PG_TEST_URL / DATABASE_URL not set',
    );
    return;
  }
  const pool = new pg.Pool({ connectionString: databaseUrl });
  try {
    await ensureEchoTables(pool);

    await pool.query(
      `DELETE FROM echo_vc_activity_opens WHERE activity_key IN ('wordle', 'youtube', 'krunker')`,
    );

    await incrementEchoVcActivityOpen(pool, 'wordle');
    await incrementEchoVcActivityOpen(pool, 'wordle');
    await incrementEchoVcActivityOpen(pool, 'youtube');
    await incrementEchoVcActivityOpen(pool, 'krunker');

    const rows = await listEchoVcActivityPopularityOrdered(pool);
    assert.equal(rows.length, ECHO_VC_ACTIVITY_KEYS.length);
    assert.equal(rows[0]!.activityKey, 'wordle');
    assert.equal(rows[0]!.openCount, 2);
    assert.equal(rows[1]!.activityKey, 'krunker');
    assert.equal(rows[1]!.openCount, 1);
    assert.equal(rows[2]!.activityKey, 'youtube');
    assert.equal(rows[2]!.openCount, 1);

    const tieStart = 3;
    for (let i = tieStart + 1; i < rows.length; i++) {
      assert.equal(
        rows[i]!.openCount,
        0,
        'remaining catalog entries should have zero opens',
      );
      assert.ok(
        rows[i]!.activityKey > rows[i - 1]!.activityKey,
        'secondary sort: ascending activity_key when open_count ties at zero',
      );
    }

    await pool.query(
      `DELETE FROM echo_vc_activity_opens WHERE activity_key IN ('wordle', 'youtube', 'krunker')`,
    );

    console.log('echo.vcActivityPopularity: ok');
  } finally {
    await pool.end();
  }
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
