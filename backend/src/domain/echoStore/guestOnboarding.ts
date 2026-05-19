import type pg from 'pg';
import { config } from '../../config';
import {
  joinEchoServerFromDirectory,
  listTopDirectoryServerIdsByMemberCount,
  sampleDistinctServerIds,
} from './servers';

/** Auto-join a new guest to a random sample of popular directory-listed servers. */
export async function joinGuestToSampledEchoServers(
  pool: pg.Pool,
  userId: string,
): Promise<void> {
  const poolSize = config.guestDirectoryPoolSize;
  const pick = config.guestServerSampleCount;
  const top = await listTopDirectoryServerIdsByMemberCount(pool, poolSize, {
    guestEligibleOnly: true,
  });
  const chosen = sampleDistinctServerIds(top, pick);
  for (const serverId of chosen) {
    try {
      await joinEchoServerFromDirectory(pool, serverId, userId, null, {
        isGuest: true,
      });
    } catch {
      /* ignore single-server failures */
    }
  }
}
