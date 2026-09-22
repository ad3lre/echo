import type pg from 'pg';

export async function ensureEchoDmRealm(
  pool: pg.Pool,
  realmServerId: string,
  actorUserId: string,
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const server = await client.query(
      `
      INSERT INTO echo_servers (id, name, icon_url, owner_id)
      VALUES ($1, 'Direct messages', '', $2)
      ON CONFLICT (id) DO UPDATE SET id = EXCLUDED.id
      RETURNING owner_id
      `,
      [realmServerId, actorUserId],
    );
    const ownerId = String(server.rows[0]?.owner_id ?? actorUserId);
    await client.query(
      `
      INSERT INTO echo_server_members (server_id, user_id)
      VALUES ($1, $2)
      ON CONFLICT DO NOTHING
      `,
      [realmServerId, ownerId],
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
