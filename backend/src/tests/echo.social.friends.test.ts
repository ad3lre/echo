import assert from 'node:assert/strict';
import bcrypt from 'bcrypt';
import pg from 'pg';
import { ensureEchoTables } from '../db/echoTables';
import {
  addEchoFriendRequest,
  acceptEchoFriendship,
  blockEchoUser,
  cancelEchoPendingFriendRequest,
  declineEchoPendingFriendRequest,
  listEchoFriends,
  listEchoMutualFriendPeerIds,
  listEchoPendingFriendRequestsIncoming,
  listEchoPendingFriendRequestsOutgoing,
  removeEchoAcceptedFriendship,
  unblockEchoUser,
} from '../domain/echoStore';

async function insertAuthUser(
  pool: pg.Pool,
  id: string,
  displayName: string,
): Promise<void> {
  const passwordHash = await bcrypt.hash('pw', 4);
  const username = `soc_${id.replace(/[^a-z0-9]/gi, '').slice(0, 12)}`;
  const email = `${username}@soc.echo.test`;
  await pool.query(
    `
    INSERT INTO auth_users (id, username, email, display_name, pfp, status, custom_status, banner_image, banner_color, banner_refraction_enabled, password_hash, updated_at)
    VALUES ($1, $2, $3, $4, '', 'offline', '', '', '', false, $5, NOW())
    ON CONFLICT (id) DO NOTHING
    `,
    [id, username, email, displayName, passwordHash],
  );
}

async function run(): Promise<void> {
  const databaseUrl = process.env.PG_TEST_URL ?? process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.log(
      'Skipping echo.social.friends: PG_TEST_URL / DATABASE_URL not set',
    );
    return;
  }
  const pool = new pg.Pool({ connectionString: databaseUrl });
  const ts = Date.now().toString(36);
  const userA = `soc_a_${ts}`;
  const userB = `soc_b_${ts}`;
  const userC = `soc_c_${ts}`;
  const userD = `soc_d_${ts}`;
  try {
    await ensureEchoTables(pool);
    await insertAuthUser(pool, userA, 'A');
    await insertAuthUser(pool, userB, 'B');
    await insertAuthUser(pool, userC, 'C');
    await insertAuthUser(pool, userD, 'D');

    assert.equal(
      await addEchoFriendRequest(pool, userA, userA),
      'already_related',
    );
    assert.equal(
      (await listEchoPendingFriendRequestsOutgoing(pool, userA)).length,
      0,
    );

    assert.equal(await addEchoFriendRequest(pool, userA, userB), 'created');
    const incB = await listEchoPendingFriendRequestsIncoming(pool, userB);
    const outA = await listEchoPendingFriendRequestsOutgoing(pool, userA);
    assert.equal(incB.length, 1);
    assert.equal(incB[0]!.fromUserId, userA);
    assert.equal(outA.length, 1);
    assert.equal(outA[0]!.toUserId, userB);

    const cancelled = await cancelEchoPendingFriendRequest(pool, userA, userB);
    assert.equal(cancelled, true);
    assert.equal(
      (await listEchoPendingFriendRequestsOutgoing(pool, userA)).length,
      0,
    );

    assert.equal(await addEchoFriendRequest(pool, userA, userB), 'created');
    const declined = await declineEchoPendingFriendRequest(pool, userB, userA);
    assert.equal(declined, true);
    assert.equal(
      (await listEchoPendingFriendRequestsIncoming(pool, userB)).length,
      0,
    );

    assert.equal(await addEchoFriendRequest(pool, userA, userB), 'created');
    assert.equal(
      await addEchoFriendRequest(pool, userA, userB),
      'already_related',
    );
    assert.equal(await acceptEchoFriendship(pool, userB, userA), true);
    assert.equal(await acceptEchoFriendship(pool, userB, userA), false);
    const friendsA = await listEchoFriends(pool, userA);
    const friendsB = await listEchoFriends(pool, userB);
    assert.ok(friendsA.some((f) => f.peerId === userB));
    assert.ok(friendsB.some((f) => f.peerId === userA));

    assert.equal(await addEchoFriendRequest(pool, userC, userA), 'created');
    assert.equal(await acceptEchoFriendship(pool, userA, userC), true);
    assert.equal(
      await addEchoFriendRequest(pool, userC, userA),
      'already_related',
    );
    const friendsA2 = await listEchoFriends(pool, userA);
    assert.ok(friendsA2.some((f) => f.peerId === userB));
    assert.ok(friendsA2.some((f) => f.peerId === userC));

    assert.equal(await addEchoFriendRequest(pool, userB, userC), 'created');
    assert.equal(await acceptEchoFriendship(pool, userC, userB), true);
    const mutualAC = await listEchoMutualFriendPeerIds(pool, userA, userC);
    assert.ok(mutualAC.includes(userB));
    assert.equal(
      (await listEchoMutualFriendPeerIds(pool, userA, userA)).length,
      0,
    );

    assert.equal(await removeEchoAcceptedFriendship(pool, userA, userB), true);
    assert.equal(await removeEchoAcceptedFriendship(pool, userA, userB), false);
    const friendsA3 = await listEchoFriends(pool, userA);
    assert.ok(!friendsA3.some((f) => f.peerId === userB));
    assert.ok(friendsA3.some((f) => f.peerId === userC));

    assert.equal(
      await blockEchoUser(pool, userA, 'nonexistent_user_id_for_block_test'),
      'user_not_found',
    );
    assert.equal(await addEchoFriendRequest(pool, userB, userD), 'created');
    assert.equal(await blockEchoUser(pool, userB, userD), 'blocked_new');
    assert.equal(await addEchoFriendRequest(pool, userB, userD), 'blocked');
    assert.equal(await blockEchoUser(pool, userA, userC), 'blocked_new');
    assert.equal(await blockEchoUser(pool, userA, userC), 'already_blocked');
    assert.equal(await unblockEchoUser(pool, userA, userC), 'unblocked');
    assert.equal(await unblockEchoUser(pool, userA, userC), 'not_blocked');
    assert.equal(
      await unblockEchoUser(pool, userA, 'ghost_unblock_user_id'),
      'target_not_found',
    );
  } finally {
    await pool.query(
      `DELETE FROM echo_friendships WHERE user_id = ANY($1::text[]) OR peer_id = ANY($1::text[])`,
      [[userA, userB, userC, userD]],
    );
    await pool.query(`DELETE FROM auth_users WHERE id = ANY($1::text[])`, [
      [userA, userB, userC, userD],
    ]);
    await pool.end();
  }
}

run().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
