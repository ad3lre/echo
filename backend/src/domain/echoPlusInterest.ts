import type { Pool } from 'pg';

export type EchoPlusInterestTier = 'plus' | 'black' | 'any';
export type EchoPlusInterestBillingCycle = 'monthly' | 'yearly';

export interface EchoPlusInterestRow {
  userId: string;
  tier: EchoPlusInterestTier;
  billingCycle: EchoPlusInterestBillingCycle;
  createdAt: string;
  updatedAt: string;
}

export interface EchoPlusInterestListEntry extends EchoPlusInterestRow {
  username: string;
  displayName: string;
  email: string | null;
}

function mapRow(row: {
  user_id: string;
  tier: string;
  billing_cycle: string;
  created_at: Date;
  updated_at: Date;
}): EchoPlusInterestRow {
  return {
    userId: row.user_id,
    tier: row.tier as EchoPlusInterestTier,
    billingCycle: row.billing_cycle as EchoPlusInterestBillingCycle,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export function normalizeEchoPlusInterestTier(
  raw: unknown,
): EchoPlusInterestTier | null {
  if (raw === 'plus' || raw === 'black' || raw === 'any') return raw;
  return null;
}

export function normalizeEchoPlusInterestBillingCycle(
  raw: unknown,
): EchoPlusInterestBillingCycle | null {
  if (raw === 'monthly' || raw === 'yearly') return raw;
  return null;
}

export async function getEchoPlusInterestForUser(
  pool: Pool,
  userId: string,
): Promise<EchoPlusInterestRow | null> {
  const r = await pool.query<{
    user_id: string;
    tier: string;
    billing_cycle: string;
    created_at: Date;
    updated_at: Date;
  }>(
    `SELECT user_id, tier, billing_cycle, created_at, updated_at
     FROM auth_echo_plus_interest
     WHERE user_id = $1`,
    [userId],
  );
  const row = r.rows[0];
  return row ? mapRow(row) : null;
}

export async function upsertEchoPlusInterest(
  pool: Pool,
  userId: string,
  tier: EchoPlusInterestTier,
  billingCycle: EchoPlusInterestBillingCycle,
): Promise<EchoPlusInterestRow> {
  const r = await pool.query<{
    user_id: string;
    tier: string;
    billing_cycle: string;
    created_at: Date;
    updated_at: Date;
  }>(
    `INSERT INTO auth_echo_plus_interest (user_id, tier, billing_cycle)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id) DO UPDATE
     SET tier = EXCLUDED.tier,
         billing_cycle = EXCLUDED.billing_cycle,
         updated_at = NOW()
     RETURNING user_id, tier, billing_cycle, created_at, updated_at`,
    [userId, tier, billingCycle],
  );
  const row = r.rows[0];
  if (!row) throw new Error('echo_plus_interest_upsert_failed');
  return mapRow(row);
}

export async function deleteEchoPlusInterest(
  pool: Pool,
  userId: string,
): Promise<boolean> {
  const r = await pool.query(
    `DELETE FROM auth_echo_plus_interest WHERE user_id = $1`,
    [userId],
  );
  return (r.rowCount ?? 0) > 0;
}

export async function listEchoPlusInterest(
  pool: Pool,
  limit = 500,
  offset = 0,
): Promise<{ entries: EchoPlusInterestListEntry[]; total: number }> {
  const cappedLimit = Math.min(Math.max(limit, 1), 2000);
  const cappedOffset = Math.max(offset, 0);
  const [listRes, countRes] = await Promise.all([
    pool.query<{
      user_id: string;
      tier: string;
      billing_cycle: string;
      created_at: Date;
      updated_at: Date;
      username: string;
      display_name: string;
      email: string | null;
    }>(
      `SELECT i.user_id, i.tier, i.billing_cycle, i.created_at, i.updated_at,
              u.username, u.display_name, u.email
       FROM auth_echo_plus_interest i
       JOIN auth_users u ON u.id = i.user_id
       ORDER BY i.created_at DESC
       LIMIT $1 OFFSET $2`,
      [cappedLimit, cappedOffset],
    ),
    pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM auth_echo_plus_interest`,
    ),
  ]);
  const total = Number(countRes.rows[0]?.count ?? 0);
  const entries = listRes.rows.map((row) => ({
    ...mapRow(row),
    username: row.username,
    displayName: row.display_name,
    email: row.email,
  }));
  return { entries, total };
}
