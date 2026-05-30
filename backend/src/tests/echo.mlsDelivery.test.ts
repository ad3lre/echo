/**
 * MLS delivery service store tests (voice E2EE v2).
 * Run: node --import tsx backend/src/tests/echo.mlsDelivery.test.ts
 */
import assert from 'node:assert/strict';
import bcrypt from 'bcrypt';
import type pg from 'pg';
import { ensureEchoTables } from '../db/echoTables';
import { getPgPool } from '../db/pg';
import {
  appendMlsCommit,
  appendMlsProposal,
  claimMlsKeyPackage,
  createEchoChannel,
  createEchoServer,
  fetchMlsMessagesSince,
  getMlsGroupInfo,
  initMlsGroupIfAbsent,
  mlsGroupIdHex,
  publishMlsKeyPackages,
} from '../domain/echoStore';
import { upsertEchoE2eeDevice } from '../domain/echoStore/e2ee';

async function insertAuthUser(pool: pg.Pool, id: string): Promise<void> {
  const passwordHash = await bcrypt.hash('pw', 4);
  const username = `mls_${id.replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 48)}`;
  const email = `${username}@mls.echo.test`;
  await pool.query(
    `INSERT INTO auth_users (id, username, email, display_name, pfp, status, custom_status, banner_image, banner_color, banner_refraction_enabled, password_hash, updated_at)
     VALUES ($1, $2, $3, $4, '', 'offline', '', '', '', false, $5, NOW())
     ON CONFLICT (id) DO NOTHING`,
    [id, username, email, 'MLS test', passwordHash],
  );
}

async function grantEveryoneForTests(pool: pg.Pool, serverId: string): Promise<void> {
  await pool.query(
    `UPDATE echo_roles SET permissions = permissions | (1::BIGINT << 0) | (1::BIGINT << 20) | (1::BIGINT << 10) WHERE server_id = $1`,
    [serverId],
  );
}

async function main(): Promise<void> {
  const pool = getPgPool();
  if (!pool) {
    console.log('SKIP echo.mlsDelivery.test (no DATABASE_URL)');
    return;
  }
  await ensureEchoTables(pool);

  const ownerId = `mls_owner_${Date.now().toString(36)}`;
  const peerId = `mls_peer_${Date.now().toString(36)}`;
  await insertAuthUser(pool, ownerId);
  await insertAuthUser(pool, peerId);

  const created = await createEchoServer(pool, ownerId, 'mls-srv');
  const serverId = created.serverId;
  await grantEveryoneForTests(pool, serverId);
  await pool.query(
    `INSERT INTO echo_server_members (server_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    [serverId, peerId],
  );

  const cat = await pool.query(
    `SELECT id FROM echo_categories WHERE server_id = $1 LIMIT 1`,
    [serverId],
  );
  const categoryId = String(cat.rows[0]!.id);
  const channelId = await createEchoChannel(pool, serverId, 'mls-vc', 'voice', categoryId);
  assert.notEqual(channelId, 'invalid_category');
  await pool.query(
    `UPDATE echo_channels SET voice_e2ee_enabled = TRUE WHERE id = $1`,
    [channelId],
  );
  await pool.query(
    `INSERT INTO echo_voice_participants (server_id, channel_id, user_id) VALUES ($1, $2, $3)`,
    [serverId, channelId, ownerId],
  );

  // --- Key packages ---
  const devOwner = `dev-${ownerId}`;
  const devPeer = `dev-${peerId}`;
  await upsertEchoE2eeDevice(pool, ownerId, { deviceId: devOwner, identityKey: 'ik-o', registrationId: 1 });
  await upsertEchoE2eeDevice(pool, peerId, { deviceId: devPeer, identityKey: 'ik-p', registrationId: 1 });

  const pubResult = await publishMlsKeyPackages(pool, {
    userId: ownerId,
    deviceId: devOwner,
    packages: [
      { ref: 'ref-1', keyPackage: 'opaque-kp-1' },
      { ref: 'ref-2', keyPackage: 'opaque-kp-2' },
    ],
  });
  assert.equal(pubResult, 'ok', 'publish key packages should succeed');

  // Claim a key package (one-shot)
  const claimed = await claimMlsKeyPackage(pool, ownerId, devOwner);
  assert.ok(claimed, 'should claim a key package');
  assert.equal(claimed!.ref, 'ref-1', 'should claim oldest first');
  assert.equal(claimed!.keyPackage, 'opaque-kp-1');

  // Claim again — second package
  const claimed2 = await claimMlsKeyPackage(pool, ownerId, devOwner);
  assert.ok(claimed2, 'should claim second key package');
  assert.equal(claimed2!.ref, 'ref-2');

  // Claim again — last resort (all consumed)
  const lastResort = await claimMlsKeyPackage(pool, ownerId, devOwner);
  assert.ok(lastResort, 'should fall back to most recent package');

  // --- Group init ---
  const initResult = await initMlsGroupIfAbsent(pool, {
    serverId,
    channelId,
    actorUserId: ownerId,
    groupInfo: 'opaque-group-info-0',
  });
  assert.ok(initResult.ok, 'init should succeed');
  assert.ok(initResult.ok && initResult.created, 'should be a fresh create');
  assert.ok(initResult.ok && initResult.groupId, 'should have a groupId');
  const expectedGroupId = mlsGroupIdHex(serverId, channelId);
  assert.equal(initResult.ok && initResult.groupId, expectedGroupId);

  // Init again — idempotent (returns existing)
  const init2 = await initMlsGroupIfAbsent(pool, {
    serverId,
    channelId,
    actorUserId: ownerId,
    groupInfo: 'opaque-group-info-dup',
  });
  assert.ok(init2.ok, 'second init should succeed');
  assert.ok(init2.ok && !init2.created, 'should not recreate');

  // --- Commit with epoch gating ---
  const commitOk = await appendMlsCommit(pool, {
    serverId,
    channelId,
    actorUserId: ownerId,
    actorDeviceId: devOwner,
    expectedEpoch: '0',
    commit: 'opaque-commit-0',
    groupInfo: 'opaque-group-info-1',
  });
  assert.ok(commitOk.ok, 'commit at epoch 0 should succeed');
  assert.ok(commitOk.ok && commitOk.epoch === '1', 'new epoch should be 1');

  // Stale epoch → conflict
  const stale = await appendMlsCommit(pool, {
    serverId,
    channelId,
    actorUserId: ownerId,
    actorDeviceId: devOwner,
    expectedEpoch: '0',
    commit: 'stale-commit',
    groupInfo: 'stale-gi',
  });
  assert.ok(!stale.ok && stale.reason === 'epoch_conflict', 'stale epoch should conflict');

  // Verify group info updated
  const info = await getMlsGroupInfo(pool, serverId, channelId);
  assert.ok(info, 'group info should exist');
  assert.equal(info!.currentEpoch, '1');
  assert.equal(info!.groupInfo, 'opaque-group-info-1');

  // --- Proposal ---
  const propResult = await appendMlsProposal(pool, {
    serverId,
    channelId,
    actorUserId: ownerId,
    actorDeviceId: devOwner,
    epoch: '1',
    payload: 'opaque-proposal-1',
  });
  assert.ok(propResult.ok, 'proposal should succeed');

  // --- Fetch messages ---
  const fetched = await fetchMlsMessagesSince(pool, {
    serverId,
    channelId,
    userId: ownerId,
    sinceSeq: '0',
  });
  assert.ok(fetched.ok, 'fetch should succeed');
  assert.ok(fetched.ok && fetched.messages.length === 2, 'should have commit + proposal');
  const [msg1, msg2] = fetched.ok ? fetched.messages : [];
  assert.equal(msg1!.msgType, 'commit');
  assert.equal(msg1!.payload, 'opaque-commit-0');
  assert.equal(msg2!.msgType, 'proposal');
  assert.equal(msg2!.payload, 'opaque-proposal-1');

  // Fetch since the commit's seq — should only return the proposal
  const fetchPartial = await fetchMlsMessagesSince(pool, {
    serverId,
    channelId,
    userId: ownerId,
    sinceSeq: msg1!.seq,
  });
  assert.ok(fetchPartial.ok && fetchPartial.messages.length === 1);
  assert.equal(fetchPartial.ok && fetchPartial.messages[0]!.msgType, 'proposal');

  // --- Non-member forbidden ---
  const outsiderId = `mls_outsider_${Date.now().toString(36)}`;
  await insertAuthUser(pool, outsiderId);
  const fetchForbidden = await fetchMlsMessagesSince(pool, {
    serverId,
    channelId,
    userId: outsiderId,
    sinceSeq: '0',
  });
  assert.ok(!fetchForbidden.ok, 'outsider fetch should be forbidden');

  // --- Not-in-voice guard for commit ---
  const notInVoice = await appendMlsCommit(pool, {
    serverId,
    channelId,
    actorUserId: peerId,
    actorDeviceId: devPeer,
    expectedEpoch: '1',
    commit: 'peer-commit',
    groupInfo: 'peer-gi',
  });
  assert.ok(!notInVoice.ok && notInVoice.reason === 'not_in_voice', 'peer not in voice');

  // Put peer in voice and try again — should work
  await pool.query(
    `INSERT INTO echo_voice_participants (server_id, channel_id, user_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
    [serverId, channelId, peerId],
  );
  const peerCommit = await appendMlsCommit(pool, {
    serverId,
    channelId,
    actorUserId: peerId,
    actorDeviceId: devPeer,
    expectedEpoch: '1',
    commit: 'peer-commit-1',
    groupInfo: 'peer-gi-1',
  });
  assert.ok(peerCommit.ok, 'peer commit should succeed at correct epoch');
  assert.ok(peerCommit.ok && peerCommit.epoch === '2');

  console.log('✓ echo.mlsDelivery.test passed');
  await pool.end();
}

main().catch((e) => {
  console.error('echo.mlsDelivery.test FAILED', e);
  process.exit(1);
});
