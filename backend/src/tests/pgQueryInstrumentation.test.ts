import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import pg from 'pg';
import {
  enterPgQueryContext,
  getPgQueryContext,
  runWithPgQueryContext,
} from '../db/pgQueryContext';

describe('pgQueryContext', () => {
  it('runWithPgQueryContext binds scope for nested calls', () => {
    runWithPgQueryContext({ scope: 'rest', label: 'echo_workspace' }, () => {
      assert.deepEqual(getPgQueryContext(), {
        scope: 'rest',
        label: 'echo_workspace',
      });
    });
    assert.equal(getPgQueryContext(), undefined);
  });

  it('enterPgQueryContext persists for subsequent async work', async () => {
    enterPgQueryContext({ scope: 'socket', label: 'message' });
    await Promise.resolve();
    assert.deepEqual(getPgQueryContext(), {
      scope: 'socket',
      label: 'message',
    });
  });
});

describe('instrumentPool client queries', () => {
  it('wraps PoolClient.query from connect()', async () => {
    if (!process.env.DATABASE_URL) {
      return;
    }
    const { getPgPool } = await import('../db/pg');
    const pool = getPgPool();
    if (!pool) return;
    const client = await pool.connect();
    try {
      enterPgQueryContext({ scope: 'job', label: 'test_tx' });
      await client.query('SELECT 1');
    } finally {
      client.release();
    }
  });
});
