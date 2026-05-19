import assert from 'node:assert/strict';
import {
  aggregateServerRolesToSet,
  sortRolesForFold,
} from '../domain/echoPermissionPrimitives';
import { normalizePermissionListForStorage } from '../domain/echoPermissionPrimitives';
import { foldRolePermissionsSparse } from '../domain/echoPermissionPrimitivesSparse';

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
  const merged = aggregateServerRolesToSet([everyone, mod]);
  assert.ok(merged.has('VIEW_CHANNEL'));
  assert.ok(merged.has('SEND_MESSAGES'));
  assert.ok(merged.has('MODERATE_MEMBERS'));

  const modStripsView = aggregateServerRolesToSet([
    { id: 'e', position: 0, permissions: ['VIEW_CHANNEL'] },
    { id: 'm', position: 1, permissions: ['MODERATE_MEMBERS'] },
  ]);
  assert.ok(
    modStripsView.has('VIEW_CHANNEL'),
    'roles should stack; a later sparse role must not strip earlier grants',
  );

  const admin = aggregateServerRolesToSet([
    { id: 'x', position: 0, permissions: ['ADMINISTRATOR'] },
  ]);
  assert.ok(admin.has('MANAGE_GUILD'));
  assert.ok(admin.has('ADMINISTRATOR'));

  const adminFromLegacyObject = aggregateServerRolesToSet([
    {
      id: 'legacy-admin',
      position: 0,
      permissions: { ADMINISTRATOR: true },
    },
  ]);
  assert.ok(
    adminFromLegacyObject.has('ADMINISTRATOR'),
    'legacy object-form ADMINISTRATOR should be recognized',
  );
  assert.ok(
    adminFromLegacyObject.has('MANAGE_GUILD'),
    'legacy object-form ADMINISTRATOR should expand to full permissions',
  );

  const modFromLegacyObject = aggregateServerRolesToSet([
    {
      id: 'legacy-mod',
      position: 1,
      permissions: {
        KICK_MEMBERS: true,
        BAN_MEMBERS: true,
        MODERATE_MEMBERS: true,
      },
    },
  ]);
  assert.ok(modFromLegacyObject.has('KICK_MEMBERS'));
  assert.ok(modFromLegacyObject.has('BAN_MEMBERS'));
  assert.ok(modFromLegacyObject.has('MODERATE_MEMBERS'));

  const adminWins = aggregateServerRolesToSet([
    { id: 'a', position: 0, permissions: ['ADMINISTRATOR'] },
    { id: 'b', position: 1, permissions: [] },
  ]);
  assert.ok(
    adminWins.has('VIEW_CHANNEL'),
    'ADMINISTRATOR should grant full permissions regardless of later sparse roles',
  );

  const adminLastWins = aggregateServerRolesToSet([
    { id: 'a', position: 0, permissions: [] },
    { id: 'b', position: 1, permissions: ['ADMINISTRATOR'] },
  ]);
  assert.ok(adminLastWins.has('VIEW_CHANNEL'), 'admin role last should win');

  const visualAdminRoles = [
    {
      id: 'everyone',
      position: 0,
      permissions: ['VIEW_CHANNEL'],
      roleType: 'mixed',
    },
    {
      id: 'decorative',
      position: 1,
      permissions: ['ADMINISTRATOR'],
      roleType: 'visual',
    },
  ];
  const canonicalVisualAdmin = aggregateServerRolesToSet(visualAdminRoles);
  const sparseVisualAdmin = foldRolePermissionsSparse(visualAdminRoles, {
    presorted: true,
  });
  assert.deepEqual(
    [...sparseVisualAdmin].sort(),
    [...canonicalVisualAdmin].sort(),
    'sparse role fold must match canonical visual-role filtering',
  );
  assert.equal(
    sparseVisualAdmin.has('ADMINISTRATOR'),
    false,
    'visual roles must not grant ADMINISTRATOR through sparse folding',
  );

  const sparseAdminFromLegacyObject = foldRolePermissionsSparse([
    {
      id: 'legacy-admin',
      position: 0,
      permissions: { ADMINISTRATOR: true },
    },
  ]);
  assert.ok(
    sparseAdminFromLegacyObject.has('MANAGE_GUILD'),
    'sparse fold should recognize legacy object-form ADMINISTRATOR',
  );

  const sorted = sortRolesForFold([
    { id: 'z', position: 1 },
    { id: 'a', position: 1 },
  ]);
  assert.ok(sorted[0].id === 'a' && sorted[1].id === 'z');

  // new-key normalization should allow extended permissions
  const normalized = normalizePermissionListForStorage(
    ['VIEW_CHANNEL', 'CHANGE_NICKNAME', 'UNKNOWN_KEY'],
    new Set([...['VIEW_CHANNEL', 'CHANGE_NICKNAME']]),
  );
  assert.ok(normalized.includes('CHANGE_NICKNAME'));

  console.log('echo.rbac.perms: ok');
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
