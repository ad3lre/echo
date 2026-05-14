import type { Client } from 'discord.js';
import { Routes } from 'discord.js';
import { appendJsonl } from '../util/fs.js';

type ApiGuildMember = Record<string, unknown>;

/** Discord returns members sorted by user id ascending; use max id as `after` cursor in case ordering ever differs. */
function maxMemberUserSnowflake(batch: ApiGuildMember[]): string | undefined {
  let best: bigint | null = null;
  let bestRaw: string | undefined;
  for (const m of batch) {
    const u = m.user as { id?: unknown } | undefined;
    const raw =
      typeof u?.id === 'string'
        ? u.id.trim()
        : u?.id != null &&
            (typeof u.id === 'number' || typeof u.id === 'bigint')
          ? String(u.id).trim()
          : '';
    if (!raw) continue;
    try {
      const bi = BigInt(raw);
      if (best == null || bi > best) {
        best = bi;
        bestRaw = raw;
      }
    } catch {
      continue;
    }
  }
  return bestRaw;
}

export async function runPhaseMembers(
  client: Client,
  guildId: string,
  outPath: string,
): Promise<number> {
  let after: string | undefined;
  let total = 0;
  for (;;) {
    const query = new URLSearchParams({ limit: '1000' });
    if (after) query.set('after', after);
    const batch = (await client.rest.get(Routes.guildMembers(guildId), {
      query,
    })) as ApiGuildMember[];
    if (!batch.length) break;
    for (const m of batch) {
      await appendJsonl(outPath, m);
      total += 1;
    }
    if (batch.length < 1000) break;
    const nextAfter = maxMemberUserSnowflake(batch);
    if (!nextAfter) break;
    after = nextAfter;
  }
  return total;
}
