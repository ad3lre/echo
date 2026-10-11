import assert from 'node:assert/strict';
import { makeHash } from '../../../auth/store/helpers';
import Fastify from 'fastify';
import pg from 'pg';
import { ensureEchoTables } from '../../../db/echoTables';
import { assignEchoMemberRole, createEchoRole } from './roles';
import { addEchoServerMember, createEchoServer } from '../servers/servers';
import { replaceEchoRoleLinksFromAnchor } from './roleLinks';

function stub(path: string, exports: object): void {
  require.cache[require.resolve(path)] = { exports } as NodeModule;
}

async function insertAuthUser(pool: pg.Pool, id: string): Promise<void> {
  const passwordHash = await makeHash('pw');
  const username = `raudit_${id.replace(/[^a-z0-9]/gi, '').slice(0, 14)}`;
  await pool.query(
    `INSERT INTO auth_users
       (id, username, email, display_name, pfp, status, custom_status,
        banner_image, banner_color, banner_refraction_enabled, password_hash, updated_at)
     VALUES ($1, $2, $3, $2, '', 'offline', '', '', '', false, $4, NOW())
     ON CONFLICT (id) DO NOTHING`,
    [id, username, `${username}@role-audit.echo.test`, passwordHash],
  );
}

async function run(): Promise<void> {
  const databaseUrl = process.env.PG_TEST_URL ?? process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.log(
      'Skipping echo.roleAuditAtomicity: PG_TEST_URL / DATABASE_URL not set',
    );
    return;
  }

  const pool = new pg.Pool({ connectionString: databaseUrl });
  const suffix = Date.now().toString(36);
  const ownerId = `raudit_owner_${suffix}`;
  const memberId = `raudit_member_${suffix}`;
  const functionName = `raudit_fail_${suffix}`;
  const triggerName = `raudit_fail_${suffix}`;
  let serverId = '';
  let app: ReturnType<typeof Fastify> | undefined;
  let triggerCreated = false;

  try {
    await ensureEchoTables(pool);
    await insertAuthUser(pool, ownerId);
    await insertAuthUser(pool, memberId);
    const server = await createEchoServer(
      pool,
      ownerId,
      'role-audit-atomicity',
    );
    serverId = server.serverId;
    await addEchoServerMember(pool, serverId, memberId);

    const anchor = await createEchoRole(pool, serverId, ownerId, {
      name: `audit_anchor_${suffix}`,
      color: '#123456',
      permissions: [],
    });
    const linked = await createEchoRole(pool, serverId, ownerId, {
      name: `audit_linked_${suffix}`,
      color: '#654321',
      permissions: [],
    });
    assert.ok(typeof anchor === 'object' && 'roleId' in anchor);
    assert.ok(typeof linked === 'object' && 'roleId' in linked);
    const anchorRoleId = anchor.roleId;
    const linkedRoleId = linked.roleId;
    assert.equal(
      await replaceEchoRoleLinksFromAnchor(
        pool,
        serverId,
        ownerId,
        anchorRoleId,
        [{ linkedRoleId, twoWay: false }],
      ),
      'ok',
    );

    await pool.query(`
      CREATE FUNCTION ${functionName}() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.server_id = '${serverId}' AND NEW.action IN
          ('role.links_update', 'role.permissions_update', 'member.role_add', 'member.role_remove') THEN
          RAISE EXCEPTION 'injected role audit failure';
        END IF;
        RETURN NEW;
      END;
      $$
    `);
    await pool.query(
      `CREATE TRIGGER ${triggerName} BEFORE INSERT ON echo_audit_log
       FOR EACH ROW EXECUTE FUNCTION ${functionName}()`,
    );
    triggerCreated = true;

    stub('../../../auth/middleware', {
      requireAuth: async (req: { authUser?: unknown }) => {
        req.authUser = { id: ownerId };
      },
      getAuthUser: (req: { authUser?: unknown }) =>
        req.authUser as { id: string },
    });
    stub('../../../api/routes/echo/routeUtils', {
      requireEchoStore: async (req: { echoPool?: pg.Pool }) => {
        req.echoPool = pool;
      },
      echoPool: (req: { echoPool?: pg.Pool }) => req.echoPool as pg.Pool,
      trimEchoPathParam: (value: string) => value.trim(),
    });
    stub('../../../platform/echoPlatformEvents', {
      publishEchoWorkspaceEvent() {},
    });
    stub('../../../platform/echoRealtimeMembership', {
      evictAllUsersFromEchoServerChannelRealtimeScopes: async () => {},
      evictUserFromEchoServerRealtimeScopes: async () => {},
    });
    stub('../../../services/echoVoiceAccessEnforcement', {
      enforceAndPublishEchoVoiceAccess: async () => {},
    });
    const { default: echoRolesRoutes } =
      require('../../../api/routes/echo/roles') as typeof import('../../../api/routes/echo/roles');

    app = Fastify({ logger: false });
    await app.register(echoRolesRoutes, { prefix: '/api/v1/echo' });
    await app.ready();
    const response = await app.inject({
      method: 'PUT',
      url: `/api/v1/echo/servers/${serverId}/roles/${anchorRoleId}/links`,
      payload: { links: [] },
    });
    assert.equal(response.statusCode, 500);

    const beforePerms = await pool.query<{ permissions: unknown }>(
      `SELECT permissions FROM echo_roles WHERE server_id = $1 AND id = $2`,
      [serverId, anchorRoleId],
    );
    const permissionResponse = await app.inject({
      method: 'PATCH',
      url: `/api/v1/echo/servers/${serverId}/roles/${anchorRoleId}`,
      payload: { permissions: ['VIEW_CHANNEL'] },
    });
    assert.equal(permissionResponse.statusCode, 500);
    const afterPerms = await pool.query<{ permissions: unknown }>(
      `SELECT permissions FROM echo_roles WHERE server_id = $1 AND id = $2`,
      [serverId, anchorRoleId],
    );
    assert.deepEqual(
      afterPerms.rows[0]?.permissions,
      beforePerms.rows[0]?.permissions,
    );

    const grantResponse = await app.inject({
      method: 'POST',
      url: `/api/v1/echo/servers/${serverId}/members/${memberId}/roles`,
      payload: { roleId: linkedRoleId },
    });
    assert.equal(grantResponse.statusCode, 500);
    let assignment = await pool.query(
      `SELECT 1 FROM echo_member_roles WHERE server_id = $1 AND user_id = $2 AND role_id = $3`,
      [serverId, memberId, linkedRoleId],
    );
    assert.equal(assignment.rowCount, 0, 'failed grant must roll back');

    assert.equal(
      await assignEchoMemberRole(
        pool,
        serverId,
        ownerId,
        memberId,
        linkedRoleId,
      ),
      'ok',
    );
    const removeResponse = await app.inject({
      method: 'DELETE',
      url: `/api/v1/echo/servers/${serverId}/members/${memberId}/roles/${linkedRoleId}`,
    });
    assert.equal(removeResponse.statusCode, 500);
    assignment = await pool.query(
      `SELECT 1 FROM echo_member_roles WHERE server_id = $1 AND user_id = $2 AND role_id = $3`,
      [serverId, memberId, linkedRoleId],
    );
    assert.equal(assignment.rowCount, 1, 'failed removal must roll back');

    const remainingLinks = await pool.query(
      `SELECT linked_role_id FROM echo_role_links
       WHERE server_id = $1 AND anchor_role_id = $2`,
      [serverId, anchorRoleId],
    );
    assert.deepEqual(
      remainingLinks.rows.map((row) => String(row.linked_role_id)),
      [linkedRoleId],
      'link replacement must roll back when its audit insert fails',
    );
    const outbox = await pool.query(
      `SELECT 1 FROM echo_workspace_event_outbox
       WHERE target_server_id = $1 AND event_kind = 'role_graph_changed'`,
      [serverId],
    );
    assert.equal(outbox.rowCount, 0);
    console.log('echo.roleAuditAtomicity: ok');
  } finally {
    await app?.close();
    if (triggerCreated) {
      await pool.query(`DROP TRIGGER ${triggerName} ON echo_audit_log`);
      await pool.query(`DROP FUNCTION ${functionName}()`);
    }
    if (serverId) {
      await pool.query(`DELETE FROM echo_servers WHERE id = $1`, [serverId]);
    }
    await pool.query(`DELETE FROM auth_users WHERE id = $1`, [ownerId]);
    await pool.query(`DELETE FROM auth_users WHERE id = $1`, [memberId]);
    await pool.end();
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
