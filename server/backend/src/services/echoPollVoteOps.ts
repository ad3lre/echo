import type { Server } from 'socket.io';
import type pg from 'pg';
import type { PollData, PollVoteFailedCode } from '../../../../contracts/types';
import { redactPollForViewer } from '../../../../contracts/types';
import { broadcastToEchoChannel } from '../sockets/channelBroadcast';
import { canUserPostMessage, getEchoMessageById } from '../domain/echoStore';
import { upsertEchoPollVote } from '../domain/echoPollVotesDal';

export type EchoPollVoteResult =
  | { ok: true; poll: PollData }
  | { ok: false; code: PollVoteFailedCode; detail?: string };

function pollEnded(endsAt?: string): boolean {
  if (!endsAt) return false;
  return Date.now() >= new Date(endsAt).getTime();
}

function broadcastPollUpdated(
  io: Server,
  channelId: string,
  messageId: string,
  poll: PollData,
): void {
  if (poll.anonymous !== true) {
    broadcastToEchoChannel(io, channelId, 'poll:updated', {
      channelId,
      messageId,
      poll,
    });
    return;
  }
  const room = io.sockets.adapter.rooms.get(channelId);
  if (!room || room.size === 0) return;
  for (const socketId of room) {
    const sock = io.sockets.sockets.get(socketId);
    if (!sock) continue;
    const viewerId =
      typeof sock.data.userId === 'string' ? sock.data.userId : undefined;
    sock.emit('poll:updated', {
      channelId,
      messageId,
      poll: redactPollForViewer(poll, viewerId),
    });
  }
}

export async function castEchoPollVoteAndBroadcast(
  pool: pg.Pool,
  io: Server,
  userId: string,
  channelId: string,
  messageId: string,
  optionId: string,
): Promise<EchoPollVoteResult> {
  const row = await getEchoMessageById(pool, messageId);
  if (!row || row.channelId !== channelId) {
    return { ok: false, code: 'NOT_FOUND' };
  }
  if (!row.poll) {
    return { ok: false, code: 'NOT_FOUND', detail: 'Not a poll message' };
  }

  const canVote = await canUserPostMessage(pool, userId, channelId);
  if (!canVote) {
    return {
      ok: false,
      code: 'FORBIDDEN',
      detail: 'You are not allowed to interact with polls in this channel.',
    };
  }

  if (pollEnded(row.poll.endsAt)) {
    return { ok: false, code: 'POLL_ENDED' };
  }

  if (!row.poll.options.some((o) => o.id === optionId)) {
    return { ok: false, code: 'BAD_OPTION' };
  }

  try {
    await upsertEchoPollVote(pool, { messageId, userId, optionId });
  } catch {
    return { ok: false, code: 'NOT_FOUND', detail: 'Persist failed' };
  }

  const refreshed = await getEchoMessageById(pool, messageId);
  if (!refreshed?.poll) {
    return { ok: false, code: 'NOT_FOUND', detail: 'Not a poll message' };
  }

  broadcastPollUpdated(io, channelId, messageId, refreshed.poll);
  return { ok: true, poll: refreshed.poll };
}
