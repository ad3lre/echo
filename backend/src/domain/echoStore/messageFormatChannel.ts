import type pg from 'pg';
import { echoHardFormatPrefixSatisfied } from '../../../../shared/messageChunkLimits';

export type EchoChannelMessageFormatRow = {
  template: string;
  hard: boolean;
};

export async function selectEchoChannelMessageFormat(
  pool: pg.Pool,
  channelId: string,
): Promise<EchoChannelMessageFormatRow | null> {
  const r = await pool.query(
    `SELECT COALESCE(message_format_template, '') AS message_format_template,
            message_format_hard
     FROM echo_channels WHERE id = $1 LIMIT 1`,
    [channelId],
  );
  if (!r.rows.length) return null;
  const row = r.rows[0] as {
    message_format_template?: unknown;
    message_format_hard?: unknown;
  };
  return {
    template: String(row.message_format_template ?? ''),
    hard: row.message_format_hard === true,
  };
}

/** When hard format is on, reject sends whose plain body is non-empty but missing the template prefix. */
export function echoSendPlainTextViolatesHardFormat(opts: {
  template: string;
  hard: boolean;
  plain: string;
}): boolean {
  const { template, hard, plain } = opts;
  if (!hard || template.length === 0) return false;
  if (plain.trim().length === 0) return false;
  return !echoHardFormatPrefixSatisfied(plain, template);
}
