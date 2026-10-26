import assert from 'node:assert/strict';
import type pg from 'pg';
import {
  consumeEchoInvite,
  createEchoInvite,
  resolveEchoInvite,
  resolveEchoInviteLimits,
  revokeEchoInvite,
} from './invites';
import { buildEchoInviteShareNotFoundHtml } from '../../../services/echoInviteSharePage';

type Call = { sql: string; params: unknown[] };

function fakePool(rowsFor: (sql: string) => unknown[]): {
  pool: pg.Pool;
  calls: Call[];
} {
  const calls: Call[] = [];
  const pool = {
    query: async (sql: string, params: unknown[] = []) => {
      calls.push({ sql, params });
      const rows = rowsFor(sql.trim());
      return { rows, rowCount: rows.length };
    },
  } as unknown as pg.Pool;
  return { pool, calls };
}

async function run(): Promise<void> {
  const week = 7 * 24 * 60 * 60;

  assert.deepEqual(resolveEchoInviteLimits(), {
    maxAgeSec: week,
    maxUses: null,
  });
  assert.deepEqual(resolveEchoInviteLimits({ maxAgeSec: 0 }), {
    maxAgeSec: null,
    maxUses: null,
  });
  assert.deepEqual(resolveEchoInviteLimits({ maxAgeSec: 3600, maxUses: 5 }), {
    maxAgeSec: 3600,
    maxUses: 5,
  });
  assert.equal(resolveEchoInviteLimits({ maxUses: 0 }).maxUses, null);
  assert.equal(resolveEchoInviteLimits({ maxUses: 99999 }).maxUses, 1000);
  assert.deepEqual(resolveEchoInviteLimits({ skipsApplication: true }), {
    maxAgeSec: week,
    maxUses: 1,
  });
  assert.equal(
    resolveEchoInviteLimits({ skipsApplication: true, maxAgeSec: 0 }).maxAgeSec,
    week,
  );
  assert.equal(
    resolveEchoInviteLimits({ skipsApplication: true, maxAgeSec: 30 * 86400 })
      .maxAgeSec,
    week,
  );
  assert.equal(
    resolveEchoInviteLimits({ skipsApplication: true, maxUses: 4 }).maxUses,
    4,
  );

  {
    const { pool, calls } = fakePool(() => []);
    await createEchoInvite(pool, 's1', 'u1');
    assert.match(calls[0]!.sql, /expires_at, max_uses/);
    assert.equal(calls[0]!.params[4], week);
    assert.equal(calls[0]!.params[5], null);
  }

  {
    const { pool, calls } = fakePool(() => [{ code: 'abc' }]);
    assert.equal(await consumeEchoInvite(pool, 'abc', 's1'), true);
    const sql = calls[0]!.sql;
    assert.match(sql, /UPDATE echo_invites SET uses = uses \+ 1/);
    assert.match(sql, /revoked_at IS NULL/);
    assert.match(sql, /expires_at IS NULL OR expires_at > NOW\(\)/);
    assert.match(sql, /max_uses IS NULL OR uses < max_uses/);
    const none = fakePool(() => []);
    assert.equal(await consumeEchoInvite(none.pool, 'abc', 's1'), false);
  }

  {
    const { pool, calls } = fakePool(() => []);
    assert.equal(await resolveEchoInvite(pool, 'abc'), null);
    assert.match(calls[0]!.sql, /revoked_at IS NULL/);
  }

  {
    const row = [{ inviter_id: 'owner' }];
    const sel = (sql: string) => (sql.startsWith('SELECT') ? row : []);
    const a = fakePool(sel);
    assert.deepEqual(
      await revokeEchoInvite(a.pool, 's1', 'c', 'other', false),
      { ok: false, reason: 'forbidden' },
    );
    assert.equal(a.calls.length, 1);
    const b = fakePool(sel);
    assert.deepEqual(
      await revokeEchoInvite(b.pool, 's1', 'c', 'owner', false),
      {
        ok: true,
      },
    );
    assert.match(b.calls[1]!.sql, /SET revoked_at/);
    const c = fakePool(sel);
    assert.deepEqual(await revokeEchoInvite(c.pool, 's1', 'c', 'admin', true), {
      ok: true,
    });
    const d = fakePool(() => []);
    assert.deepEqual(await revokeEchoInvite(d.pool, 's1', 'c', 'owner', true), {
      ok: false,
      reason: 'not_found',
    });
  }

  const html = buildEchoInviteShareNotFoundHtml({
    canonicalAppBase: 'https://echo.example',
    socialRequestPath: `/"><script>alert(1)</script>'`,
  });
  assert.ok(!html.includes('<script>alert(1)</script>'));
  assert.ok(html.includes('&lt;script&gt;'));

  console.log('echoInviteLimits: ok');
}

void run();
