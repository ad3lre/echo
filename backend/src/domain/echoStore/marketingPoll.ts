import type pg from 'pg';
import { nextEchoSnowflakeId } from '../echoSnowflake';

export const ADEL_APPROVAL_POLL_ID = 'adel-approval-v2';
export const ADEL_APPROVAL_QUESTION_COUNT = 50;

export type MarketingPollPublicEntry = {
  id: string;
  name: string;
  score: number;
  countryCode: string;
  categoryScores: Record<string, number>;
  at: string;
};

/** Own entry / submit response — includes per-question option indices. */
export type MarketingPollDetailEntry = MarketingPollPublicEntry & {
  answers: number[];
};

type MarketingPollRow = {
  id: string;
  display_name: string;
  score: number;
  category_scores: unknown;
  answers: unknown;
  country_code: string;
  created_at: Date;
};

function asCategoryScores(raw: unknown): Record<string, number> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      out[key] = Math.max(0, Math.min(100, Math.round(value)));
    }
  }
  return out;
}

function asAnswers(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  const out: number[] = [];
  for (const value of raw) {
    if (
      typeof value === 'number' &&
      Number.isInteger(value) &&
      value >= 0 &&
      value <= 3
    ) {
      out.push(value);
    }
  }
  return out;
}

function rowToPublic(row: MarketingPollRow): MarketingPollPublicEntry {
  return {
    id: row.id,
    name: row.display_name,
    score: row.score,
    countryCode: row.country_code || '',
    categoryScores: asCategoryScores(row.category_scores),
    at: row.created_at.toISOString(),
  };
}

function rowToDetail(row: MarketingPollRow): MarketingPollDetailEntry {
  return {
    ...rowToPublic(row),
    answers: asAnswers(row.answers),
  };
}

export async function getMarketingPollEntryByIp(
  pool: pg.Pool,
  pollId: string,
  clientIp: string,
): Promise<MarketingPollDetailEntry | null> {
  if (!clientIp || clientIp === 'unknown') return null;
  const { rows } = await pool.query<MarketingPollRow>(
    `
    SELECT id, display_name, score, category_scores, answers, country_code, created_at
    FROM echo_marketing_poll_entries
    WHERE poll_id = $1 AND client_ip = $2
    LIMIT 1
    `,
    [pollId, clientIp],
  );
  const row = rows[0];
  return row ? rowToDetail(row) : null;
}

export async function listMarketingPollLeaderboard(
  pool: pg.Pool,
  pollId: string,
  limit = 100,
): Promise<MarketingPollPublicEntry[]> {
  const capped = Math.max(1, Math.min(200, Math.floor(limit)));
  const { rows } = await pool.query<MarketingPollRow>(
    `
    SELECT id, display_name, score, category_scores, '[]'::jsonb AS answers, country_code, created_at
    FROM echo_marketing_poll_entries
    WHERE poll_id = $1
    ORDER BY score DESC, created_at ASC
    LIMIT $2
    `,
    [pollId, capped],
  );
  return rows.map(rowToPublic);
}

export type SubmitMarketingPollResult =
  | { ok: true; entry: MarketingPollDetailEntry; created: true }
  | {
      ok: false;
      reason: 'already_submitted';
      entry: MarketingPollDetailEntry;
    };

export async function submitMarketingPollEntry(
  pool: pg.Pool,
  opts: {
    pollId: string;
    displayName: string;
    score: number;
    categoryScores: Record<string, number>;
    answers: number[];
    clientIp: string;
    countryCode: string;
    userAgent: string;
  },
): Promise<SubmitMarketingPollResult> {
  const existing = await getMarketingPollEntryByIp(
    pool,
    opts.pollId,
    opts.clientIp,
  );
  if (existing) {
    return { ok: false, reason: 'already_submitted', entry: existing };
  }

  const id = nextEchoSnowflakeId();
  try {
    const { rows } = await pool.query<MarketingPollRow>(
      `
      INSERT INTO echo_marketing_poll_entries (
        id, poll_id, display_name, score, category_scores, answers,
        client_ip, country_code, user_agent
      )
      VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7, $8, $9)
      RETURNING id, display_name, score, category_scores, answers, country_code, created_at
      `,
      [
        id,
        opts.pollId,
        opts.displayName,
        opts.score,
        JSON.stringify(opts.categoryScores),
        JSON.stringify(opts.answers),
        opts.clientIp,
        opts.countryCode,
        opts.userAgent,
      ],
    );
    const row = rows[0];
    if (!row) {
      throw new Error('marketing_poll_insert_returned_no_row');
    }
    return { ok: true, entry: rowToDetail(row), created: true };
  } catch (err) {
    const code =
      err && typeof err === 'object' && 'code' in err
        ? String((err as { code: unknown }).code)
        : '';
    // Unique violation from concurrent submit on same IP.
    if (code === '23505') {
      const raced = await getMarketingPollEntryByIp(
        pool,
        opts.pollId,
        opts.clientIp,
      );
      if (raced) {
        return { ok: false, reason: 'already_submitted', entry: raced };
      }
    }
    throw err;
  }
}

/** Normalize client answer indices; returns null when shape is invalid. */
export function normalizeMarketingPollAnswers(
  raw: unknown,
  expectedCount = ADEL_APPROVAL_QUESTION_COUNT,
): number[] | null {
  if (!Array.isArray(raw) || raw.length !== expectedCount) return null;
  const out: number[] = [];
  for (const value of raw) {
    const n =
      typeof value === 'number'
        ? value
        : typeof value === 'string'
          ? Number(value)
          : NaN;
    if (!Number.isInteger(n) || n < 0 || n > 3) return null;
    out.push(n);
  }
  return out;
}
