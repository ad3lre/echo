import type pg from 'pg';
import type { MentionEntity } from '../../../../contracts/types';
import {
  checkEchoServerSpamFilter,
  echoChannelAllowsMessageUnderSlowmode,
  echoSendPlainTextViolatesHardFormat,
  selectEchoChannelMessageFormat,
} from '../domain/echoStore';
import { evaluateBannedWordsOnMessageSend } from '../domain/echoStore/bannedWords/messageEval';
import { canUserSendMassMentionInChannel } from '../domain/permissions/echoPermissions';

export type EchoGuildOutboundMessageModerationDenial = {
  httpStatus: number;
  code: string;
  detail: string;
};

/**
 * Guild-channel moderation gates shared by REST/socket user sends and Discord bot API posts.
 * Caller must already have verified channel send access.
 */
export async function evaluateEchoGuildOutboundMessageModeration(
  pool: pg.Pool,
  input: {
    serverId: string;
    channelId: string;
    userId: string;
    content: string;
    mentions?: MentionEntity[];
    /** Edits should not re-check slowmode (only new sends). */
    skipSlowmode?: boolean;
  },
): Promise<
  { ok: true } | { ok: false; denial: EchoGuildOutboundMessageModerationDenial }
> {
  const { serverId, channelId, userId, content } = input;
  const mentions = input.mentions ?? [];

  if (
    !input.skipSlowmode &&
    !(await echoChannelAllowsMessageUnderSlowmode(
      pool,
      serverId,
      userId,
      channelId,
    ))
  ) {
    return {
      ok: false,
      denial: {
        httpStatus: 429,
        code: 'SLOWMODE',
        detail: 'Slowmode is active in this channel',
      },
    };
  }

  if (
    !(await canUserSendMassMentionInChannel(pool, userId, channelId, mentions))
  ) {
    return {
      ok: false,
      denial: {
        httpStatus: 403,
        code: 'FORBIDDEN',
        detail: 'You cannot mention @everyone or @active in this channel.',
      },
    };
  }

  const spamCheck = await checkEchoServerSpamFilter(pool, {
    serverId,
    userId,
    content,
    mentions,
  });
  if (!spamCheck.ok) {
    return {
      ok: false,
      denial: {
        httpStatus: 429,
        code: 'SPAM_FILTER',
        detail: spamCheck.detail,
      },
    };
  }

  const bannedWordsEval = await evaluateBannedWordsOnMessageSend(pool, {
    serverId,
    userId,
    content,
  });
  if (bannedWordsEval.shouldBlock) {
    return {
      ok: false,
      denial: {
        httpStatus: 403,
        code: 'BANNED_WORDS_BLOCKED',
        detail: bannedWordsEval.blockUserDetail ?? 'Blocked by word filter',
      },
    };
  }

  const fmtRow = await selectEchoChannelMessageFormat(pool, channelId);
  if (
    fmtRow &&
    echoSendPlainTextViolatesHardFormat({
      template: fmtRow.template,
      hard: fmtRow.hard,
      plain: content,
    })
  ) {
    return {
      ok: false,
      denial: {
        httpStatus: 400,
        code: 'INVALID_BODY',
        detail: 'Message must start with this channel’s format template.',
      },
    };
  }

  return { ok: true };
}

/** Content policy for message edits (spam, banned words, format, mass mentions; no slowmode). */
export async function evaluateEchoGuildOutboundMessageEditModeration(
  pool: pg.Pool,
  input: {
    serverId: string;
    channelId: string;
    userId: string;
    content: string;
    mentions?: MentionEntity[];
  },
): Promise<
  { ok: true } | { ok: false; denial: EchoGuildOutboundMessageModerationDenial }
> {
  return evaluateEchoGuildOutboundMessageModeration(pool, {
    ...input,
    skipSlowmode: true,
  });
}
