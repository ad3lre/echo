import assert from 'node:assert/strict';
import {
  executeEvaluationPlan,
  type EvaluationPlan,
} from '../../domain/permissions/echoPermissionEvaluate';
import {
  mergeOrderedOverwrites,
  mergeOverwritesForMember,
  orderOverwriteRowsForMember,
} from '../../domain/permissions/permissionOverwriteMerge';

async function run(): Promise<void> {
  const everyoneDenyView = {
    id: 'e1',
    target_type: 'everyone',
    target_id: null,
    partial: { VIEW_CHANNEL: false },
  };
  const modAllowView = {
    id: 'r1',
    target_type: 'role',
    target_id: 'role_mod',
    partial: { VIEW_CHANNEL: true },
  };

  const rolesMod = [
    { id: 'role_mod', position: 1, permissions: ['SEND_MESSAGE'] as unknown },
  ];
  const orderedMod = orderOverwriteRowsForMember(
    [everyoneDenyView, modAllowView],
    rolesMod,
    'user_x',
  );
  assert.equal(orderedMod.length, 2);
  const mergedMod = mergeOrderedOverwrites(orderedMod);
  assert.equal(mergedMod?.VIEW_CHANNEL, true);

  const layeredMod = mergeOverwritesForMember(
    [everyoneDenyView, modAllowView],
    rolesMod,
    'user_x',
  );
  assert.equal(layeredMod?.VIEW_CHANNEL, true);

  const rolesOther = [
    { id: 'role_other', position: 0, permissions: [] as unknown },
  ];
  const orderedNoMod = orderOverwriteRowsForMember(
    [everyoneDenyView, modAllowView],
    rolesOther,
    'user_x',
  );
  assert.equal(orderedNoMod.length, 1);
  const mergedNoMod = mergeOrderedOverwrites(orderedNoMod);
  assert.equal(mergedNoMod?.VIEW_CHANNEL, false);

  const layeredNoMod = mergeOverwritesForMember(
    [everyoneDenyView, modAllowView],
    rolesOther,
    'user_x',
  );
  assert.equal(layeredNoMod?.VIEW_CHANNEL, false);

  const memberAllow = {
    id: 'm1',
    target_type: 'member',
    target_id: 'user_special',
    partial: { VIEW_CHANNEL: true },
  };
  const orderedMember = orderOverwriteRowsForMember(
    [everyoneDenyView, memberAllow],
    rolesOther,
    'user_special',
  );
  assert.equal(orderedMember.length, 2);
  assert.equal(mergeOrderedOverwrites(orderedMember)?.VIEW_CHANNEL, true);
  assert.equal(
    mergeOverwritesForMember(
      [everyoneDenyView, memberAllow],
      rolesOther,
      'user_special',
    )?.VIEW_CHANNEL,
    true,
  );

  const orderedNotMember = orderOverwriteRowsForMember(
    [everyoneDenyView, memberAllow],
    rolesOther,
    'someone_else',
  );
  assert.equal(orderedNotMember.length, 1);
  assert.equal(mergeOrderedOverwrites(orderedNotMember)?.VIEW_CHANNEL, false);
  assert.equal(
    mergeOverwritesForMember(
      [everyoneDenyView, memberAllow],
      rolesOther,
      'someone_else',
    )?.VIEW_CHANNEL,
    false,
  );

  const plan: EvaluationPlan = {
    kind: 'evaluate',
    roles: [{ id: 'role_mod', position: 0, permissions: ['MODERATE_MEMBERS'] }],
    categoryOverride: null,
    channelOverride: layeredMod as Record<string, unknown>,
  };
  const out = executeEvaluationPlan(plan, 'compressed');
  assert.ok(out.effective.has('MODERATE_MEMBERS'));
  assert.ok(out.effective.has('VIEW_CHANNEL'));

  // --- Discord role-layer precedence (regression for VC perm display bug) -----------
  // Discord semantics: across the role layer, ALLOW wins over DENY regardless of role position.
  // https://discord.com/developers/docs/topics/permissions#permission-overwrites (steps 5 → 6)
  const mutedRow = {
    id: 'r_muted',
    target_type: 'role',
    target_id: 'role_muted',
    partial: { CONNECT: false, SPEAK: false },
  };
  const verifiedRow = {
    id: 'r_verified',
    target_type: 'role',
    target_id: 'role_verified',
    partial: { CONNECT: true, SPEAK: true },
  };
  // Verified is below Muted in role hierarchy — under last-write-wins (the old bug)
  // Muted's deny would win. Under Discord semantics, the verified allow wins.
  const dualMemberRoles = [
    { id: 'role_verified', position: 1, permissions: [] as unknown },
    { id: 'role_muted', position: 5, permissions: [] as unknown },
  ];
  const mutedThenVerified = mergeOverwritesForMember(
    [mutedRow, verifiedRow],
    dualMemberRoles,
    'user_z',
  );
  assert.equal(
    mutedThenVerified?.CONNECT,
    true,
    'role-allow must beat role-deny regardless of role hierarchy (CONNECT)',
  );
  assert.equal(
    mutedThenVerified?.SPEAK,
    true,
    'role-allow must beat role-deny regardless of role hierarchy (SPEAK)',
  );

  // Inverted hierarchy: verified is higher, muted lower. Allow still wins.
  const invertedMemberRoles = [
    { id: 'role_muted', position: 1, permissions: [] as unknown },
    { id: 'role_verified', position: 5, permissions: [] as unknown },
  ];
  const invertedMerged = mergeOverwritesForMember(
    [mutedRow, verifiedRow],
    invertedMemberRoles,
    'user_z',
  );
  assert.equal(invertedMerged?.CONNECT, true);
  assert.equal(invertedMerged?.SPEAK, true);

  // --- Reported scenario: @everyone ALLOW on a VC must surface as ALLOW in Echo ------
  // No role overwrites, no member overwrites — only an explicit @everyone allow.
  const everyoneAllowConnect = {
    id: 'e_vc_allow',
    target_type: 'everyone',
    target_id: null,
    partial: { CONNECT: true, SPEAK: true, VIEW_CHANNEL: true },
  };
  const onlyEveryone = mergeOverwritesForMember(
    [everyoneAllowConnect],
    [{ id: 'role_everyone', position: 0, permissions: [] as unknown }],
    'user_q',
  );
  assert.equal(
    onlyEveryone?.CONNECT,
    true,
    '@everyone allow CONNECT must remain ALLOW (not inverted to deny)',
  );
  assert.equal(onlyEveryone?.SPEAK, true);
  assert.equal(onlyEveryone?.VIEW_CHANNEL, true);

  // --- Edge: explicit @everyone deny on CONNECT, no role overwrite, plain member ----
  const everyoneDenyConnect = {
    id: 'e_vc_deny',
    target_type: 'everyone',
    target_id: null,
    partial: { CONNECT: false },
  };
  const denyOnly = mergeOverwritesForMember(
    [everyoneDenyConnect],
    [{ id: 'role_everyone', position: 0, permissions: [] as unknown }],
    'user_q',
  );
  assert.equal(
    denyOnly?.CONNECT,
    false,
    'explicit @everyone deny CONNECT must surface as deny',
  );

  // --- Edge: role-only allow CONNECT layered on top of @everyone deny -------------
  const roleAllowConnect = {
    id: 'r_voice',
    target_type: 'role',
    target_id: 'role_voice',
    partial: { CONNECT: true },
  };
  const everyoneDenyRoleAllow = mergeOverwritesForMember(
    [everyoneDenyConnect, roleAllowConnect],
    [{ id: 'role_voice', position: 2, permissions: [] as unknown }],
    'user_q',
  );
  assert.equal(
    everyoneDenyRoleAllow?.CONNECT,
    true,
    'role allow CONNECT must override @everyone deny CONNECT',
  );

  // --- Edge: member-level deny overrides everything else --------------------------
  const memberDeny = {
    id: 'm_quiet',
    target_type: 'member',
    target_id: 'user_q',
    partial: { CONNECT: false },
  };
  const memberDenyResult = mergeOverwritesForMember(
    [everyoneAllowConnect, roleAllowConnect, memberDeny],
    [{ id: 'role_voice', position: 2, permissions: [] as unknown }],
    'user_q',
  );
  assert.equal(
    memberDenyResult?.CONNECT,
    false,
    'member-specific deny CONNECT must override @everyone allow + role allow',
  );

  // --- End-to-end via the evaluator: ADMINISTRATOR bypasses channel overwrites ----
  const adminPlan: EvaluationPlan = {
    kind: 'evaluate',
    roles: [
      {
        id: 'role_everyone',
        position: 0,
        permissions: ['VIEW_CHANNEL'],
      },
      {
        id: 'role_admin',
        position: 5,
        permissions: ['ADMINISTRATOR'],
      },
    ],
    categoryOverride: null,
    channelOverride: { CONNECT: false, SPEAK: false },
  };
  const adminEffective = executeEvaluationPlan(adminPlan, 'compressed');
  assert.ok(
    adminEffective.effective.has('CONNECT'),
    'admin bypass must keep CONNECT even when channel denies it',
  );
  assert.ok(adminEffective.effective.has('SPEAK'));

  console.log('echo.permissionOverwriteMerge: ok');
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
