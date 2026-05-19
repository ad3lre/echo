/**
 * Normalized API error responses.
 */

import type { FastifyReply } from 'fastify';
import type { EchoChannelAccessDiagnosis } from '../domain/echoStore/access';
import type { EchoVoiceJoinResult } from '../domain/echoStore/voice';
import type { ApiErrorBody } from '../../../shared/types';

/** `message` is returned to clients as JSON and shown in the Echo UI — keep it human-readable. */
export function sendError(
  reply: FastifyReply,
  statusCode: number,
  code: string,
  message: string,
  detail?: string,
): FastifyReply {
  const body: ApiErrorBody =
    detail !== undefined ? { code, message, detail } : { code, message };
  return reply.code(statusCode).send(body);
}

/** Shared copy when `isMemberOfServer` fails (REST + voice). */
export const ECHO_MSG_NOT_SERVER_MEMBER =
  'You are not a member of this server. Ask for an invite or join from Explore if the server is public.';

export function sendEchoChannelAccessDenied(
  reply: FastifyReply,
  denial: Exclude<EchoChannelAccessDiagnosis, { ok: true }>,
): FastifyReply {
  if (denial.code === 'CHANNEL_NOT_FOUND')
    return sendError(reply, 404, 'NOT_FOUND', denial.message, denial.code);
  return sendError(reply, 403, 'FORBIDDEN', denial.message, denial.code);
}

export function sendEchoVoiceJoinDenied(
  reply: FastifyReply,
  denial: Extract<EchoVoiceJoinResult, { ok: false }>,
): FastifyReply {
  switch (denial.reason) {
    case 'not_found':
      return sendError(
        reply,
        404,
        'NOT_FOUND',
        'No voice channel exists with this id on this server, or this channel is not a voice channel.',
        'VOICE_CHANNEL_NOT_FOUND',
      );
    case 'not_member':
      return sendError(
        reply,
        403,
        'FORBIDDEN',
        ECHO_MSG_NOT_SERVER_MEMBER,
        'NOT_SERVER_MEMBER',
      );
    case 'banned':
      return sendError(
        reply,
        403,
        'FORBIDDEN',
        'You are banned from this server and cannot use voice channels.',
        'BANNED_FROM_SERVER',
      );
    case 'timeout':
      return sendError(
        reply,
        403,
        'FORBIDDEN',
        'You are in a communication timeout in this server and cannot join voice channels until it ends.',
        'COMMUNICATION_TIMEOUT',
      );
    case 'no_view_channel':
      return sendError(
        reply,
        403,
        'FORBIDDEN',
        'You cannot use this voice channel: your roles do not include View Channel (the channel may be hidden or denied by an overwrite).',
        'MISSING_VIEW_CHANNEL',
      );
    case 'no_connect':
      return sendError(
        reply,
        403,
        'FORBIDDEN',
        'You cannot join this voice channel: Connect is denied for your roles on this channel.',
        'MISSING_CONNECT',
      );
    case 'full':
      return sendError(
        reply,
        403,
        'CHANNEL_FULL',
        'This voice channel is full (user limit reached). Ask an admin to raise the limit, or have a moderator move someone.',
        'VOICE_CHANNEL_FULL',
      );
  }
}
