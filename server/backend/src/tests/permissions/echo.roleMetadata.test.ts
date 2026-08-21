import assert from 'node:assert/strict';
import bcrypt from 'bcrypt';
import pg from 'pg';
import { ensureEchoTables } from '../../db/echoTables';
import {
  assignEchoMemberRole,
  createEchoServer,
  createEchoRole,
  listEchoRolesForServer,
  reconcileEveryoneRoleHierarchyPosition,
  replaceEchoServerRoleOrder,
  updateEchoRole,
} from '../../domain/echoStore';

async function insertAuthUser(pool: pg.Pool, id: string): Promise<void> {
  const passwordHash = await bcrypt.hash('pw', 4);
  const username = `rmeta_${id.replace(/-/g, '').slice(0, 12)}`;
  const email = `${username}@rolemeta.echo.test`;
  await pool.query(
    `
    INSERT INTO auth_users (id, username, email, display_name, pfp, status, custom_status, banner_image, banner_color, banner_refraction_enabled, password_hash, updated_at)
    VALUES ($1, $2, $3, $4, '', 'offline', '', '', '', false, $5, NOW())
    ON CONFLICT (id) DO NOTHING
    `,
    [id, username, email, 'Role meta test', passwordHash],
  );
}

async function run(): Promise<void> {
  const databaseUrl = process.env.PG_TEST_URL ?? process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.log(
      'Skipping echo.roleMetadata: PG_TEST_URL / DATABASE_URL not set',
    );
    return;
  }
  const pool = new pg.Pool({ connectionString: databaseUrl });
  let serverId = '';
  const ownerId = `rmeta_owner_${Date.now().toString(36)}`;
  const managerId = `rmeta_manager_${Date.now().toString(36)}`;
  try {
    await ensureEchoTables(pool);
    await insertAuthUser(pool, ownerId);
    await insertAuthUser(pool, managerId);

    const created = await createEchoServer(pool, ownerId, 'role-meta-test');
    serverId = created.serverId;
    const membersRoleId = await pool.query<{ id: string }>(
      `SELECT id FROM echo_roles WHERE server_id = $1 AND name IN ('@members', '@everyone') ORDER BY CASE WHEN name = '@members' THEN 0 ELSE 1 END LIMIT 1`,
      [serverId],
    );
    assert.ok(membersRoleId.rows[0], '@members role must exist');
    await pool.query(
      `INSERT INTO echo_server_members (server_id, user_id) VALUES ($1, $2)`,
      [serverId, managerId],
    );
    await pool.query(
      `INSERT INTO echo_member_roles (server_id, user_id, role_id) VALUES ($1, $2, $3)`,
      [serverId, managerId, String(membersRoleId.rows[0]!.id)],
    );

    let roles = await listEchoRolesForServer(pool, serverId);
    const members = roles.find(
      (r) => r.isEveryone || r.name === '@members' || r.isMembers,
    );
    assert.ok(members);
    const seededAdmin = roles.find((r) => r.name === 'Admin');
    const seededModerator = roles.find((r) => r.name === 'Moderator');
    assert.ok(seededAdmin, 'Should have seeded Admin role');
    assert.ok(seededModerator, 'Should have seeded Moderator role');
    assert.ok(seededAdmin!.position > seededModerator!.position);
    assert.ok(seededModerator!.position > members!.position);

    const ownerAssignments = await pool.query<{ name: string }>(
      `
      SELECT r.name
      FROM echo_member_roles mr
      INNER JOIN echo_roles r ON r.id = mr.role_id
      WHERE mr.server_id = $1 AND mr.user_id = $2
      `,
      [serverId, ownerId],
    );
    const ownerRoleNames = new Set(
      ownerAssignments.rows.map((row) => String(row.name)),
    );
    assert.ok(
      ownerRoleNames.has('@members') || ownerRoleNames.has('@everyone'),
    );
    assert.equal(ownerRoleNames.has('Admin'), false);

    const mod = await createEchoRole(pool, serverId, ownerId, {
      name: 'CustomMod',
      color: '#ff0000',
    });
    const vip = await createEchoRole(pool, serverId, ownerId, {
      name: 'VIP',
      color: '#00ff00',
      hoist: true,
    });
    if (mod === 'forbidden' || mod === 'invalid_body')
      assert.fail(`create mod: ${mod}`);
    if (vip === 'forbidden' || vip === 'invalid_body')
      assert.fail(`create vip: ${vip}`);
    const managerRole = await createEchoRole(pool, serverId, ownerId, {
      name: 'RoleManager',
      permissions: ['MANAGE_ROLES'],
    });
    if (managerRole === 'forbidden' || managerRole === 'invalid_body')
      assert.fail(`create manager role: ${managerRole}`);

    roles = await listEchoRolesForServer(pool, serverId);
    assert.equal(roles.find((r) => r.name === 'VIP')?.hoist, true);
    const modRow = roles.find((r) => r.name === 'CustomMod');
    const vipRow = roles.find((r) => r.name === 'VIP');
    const managerRoleRow = roles.find((r) => r.name === 'RoleManager');
    assert.ok(modRow && vipRow);
    assert.ok(managerRoleRow);
    const assignManager = await assignEchoMemberRole(
      pool,
      serverId,
      ownerId,
      managerId,
      managerRoleRow!.id,
    );
    assert.equal(assignManager, 'ok');

    const ownerOrdered = roles
      .slice()
      .sort((a, b) => b.position - a.position || a.id.localeCompare(b.id))
      .map((r) => r.id);
    const managerIdx = ownerOrdered.indexOf(managerRoleRow!.id);
    const adminIdx = ownerOrdered.indexOf(seededAdmin!.id);
    assert.ok(managerIdx >= 0 && adminIdx >= 0, 'expected role ids must exist');
    const managerEscalationOrder = ownerOrdered.slice();
    managerEscalationOrder.splice(managerIdx, 1);
    managerEscalationOrder.splice(0, 0, managerRoleRow!.id);
    const managerReorder = await replaceEchoServerRoleOrder(
      pool,
      serverId,
      managerId,
      managerEscalationOrder,
    );
    assert.equal(
      managerReorder,
      'forbidden',
      'non-owner role manager must not reorder roles above their hierarchy ceiling',
    );

    const orderTopToBottom = [
      modRow!.id,
      vipRow!.id,
      managerRoleRow!.id,
      seededAdmin!.id,
      members!.id,
    ];
    const rOrder = await replaceEchoServerRoleOrder(
      pool,
      serverId,
      ownerId,
      orderTopToBottom,
    );
    assert.equal(rOrder, 'ok');

    roles = await listEchoRolesForServer(pool, serverId);
    const byId = new Map(roles.map((r) => [r.id, r]));
    assert.ok(byId.get(modRow!.id)!.position > byId.get(vipRow!.id)!.position);
    assert.ok(
      byId.get(vipRow!.id)!.position > byId.get(managerRoleRow!.id)!.position,
    );
    assert.ok(
      byId.get(managerRoleRow!.id)!.position >
        byId.get(seededAdmin!.id)!.position,
    );
    assert.ok(
      byId.get(seededAdmin!.id)!.position > byId.get(members!.id)!.position,
    );

    await pool.query(
      `UPDATE echo_roles SET position = 500 WHERE server_id = $1 AND name IN ('@members', '@everyone')`,
      [serverId],
    );
    await reconcileEveryoneRoleHierarchyPosition(pool, serverId);
    roles = await listEchoRolesForServer(pool, serverId);
    const membersAfter = roles.find(
      (r) => r.isEveryone || r.name === '@members' || r.isMembers,
    );
    const globalAfter = roles.find((r) => r.name === '@global');
    assert.ok(membersAfter);
    assert.ok(globalAfter);
    const sortedPositions = [...roles.map((r) => r.position)].sort(
      (a, b) => a - b,
    );
    assert.equal(globalAfter!.position, sortedPositions[0]);
    assert.equal(membersAfter!.position, sortedPositions[1]);
    for (const r of roles) {
      if (
        r.name === '@global' ||
        r.isEveryone ||
        r.name === '@members' ||
        r.isMembers
      ) {
        continue;
      }
      assert.ok(
        r.position > membersAfter!.position,
        `${r.name} must sit above @members`,
      );
    }

    const rHoist = await updateEchoRole(pool, serverId, ownerId, modRow!.id, {
      hoist: true,
    });
    assert.equal(rHoist, 'ok');
    roles = await listEchoRolesForServer(pool, serverId);
    assert.equal(roles.find((r) => r.id === modRow!.id)!.hoist, true);

    const badCreateColor = await createEchoRole(pool, serverId, ownerId, {
      name: 'Broken',
      color: 'red',
    });
    assert.equal(badCreateColor, 'invalid_body');

    for (let i = roles.length; i < 512; i++) {
      const createdRole = await createEchoRole(pool, serverId, ownerId, {
        name: `LimitRole${i}`,
      });
      if (
        createdRole === 'forbidden' ||
        createdRole === 'invalid_body' ||
        createdRole === 'limit_reached'
      ) {
        assert.fail(`limit role seed ${i}: ${createdRole}`);
      }
    }
    const overLimitRole = await createEchoRole(pool, serverId, ownerId, {
      name: 'OverLimitRole',
    });
    assert.equal(overLimitRole, 'limit_reached');

    const rBadColor = await updateEchoRole(
      pool,
      serverId,
      ownerId,
      modRow!.id,
      { color: 'red' },
    );
    assert.equal(rBadColor, 'invalid_body');

    const rBad = await updateEchoRole(pool, serverId, ownerId, members!.id, {
      name: 'RenamedMembers',
    });
    assert.equal(rBad, 'invalid_body');

    const packId = `pack_ricon_${Date.now().toString(36)}`;
    const emojiId = `emoji_ricon_${Date.now().toString(36)}`;
    const iconUrl = 'https://cdn.echo.test/emoji.png';
    await pool.query(
      `INSERT INTO echo_server_emoji_packs (id, server_id, name, source, position)
       VALUES ($1, $2, $3, 'custom', 0)`,
      [packId, serverId, 'Role icon test pack'],
    );
    await pool.query(
      `INSERT INTO echo_server_custom_emojis (id, server_id, pack_id, name, animated, image_url)
       VALUES ($1, $2, $3, 'testemoji', false, $4)`,
      [emojiId, serverId, packId, iconUrl],
    );

    const rIconOk = await updateEchoRole(pool, serverId, ownerId, modRow!.id, {
      roleIconUrl: iconUrl,
      roleIconEmojiId: emojiId,
    });
    assert.equal(rIconOk, 'ok');
    roles = await listEchoRolesForServer(pool, serverId);
    const modAfterIcon = roles.find((r) => r.id === modRow!.id);
    assert.ok(modAfterIcon);
    assert.equal(modAfterIcon.roleIconUrl, iconUrl);
    assert.equal(modAfterIcon.roleIconEmojiId, emojiId);

    const rIconForeign = await updateEchoRole(
      pool,
      serverId,
      ownerId,
      modRow!.id,
      { roleIconEmojiId: 'not-a-real-emoji-in-this-server' },
    );
    assert.equal(rIconForeign, 'invalid_body');

    console.log('echo.roleMetadata: ok');
  } catch (e) {
    console.error(e);
    process.exitCode = 1;
  } finally {
    if (serverId) {
      await pool
        .query(`DELETE FROM echo_servers WHERE id = $1`, [serverId])
        .catch(() => {});
    }
    await pool
      .query(`DELETE FROM auth_users WHERE id = $1`, [ownerId])
      .catch(() => {});
    await pool
      .query(`DELETE FROM auth_users WHERE id = $1`, [managerId])
      .catch(() => {});
    await pool.end();
  }
}

run();
