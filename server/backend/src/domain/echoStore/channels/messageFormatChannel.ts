import type pg from 'pg';
import { echoHardFormatPrefixSatisfied } from '../../../../../../contracts/messageChunkLimits';
import { getEchoChannelMeta } from './channelMeta';

export type EchoChannelMessageFormatRow = {
  template: string;
  hard: boolean;
};

export async function selectEchoChannelMessageFormat(
  pool: pg.Pool,
  channelId: string,
): Promise<EchoChannelMessageFormatRow | null> {
  const meta = await getEchoChannelMeta(pool, channelId);
  if (!meta) return null;
  return { template: meta.messageFormatTemplate, hard: meta.messageFormatHard };
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
