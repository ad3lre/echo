import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  applyLayerFromPartialObject,
  ECHO_PERMISSIONS,
  foldRolePermissions,
} from '../../domain/permissions/echoPermissionPrimitives';
import {
  mergeCategoryOverrideRows,
  mergeChannelOverrideRows,
  mergeOverrideRows,
} from '../../domain/permissions/mergeOverrideRows';
import { composePermissionExplanation } from '../../domain/permissions/permissionExplanation';

const ALL = [...ECHO_PERMISSIONS];

async function run(): Promise<void> {
  const everyone = {
    id: 'e',
    position: 0,
    permissions: ['VIEW_CHANNEL', 'SEND_MESSAGE'],
  };
  const mod = {
    id: 'm',
    position: 1,
    permissions: ['VIEW_CHANNEL', 'SEND_MESSAGE', 'MODERATE_MEMBERS'],
  };
  const folded = foldRolePermissions([everyone, mod], { allKeys: ALL });
  assert.ok(folded.has('VIEW_CHANNEL'));
  assert.ok(folded.has('SEND_MESSAGES'));
  assert.ok(folded.has('MODERATE_MEMBERS'));

  const merged = mergeOverrideRows([
    { id: 'a', position: 0, body: { VIEW_CHANNEL: true } },
    { id: 'b', position: 1, body: { VIEW_CHANNEL: false } },
  ]);
  assert.equal(merged.VIEW_CHANNEL, false);

  const catMerged = mergeCategoryOverrideRows([
    { id: 'x', position: 0, body: { MANAGE_GUILD: true } },
    { id: 'y', position: 1, body: { MANAGE_GUILD: false } },
  ]);
  assert.equal(catMerged.MANAGE_GUILD, false);

  const chMerged = mergeChannelOverrideRows([
    { id: 'c', position: 0, body: { CREATE_INSTANT_INVITE: true } },
  ]);
  assert.equal(chMerged.CREATE_INSTANT_INVITE, true);

  const fixturePath = path.join(
    __dirname,
    'fixtures',
    'permission-old-partial.json',
  );
  const legacy = JSON.parse(readFileSync(fixturePath, 'utf8')) as Record<
    string,
    unknown
  >;
  let state = new Set<string>(['MANAGE_CHANNELS']);
  state = applyLayerFromPartialObject(state, legacy, ALL);
  assert.ok(state.has('VIEW_CHANNEL'));
  assert.ok(!state.has('SEND_MESSAGES'));
  assert.ok(!state.has('unknown_future_permission_key'));

  const composed = composePermissionExplanation([
    {
      mode: 'compressed',
      compressed: [
        { bit: 'VIEW_CHANNEL', layer: 'server', sourceLabel: 'role:e' },
      ],
    },
  ]);
  assert.ok(composed.summary.includes('compressed'));
  assert.equal(composed.byLayer.server, 1);

  console.log('echo.rbac.goldens: ok');
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
