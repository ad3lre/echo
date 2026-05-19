import assert from 'node:assert/strict';
import {
  executeEvaluationPlan,
  type EvaluationPlan,
} from '../domain/echoPermissionEvaluate';

async function run(): Promise<void> {
  const emptyFoldPlan: EvaluationPlan = {
    kind: 'evaluate',
    roles: [{ id: 'everyone', position: 0, permissions: [] }],
    categoryOverride: null,
    channelOverride: null,
  };
  const emptyRes = executeEvaluationPlan(emptyFoldPlan);
  assert.ok(
    emptyRes.effective.has('ADD_REACTIONS'),
    'empty role fold should use EVERYONE_FALLBACK including ADD_REACTIONS',
  );

  const migratedEveryonePlan: EvaluationPlan = {
    kind: 'evaluate',
    roles: [
      {
        id: 'everyone',
        position: 0,
        permissions: [
          'VIEW_CHANNEL',
          'SEND_MESSAGES',
          'CREATE_INSTANT_INVITE',
          'ADD_REACTIONS',
          'EMBED_LINKS',
        ],
      },
    ],
    categoryOverride: null,
    channelOverride: null,
  };
  const migratedRes = executeEvaluationPlan(migratedEveryonePlan);
  assert.ok(
    migratedRes.effective.has('ADD_REACTIONS'),
    'migrated @everyone baseline grants ADD_REACTIONS',
  );

  console.log('echo.rbac.reactionEveryone: ok');
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
