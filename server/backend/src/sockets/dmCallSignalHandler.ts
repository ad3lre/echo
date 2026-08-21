import type { FastifyBaseLogger } from 'fastify';
import type { Socket } from 'socket.io';
import type { Server } from 'socket.io';
import { appendBackendDiagnostic } from '../observability/sessionDiagnostics';
import {
  bumpEchoDmThreadActivity,
  getEchoStore,
  getEchoDmCallSignalThreadForUser,
  listEchoDmParticipantUserIds,
  userMayJoinDmLiveKitRoom,
} from '../domain/echoStore';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  SocketData,
  EchoDmCallEndedReason,
} from '../../../../contracts/types';

type IoSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  {},
  SocketData
>;

const END_REASONS = new Set<EchoDmCallEndedReason>(['ended', 'declined']);

export function registerDmCallSignalHandler(
  socket: IoSocket,
  io: Server,
  log: FastifyBaseLogger,
  userId: string,
  options: { authenticated: boolean; isGuest: boolean },
): void {
  const { authenticated, isGuest } = options;

  const emitToParticipants = (
    kind: 'incoming' | 'accepted' | 'ended',
    payload:
      | { channelId?: string; reason?: string; correlationId?: string }
      | undefined,
  ) => {
    void (async () => {
      const channelId =
        typeof payload?.channelId === 'string' ? payload.channelId.trim() : '';
      const correlationId =
        typeof payload?.correlationId === 'string'
          ? payload.correlationId.trim()
          : '';
      const traceId =
        correlationId || `dm_call_${kind}_${channelId || 'missing'}`;
      await appendBackendDiagnostic({
        level: 'info',
        domain: 'socket',
        event: 'dm_call_signal_received',
        stage: 'attempt',
        traceId,
        context: {
          kind,
          channelId,
          actorUserId: userId,
          correlationId,
          authenticated,
          isGuest,
        },
      });
      if (!channelId || !authenticated || userId.startsWith('user_')) {
        await appendBackendDiagnostic({
          level: 'warn',
          domain: 'socket',
          event: 'dm_call_signal_filtered',
          stage: 'fail',
          traceId,
          context: {
            kind,
            channelId,
            actorUserId: userId,
            correlationId,
            reason: !channelId
              ? 'missing_channel'
              : !authenticated
                ? 'unauthenticated'
                : 'guest_user',
          },
        });
        return;
      }
      // Guest accounts cannot use DM LiveKit (see echoDm livekit-session). Block invite/accept
      // so peers never get a ring from a caller who will fail to join.
      if (isGuest && (kind === 'incoming' || kind === 'accepted')) {
        await appendBackendDiagnostic({
          level: 'warn',
          domain: 'socket',
          event: 'dm_call_signal_filtered',
          stage: 'fail',
          traceId,
          context: {
            kind,
            channelId,
            actorUserId: userId,
            correlationId,
            reason: 'guest_dm_call_not_supported',
          },
        });
        return;
      }
      const { enabled, pool } = await getEchoStore();
      if (!enabled || !pool) {
        await appendBackendDiagnostic({
          level: 'warn',
          domain: 'socket',
          event: 'dm_call_signal_filtered',
          stage: 'fail',
          traceId,
          context: {
            kind,
            channelId,
            actorUserId: userId,
            correlationId,
            reason: 'echo_store_unavailable',
          },
        });
        return;
      }
      if (!(await userMayJoinDmLiveKitRoom(pool, channelId, userId))) {
        await appendBackendDiagnostic({
          level: 'warn',
          domain: 'socket',
          event: 'dm_call_signal_filtered',
          stage: 'fail',
          traceId,
          context: {
            kind,
            channelId,
            actorUserId: userId,
            correlationId,
            reason: 'join_forbidden',
          },
        });
        return;
      }
      const participantIds = await listEchoDmParticipantUserIds(
        pool,
        channelId,
      );
      if (participantIds.length === 0) {
        await appendBackendDiagnostic({
          level: 'warn',
          domain: 'socket',
          event: 'dm_call_signal_filtered',
          stage: 'fail',
          traceId,
          context: {
            kind,
            channelId,
            actorUserId: userId,
            correlationId,
            reason: 'no_participants',
          },
        });
        return;
      }
      const reason =
        kind === 'ended' &&
        END_REASONS.has(payload?.reason as EchoDmCallEndedReason)
          ? (payload!.reason as EchoDmCallEndedReason)
          : 'ended';
      // Any DM call signal (ring, accept, end) is real activity — bump the inbox sort key
      // BEFORE building per-recipient thread payloads so they carry the fresh timestamp.
      await bumpEchoDmThreadActivity(pool, channelId, new Date(), 'call');
      for (const participantUserId of participantIds) {
        if (!participantUserId || participantUserId === userId) continue;
        const thread = await getEchoDmCallSignalThreadForUser(
          pool,
          channelId,
          participantUserId,
        );
        if (!thread) continue;
        io.to(`echo:user:${participantUserId}`).emit('dm:call', {
          kind,
          channelId,
          actorUserId: userId,
          thread,
          ...(correlationId ? { correlationId } : {}),
          ...(kind === 'ended' ? { reason } : {}),
        });
        await appendBackendDiagnostic({
          level: 'info',
          domain: 'socket',
          event: 'dm_call_signal_emitted',
          stage: 'success',
          traceId,
          context: {
            kind,
            channelId,
            actorUserId: userId,
            targetUserId: participantUserId,
            correlationId,
            ...(kind === 'ended' ? { reason } : {}),
          },
        });
      }
    })().catch((err) => {
      log.error(
        { err, channelId: payload?.channelId, kind },
        'dm call signal failed',
      );
    });
  };

  socket.on('dm_call:invite', (payload) =>
    emitToParticipants('incoming', payload),
  );
  socket.on('dm_call:accept', (payload) =>
    emitToParticipants('accepted', payload),
  );
  socket.on('dm_call:end', (payload) => emitToParticipants('ended', payload));
}
