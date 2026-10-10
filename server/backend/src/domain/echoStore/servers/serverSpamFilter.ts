import type pg from 'pg';
import type { MentionEntity } from '../../../../../../contracts/types';
import {
  formatSpamHaltDuration,
  getActiveSpamHalt,
  recordSpamStrikeAndHalt,
} from '../../../services/auth/progressiveSpamHalt';
import { detectEchoServerSpam } from './serverSpamFilterDetect';

export type EchoServerSpamFilterResult =
  | { ok: true }
  | { ok: false; detail: string };

/**
 * Guild spam filter + progressive halt.
 * Active halt blocks immediately; each detection hit escalates the cooldown ladder.
 */
export async function checkEchoServerSpamFilter(
  pool: pg.Pool,
  input: {
    serverId: string;
    userId: string;
    content: string;
    mentions?: MentionEntity[];
    clientIp?: string | null;
  },
): Promise<EchoServerSpamFilterResult> {
  const halt = await getActiveSpamHalt(input.userId, input.clientIp);
  if (halt.active) {
    return { ok: false, detail: halt.detail };
  }

  const detected = await detectEchoServerSpam(pool, input);
  if (detected.ok) {
    return { ok: true };
  }

  const applied = await recordSpamStrikeAndHalt(input.userId, input.clientIp);
  return {
    ok: false,
    detail: `${detected.detail} Sending paused for ${formatSpamHaltDuration(applied.haltDurationMs)}.`,
  };
}
