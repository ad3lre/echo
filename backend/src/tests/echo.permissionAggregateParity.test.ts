import assert from 'node:assert/strict';
import {
  buildBatchEvaluationPlans,
  buildEvaluationPlan,
  executeEvaluationPlan,
} from '../domain/echoPermissionEvaluate';
import {
  buildBatchEvaluationPlansFromAggregate,
  buildEvaluationPlanFromAggregate,
} from '../domain/echoPermissionAggregateFold';
import { resetEchoServerAggregateCacheForTests } from '../domain/echoServerPermissionAggregateCache';
import { resetEchoMemberRoleIdsCacheForTests } from '../domain/echoMemberRoleIdsCache';
import { resetEchoMemberStateCacheForTests } from '../domain/echoMemberStateCache';

function resetAggregateCaches(): void {
  resetEchoServerAggregateCacheForTests();
  resetEchoMemberRoleIdsCacheForTests();
  resetEchoMemberStateCacheForTests();
}

/**
 * Parity harness: the aggregate-cache fold must produce a byte-identical plan to the proven
 * direct-DB fold for the same data. A single fake pool answers BOTH the per-fold queries
 * (direct path) and the server-wide aggregate queries (cache path) from one fixture, so any
 * divergence in how the cached path selects roles/overwrites surfaces as a mismatch.
 *
 * Note: this is the non-Postgres safety net. The Postgres-backed echo.permissionBatchParity
 * integration suite (npm run db:up + test:ci:backend:integration) is the authoritative
 * regression check for the aggregate fold.
 */

type Role = {
  id: string;
  position: number;
  permissions: unknown;
  role_type: string;
};
type OwRow = {
  id: string;
  category_id?: string;
  channel_id?: string;
  target_type: string;
  target_id: string | null;
  partial: unknown;
};

const FX = {
  serverId: 'S',
  ownerId: 'OWNER',
  members: new Set(['U_mod', 'U_muted', 'U_plain', 'U_banned']),
  bans: new Set(['U_banned']),
  roles: [
    {
      id: 'mod',
      position: 5,
      permissions: ['MANAGE_MESSAGES'],
      role_type: 'mixed',
    },
    { id: 'muted', position: 3, permissions: [], role_type: 'mixed' },
    {
      id: 'everyone',
      position: 0,
      permissions: ['VIEW_CHANNEL', 'SEND_MESSAGE'],
      role_type: 'mixed',
    },
  ] as Role[],
  memberRoles: {
    U_mod: ['mod'],
    U_muted: ['muted'],
    U_plain: [] as string[],
    U_banned: ['mod'],
  } as Record<string, string[]>,
  channels: {
    C_cat1: { category_id: 'CAT1', permission_overrides: null },
    C_legacyChan: {
      category_id: '',
      permission_overrides: { SEND_MESSAGE: false },
    },
    C_cat2legacy: { category_id: 'CAT2', permission_overrides: null },
    C_chanrows: { category_id: '', permission_overrides: null },
  } as Record<string, { category_id: string; permission_overrides: unknown }>,
  catRows: {
    CAT1: [
      {
        id: 'co1',
        category_id: 'CAT1',
        target_type: 'role',
        target_id: 'mod',
        partial: { MANAGE_MESSAGES: true },
      },
    ],
  } as Record<string, OwRow[]>,
  catLegacy: { CAT2: { VIEW_CHANNEL: true } } as Record<
    string,
    Record<string, unknown>
  >,
  chanRows: {
    C_chanrows: [
      {
        id: 'ch1',
        channel_id: 'C_chanrows',
        target_type: 'everyone',
        target_id: null,
        partial: { SEND_MESSAGE: false },
      },
    ],
  } as Record<string, OwRow[]>,
};

const MIN_POSITION = Math.min(...FX.roles.map((r) => r.position));

function byPosThenId(a: Role, b: Role): number {
  return a.position - b.position || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

function norm(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim();
}

function makePool(): import('pg').Pool {
  const query = async (rawSql: string, params: unknown[]) => {
    const sql = norm(rawSql);
    const has = (s: string) => sql.includes(s);

    if (has('owner_id FROM echo_servers')) {
      return { rows: [{ owner_id: FX.ownerId }] };
    }
    if (has('AS is_member')) {
      // Combined member-access state query (memberAccessState.ts) — must be routed
      // before the plain echo_server_members match below.
      const uid = String(params[1]);
      return {
        rows: [
          {
            is_member: FX.members.has(uid),
            banned: FX.bans.has(uid),
            timeout_until: null,
          },
        ],
      };
    }
    if (has('FROM echo_server_members')) {
      const uid = String(params[1]);
      return { rows: FX.members.has(uid) ? [{ ok: 1 }] : [] };
    }
    if (has('FROM echo_server_bans')) {
      const uid = String(params[1]);
      return { rows: FX.bans.has(uid) ? [{ ok: 1 }] : [] };
    }
    if (has('role_id FROM echo_member_roles')) {
      const uid = String(params[1]);
      return {
        rows: (FX.memberRoles[uid] ?? []).map((role_id) => ({ role_id })),
      };
    }
    if (has('FROM echo_roles')) {
      if (has('LEFT JOIN echo_member_roles')) {
        // Direct path: the member's roles + the min-position baseline tier.
        const uid = String(params[1]);
        const owned = new Set(FX.memberRoles[uid] ?? []);
        return {
          rows: FX.roles
            .filter((r) => owned.has(r.id) || r.position === MIN_POSITION)
            .sort(byPosThenId),
        };
      }
      // Aggregate path: all roles ordered.
      return { rows: [...FX.roles].sort(byPosThenId) };
    }
    if (has('FROM echo_channels')) {
      if (has('ch.id = $1')) {
        const cid = String(params[0]);
        const ch = FX.channels[cid];
        return {
          rows: ch
            ? [
                {
                  category_id: ch.category_id,
                  permission_overrides: ch.permission_overrides,
                },
              ]
            : [],
        };
      }
      return {
        rows: Object.entries(FX.channels).map(([id, ch]) => ({
          id,
          category_id: ch.category_id,
          permission_overrides: ch.permission_overrides,
        })),
      };
    }
    if (has('FROM echo_category_permission_overwrite_rows')) {
      if (has('category_id = $2')) {
        return { rows: FX.catRows[String(params[1])] ?? [] };
      }
      return { rows: Object.values(FX.catRows).flat() };
    }
    if (has('FROM echo_category_permission_overrides')) {
      if (has('category_id = $2')) {
        const leg = FX.catLegacy[String(params[1])];
        return { rows: leg ? [{ permission_overrides: leg }] : [] };
      }
      return {
        rows: Object.entries(FX.catLegacy).map(([category_id, ov]) => ({
          category_id,
          permission_overrides: ov,
        })),
      };
    }
    if (has('FROM echo_channel_permission_overwrite_rows')) {
      if (has('channel_id = $2')) {
        return { rows: FX.chanRows[String(params[1])] ?? [] };
      }
      return { rows: Object.values(FX.chanRows).flat() };
    }
    throw new Error(`unrouted query: ${sql}`);
  };
  return { query } as unknown as import('pg').Pool;
}

const CASES: Array<{ user: string; channel: string | undefined }> = [
  { user: 'OWNER', channel: 'C_cat1' }, // owner_bypass
  { user: 'U_outsider', channel: 'C_cat1' }, // not_member
  { user: 'U_banned', channel: 'C_cat1' }, // banned
  { user: 'U_mod', channel: 'C_cat1' }, // category overwrite rows
  { user: 'U_mod', channel: 'C_chanrows' }, // channel overwrite rows
  { user: 'U_plain', channel: 'C_cat2legacy' }, // legacy category override
  { user: 'U_plain', channel: 'C_legacyChan' }, // legacy channel override JSON
  { user: 'U_mod', channel: 'UNKNOWN_CHANNEL' }, // fail closed -> no_roles
  { user: 'U_mod', channel: undefined }, // roles only, no channel
  { user: 'U_plain', channel: 'C_cat1' }, // baseline-only member
];

async function run(): Promise<void> {
  process.env.ECHO_PERM_AGGREGATE_CACHE = 'false'; // direct path must be the reference
  const pool = makePool();

  for (const { user, channel } of CASES) {
    resetAggregateCaches();

    const direct = await buildEvaluationPlan(pool, FX.serverId, user, channel);
    const agg = await buildEvaluationPlanFromAggregate(
      pool,
      FX.serverId,
      user,
      channel,
    );
    const label = `${user} @ ${channel ?? '(no channel)'}`;
    assert.deepEqual(agg, direct, `plan parity: ${label}`);

    // Folded result parity (executeEvaluationPlan is pure + shared, but assert anyway).
    const dEff = [...executeEvaluationPlan(direct).effective].sort();
    const aEff = [...executeEvaluationPlan(agg).effective].sort();
    assert.deepEqual(aEff, dEff, `effective parity: ${label}`);
  }

  // Batch parity: for every user, the aggregate batch fold must match the direct batch
  // fold channel-for-channel over all fixture channels + an unknown id.
  const batchChannels = [...Object.keys(FX.channels), 'UNKNOWN_CHANNEL'];
  const batchUsers = ['OWNER', 'U_outsider', 'U_banned', 'U_mod', 'U_plain'];
  for (const user of batchUsers) {
    resetAggregateCaches();

    const directBatch = await buildBatchEvaluationPlans(
      pool,
      FX.serverId,
      user,
      batchChannels,
    );
    const aggBatch = await buildBatchEvaluationPlansFromAggregate(
      pool,
      FX.serverId,
      user,
      batchChannels,
    );
    assert.deepEqual(
      [...aggBatch.keys()].sort(),
      [...directBatch.keys()].sort(),
      `batch keys parity: ${user}`,
    );
    for (const cid of batchChannels) {
      assert.deepEqual(
        aggBatch.get(cid),
        directBatch.get(cid),
        `batch plan parity: ${user} @ ${cid}`,
      );
    }
    // Batch and single folds must agree with each other too.
    for (const cid of batchChannels) {
      const single = await buildEvaluationPlanFromAggregate(
        pool,
        FX.serverId,
        user,
        cid,
      );
      assert.deepEqual(
        aggBatch.get(cid),
        single,
        `batch/single consistency: ${user} @ ${cid}`,
      );
    }
  }

  // Empty channel list short-circuits.
  const emptyBatch = await buildBatchEvaluationPlansFromAggregate(
    pool,
    FX.serverId,
    'U_mod',
    [],
  );
  assert.equal(emptyBatch.size, 0, 'empty batch returns empty map');

  // Default-ON dispatch: the public entry points must route to the aggregate fold, and a
  // warm fold must hit the DB ZERO times (aggregate + member-state + role-ids all cached)
  // — the steady-state property the in-memory tier exists for.
  delete process.env.ECHO_PERM_AGGREGATE_CACHE;
  try {
    const reference = await buildEvaluationPlanFromAggregate(
      pool,
      FX.serverId,
      'U_mod',
      'C_cat1',
    );

    resetAggregateCaches();
    let queryCount = 0;
    const inner = pool as unknown as {
      query: (s: string, p: unknown[]) => Promise<{ rows: unknown[] }>;
    };
    const countingPool = {
      query: (sql: string, params: unknown[]) => {
        queryCount += 1;
        return inner.query(sql, params);
      },
    } as unknown as import('pg').Pool;

    const cold = await buildEvaluationPlan(
      countingPool,
      FX.serverId,
      'U_mod',
      'C_cat1',
    );
    assert.deepEqual(
      cold,
      reference,
      'default-on dispatch uses aggregate fold',
    );
    assert.ok(queryCount > 0, 'cold aggregate fold loads from DB');

    queryCount = 0;
    const warm = await buildEvaluationPlan(
      countingPool,
      FX.serverId,
      'U_mod',
      'C_cat1',
    );
    assert.deepEqual(warm, reference, 'warm aggregate fold parity');
    assert.equal(queryCount, 0, 'warm aggregate fold hits the DB zero times');

    queryCount = 0;
    const warmBatch = await buildBatchEvaluationPlans(
      countingPool,
      FX.serverId,
      'U_mod',
      batchChannels,
    );
    assert.equal(queryCount, 0, 'warm aggregate batch hits the DB zero times');
    for (const cid of batchChannels) {
      const single = await buildEvaluationPlanFromAggregate(
        pool,
        FX.serverId,
        'U_mod',
        cid,
      );
      assert.deepEqual(
        warmBatch.get(cid),
        single,
        `default-on batch/single consistency @ ${cid}`,
      );
    }
  } finally {
    delete process.env.ECHO_PERM_AGGREGATE_CACHE;
  }

  // Sanity: the matrix actually exercised the distinct plan kinds.
  const kinds = new Set<string>();
  for (const { user, channel } of CASES) {
    kinds.add(
      (await buildEvaluationPlan(pool, FX.serverId, user, channel)).kind,
    );
  }
  for (const k of [
    'owner_bypass',
    'not_member',
    'banned',
    'no_roles',
    'evaluate',
  ]) {
    assert.ok(kinds.has(k), `matrix covers ${k}`);
  }

  console.log('echo.permissionAggregateParity.test: ok');
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
