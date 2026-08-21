/**
 * Persisted poll votes (one row per user per poll message). `echo_messages` poll JSON holds definition only.
 */
import type pg from 'pg';
import type { PollData } from '../../../../contracts/types';

export type EchoPollStoredDefinition = {
  question: string;
  endsAt?: string;
  /** Persist only when true to keep stored JSON small. */
  anonymous?: boolean;
  options: { id: string; text: string; emoji?: string }[];
};

export function mergePollVotesIntoDefinition(
  def: EchoPollStoredDefinition,
  votes: { userId: string; optionId: string }[],
): PollData {
  const tallies = new Map<string, { count: number; voterIds: string[] }>();
  for (const o of def.options) {
    tallies.set(o.id, { count: 0, voterIds: [] });
  }
  for (const v of votes) {
    const t = tallies.get(v.optionId);
    if (t) {
      t.count += 1;
      t.voterIds.push(v.userId);
    }
  }
  return {
    question: def.question,
    ...(def.endsAt ? { endsAt: def.endsAt } : {}),
    ...(def.anonymous === true ? { anonymous: true } : {}),
    options: def.options.map((o) => {
      const t = tallies.get(o.id)!;
      return {
        id: o.id,
        text: o.text,
        ...(o.emoji ? { emoji: o.emoji } : {}),
        votes: t.count,
        voterIds: t.voterIds,
      };
    }),
  };
}

export async function listPollVotesForMessages(
  pool: pg.Pool,
  messageIds: string[],
): Promise<Map<string, { userId: string; optionId: string }[]>> {
  const out = new Map<string, { userId: string; optionId: string }[]>();
  if (!messageIds.length) return out;
  const r = await pool.query(
    `SELECT message_id, user_id, option_id FROM echo_poll_votes WHERE message_id = ANY($1::text[])`,
    [messageIds],
  );
  for (const row of r.rows) {
    const mid = String(row.message_id);
    const entry = {
      userId: String(row.user_id),
      optionId: String(row.option_id),
    };
    const list = out.get(mid);
    if (list) list.push(entry);
    else out.set(mid, [entry]);
  }
  return out;
}

export async function upsertEchoPollVote(
  pool: pg.Pool,
  params: { messageId: string; userId: string; optionId: string },
): Promise<void> {
  await pool.query(
    `
    INSERT INTO echo_poll_votes (message_id, user_id, option_id)
    VALUES ($1, $2, $3)
    ON CONFLICT (message_id, user_id) DO UPDATE SET option_id = EXCLUDED.option_id
    `,
    [params.messageId, params.userId, params.optionId],
  );
}
