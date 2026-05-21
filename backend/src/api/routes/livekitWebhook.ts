import type { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { createHmac } from 'node:crypto';
import { WebhookReceiver } from 'livekit-server-sdk';
import { config } from '../../config';
import { getPgPool } from '../../db/pg';
import { sendError } from '../errors';
import { parseLiveKitRoomName } from '../../services/livekit/livekitAdapter';
import {
  echoDmVoiceE2eeRequired,
  getEchoChannelVoiceE2eeEnabled,
  insertEchoAudit,
  supersedeVoiceE2eeEpochsForChannel,
} from '../../domain/echoStore';
import { ECHO_DM_REALM_SERVER_ID } from '../../domain/echoStore/dmThreads';
import { nextEchoSnowflakeId } from '../../domain/echoSnowflake';
import { echoLivekitWebhookEventTotal } from '../../observability/echoMetrics';
import { vcTrace } from '../../observability/voiceTraceLog';
import {
  publishEchoWorkspaceEvent,
  publishVoiceRosterDelta,
} from '../../platform/echoPlatformEvents';
import { acceptLiveKitWebhookOnce } from '../../services/livekit/webhookReplayCache';

let receiver: WebhookReceiver | null = null;

async function forwardLiveKitWebhookToSidecar(opts: {
  forwardUrl: string;
  envelope: unknown;
  reqLog: FastifyInstance['log'];
}): Promise<void> {
  try {
    const body = JSON.stringify(opts.envelope);
    const ts = Date.now().toString();
    // Sidecar can verify authenticity/integrity with LIVEKIT_API_SECRET.
    const signature = createHmac('sha256', config.liveKitApiSecret)
      .update(`${ts}.${body}`)
      .digest('hex');
    const r = await fetch(opts.forwardUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-echo-signature-ts': ts,
        'x-echo-signature': signature,
      },
      body,
    });
    if (!r.ok) {
      vcTrace(opts.reqLog, 'livekit.webhook:sidecar_forward_non_2xx', {
        forwardUrl: opts.forwardUrl,
        status: r.status,
      });
    }
  } catch (e) {
    vcTrace(opts.reqLog, 'livekit.webhook:sidecar_forward_failed', {
      forwardUrl: opts.forwardUrl,
      err: e instanceof Error ? e.message : String(e),
    });
  }
}

function getReceiver(): WebhookReceiver | null {
  if (!config.liveKitEnabled) return null;
  if (!receiver) {
    receiver = new WebhookReceiver(
      config.liveKitApiKey,
      config.liveKitApiSecret,
    );
  }
  return receiver;
}

function trackSourceIsCamera(source: unknown): boolean {
  if (source === 1 || source === '1') return true;
  const s = String(source ?? '').toLowerCase();
  return s === 'camera';
}

function trackSourceIsScreenShare(source: unknown): boolean {
  if (source === 2 || source === '2') return true;
  const s = String(source ?? '').toLowerCase();
  return s.includes('screen');
}

function trackSourceIsMicrophone(source: unknown): boolean {
  if (source === 0 || source === '0') return true;
  const s = String(source ?? '').toLowerCase();
  return s === 'microphone';
}

function parseActiveSpeakerIdentities(event: unknown): string[] {
  const e = event as Record<string, unknown>;
  const participants = e.participants;
  if (Array.isArray(participants)) {
    return participants
      .map((p) => (p as { identity?: string })?.identity)
      .filter((x): x is string => typeof x === 'string' && x.length > 0);
  }
  const speakers = e.speakerIdentities ?? e.speaker_infos;
  if (Array.isArray(speakers)) {
    return speakers
      .map((x) =>
        typeof x === 'string'
          ? x
          : ((x as { identity?: string })?.identity ?? ''),
      )
      .filter((x) => x.length > 0);
  }
  return [];
}

export default async function livekitWebhookRoutes(
  fastify: FastifyInstance,
  _opts: FastifyPluginOptions,
): Promise<void> {
  fastify.addContentTypeParser(
    'application/webhook+json',
    { parseAs: 'string' },
    (_req, body, done) => {
      done(null, body);
    },
  );

  fastify.post('/hooks/livekit', async (req, reply) => {
    vcTrace(req.log, 'livekit.webhook:hit', {
      contentType:
        (req.headers['content-type'] as string | undefined) ?? undefined,
      hasAuthHeader: typeof req.headers.authorization === 'string',
      bodyIsString: typeof req.body === 'string',
      rawBodyChars:
        typeof req.body === 'string'
          ? req.body.length
          : JSON.stringify(req.body ?? {}).length,
    });
    const recv = getReceiver();
    if (!recv) {
      vcTrace(req.log, 'livekit.webhook:receiver_null', {});
      req.log.warn('[LiveKit:Webhook] hook hit but LiveKit is NOT enabled');
      return sendError(
        reply,
        503,
        'NOT_CONFIGURED',
        'LiveKit webhook receiver is not configured',
      );
    }
    const pool = getPgPool();
    if (!pool) {
      vcTrace(req.log, 'livekit.webhook:pool_null', {});
      return sendError(reply, 503, 'NOT_AVAILABLE', 'Database unavailable.');
    }
    const rawBody =
      typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    const authHeader =
      typeof req.headers.authorization === 'string'
        ? req.headers.authorization
        : undefined;

    let event;
    try {
      event = await recv.receive(rawBody, authHeader);
    } catch (e) {
      vcTrace(req.log, 'livekit.webhook:signature_failed', {
        err: e instanceof Error ? e.message : String(e),
      });
      req.log.warn('[LiveKit:Webhook] ✗ signature verification failed');
      return sendError(reply, 401, 'UNAUTHORIZED', 'Invalid webhook signature');
    }

    if (!acceptLiveKitWebhookOnce(rawBody, authHeader)) {
      vcTrace(req.log, 'livekit.webhook:replay', {});
      return reply.code(200).send({ ok: true, duplicate: true });
    }

    req.log.info(
      `[LiveKit:Webhook] ← event=${event.event} room=${event.room?.name ?? '?'} participant=${event.participant?.identity ?? '?'}`,
    );
    vcTrace(req.log, 'livekit.webhook:event_received', {
      event: event.event,
      roomName: event.room?.name ?? null,
      participantIdentity: event.participant?.identity ?? null,
    });

    if (config.voiceSidecarEnabled && config.voiceSidecarForwardUrl) {
      void forwardLiveKitWebhookToSidecar({
        forwardUrl: config.voiceSidecarForwardUrl,
        envelope: event,
        reqLog: req.log,
      });
    }

    const roomParsed = event.room?.name
      ? parseLiveKitRoomName(event.room.name)
      : null;
    if (!roomParsed) {
      vcTrace(req.log, 'livekit.webhook:room_unparseable', {
        roomName: event.room?.name ?? null,
      });
      req.log.warn(
        `[LiveKit:Webhook] ignoring event — room name unparseable: ${event.room?.name}`,
      );
      echoLivekitWebhookEventTotal.labels('room_unparseable').inc();
      vcTrace(req.log, 'livekit.webhook:done', { early: 'room_unparseable' });
      return reply.code(200).send({ ok: true });
    }
    const { serverId, channelId } = roomParsed;
    const identity = event.participant?.identity;

    const publishVoiceE2eeEpochSuperseded = (): void => {
      publishEchoWorkspaceEvent(
        fastify,
        {
          kind: 'voice_e2ee_epoch_superseded',
          version: nextEchoSnowflakeId(),
          serverId,
          voiceChannelId: channelId,
        },
        { serverId },
      );
    };

    if (event.event === 'participant_joined' && identity) {
      vcTrace(req.log, 'livekit.webhook:branch_participant_joined', {
        serverId,
        channelId,
        identity,
      });
      echoLivekitWebhookEventTotal.labels('participant_joined').inc();
      req.log.info(
        `[LiveKit:Webhook] ✓ participant_joined — user=${identity} server=${serverId} channel=${channelId}`,
      );
      await pool.query(
        `INSERT INTO echo_voice_participants (server_id, channel_id, user_id)
         VALUES ($1, $2, $3)
         ON CONFLICT (server_id, user_id) DO UPDATE SET channel_id = $2, joined_at = NOW()`,
        [serverId, channelId, identity],
      );
      const auditId = await insertEchoAudit(
        pool,
        serverId,
        identity,
        'voice.livekit_participant_joined',
        'channel',
        channelId,
        {},
      );
      publishEchoWorkspaceEvent(
        fastify,
        { kind: 'workspace_invalidated', version: auditId, serverId },
        { serverId },
      );
      publishVoiceRosterDelta(
        fastify,
        serverId,
        { channelId, userId: identity, action: 'join' },
        auditId,
      );
      // Do not supersede voice E2EE epochs here — the joiner often just created
      // the active epoch during livekit-session minting. Superseding on join
      // invalidates that epoch and clients disconnect via voice_e2ee_epoch_superseded.
      // Rotation is published from the epoch POST handler when needed.
    } else if (event.event === 'participant_left' && identity) {
      vcTrace(req.log, 'livekit.webhook:branch_participant_left', {
        serverId,
        channelId,
        identity,
      });
      echoLivekitWebhookEventTotal.labels('participant_left').inc();
      req.log.info(
        `[LiveKit:Webhook] ✓ participant_left — user=${identity} server=${serverId} channel=${channelId}`,
      );
      await pool.query(
        `DELETE FROM echo_voice_participants
         WHERE server_id = $1 AND channel_id = $2 AND user_id = $3`,
        [serverId, channelId, identity],
      );
      const auditId = await insertEchoAudit(
        pool,
        serverId,
        identity,
        'voice.livekit_participant_left',
        'channel',
        channelId,
        {},
      );
      publishEchoWorkspaceEvent(
        fastify,
        { kind: 'workspace_invalidated', version: auditId, serverId },
        { serverId },
      );
      publishVoiceRosterDelta(
        fastify,
        serverId,
        { channelId, userId: identity, action: 'leave' },
        auditId,
      );
      const e2eeEnabled =
        serverId === ECHO_DM_REALM_SERVER_ID
          ? await echoDmVoiceE2eeRequired(pool, channelId)
          : await getEchoChannelVoiceE2eeEnabled(pool, serverId, channelId);
      if (e2eeEnabled) {
        const remaining = await pool.query(
          `SELECT 1 FROM echo_voice_participants
           WHERE server_id = $1 AND channel_id = $2
           LIMIT 1`,
          [serverId, channelId],
        );
        if (remaining.rows.length === 0) {
          const n = await supersedeVoiceE2eeEpochsForChannel(
            pool,
            serverId,
            channelId,
          );
          if (n > 0) publishVoiceE2eeEpochSuperseded();
        }
      }
    } else if (
      (event.event === 'track_published' ||
        event.event === 'track_unpublished') &&
      identity
    ) {
      const track = (event as { track?: { source?: unknown } }).track;
      const src = track?.source;
      const isCam = trackSourceIsCamera(src);
      const isScreen = trackSourceIsScreenShare(src);
      const isMic = trackSourceIsMicrophone(src);
      if (!isCam && !isScreen) {
        const eventVerb =
          event.event === 'track_published' ? 'published' : 'unpublished';
        req.log.info(
          `[LiveKit:Webhook] track_${eventVerb} — source=${String(src)} isMic=${isMic} identity=${identity} ← ${isMic ? 'MICROPHONE audio track (not persisted to DB)' : 'unknown source, ignoring'}`,
        );
        vcTrace(req.log, 'livekit.webhook:track_ignored', {
          identity,
          source: String(src ?? ''),
          isMic,
          eventVerb,
          note: isMic
            ? 'microphone_track_not_persisted_to_db'
            : 'unknown_source',
        });
        echoLivekitWebhookEventTotal
          .labels(isMic ? 'track_mic' : 'track_ignored')
          .inc();
        vcTrace(req.log, 'livekit.webhook:done', {
          early: isMic ? 'track_mic' : 'track_ignored',
        });
        return reply.code(200).send({ ok: true });
      }
      const published = event.event === 'track_published';
      vcTrace(req.log, 'livekit.webhook:branch_track', {
        serverId,
        channelId,
        identity,
        published,
        isCam,
        isScreen,
        source: String(src ?? ''),
      });
      echoLivekitWebhookEventTotal
        .labels(published ? 'track_published' : 'track_unpublished')
        .inc();
      if (isCam) {
        await pool.query(
          `UPDATE echo_voice_participants SET has_published_camera = $4
           WHERE server_id = $1 AND channel_id = $2 AND user_id = $3`,
          [serverId, channelId, identity, published],
        );
      }
      if (isScreen) {
        await pool.query(
          `UPDATE echo_voice_participants SET has_published_screen = $4
           WHERE server_id = $1 AND channel_id = $2 AND user_id = $3`,
          [serverId, channelId, identity, published],
        );
      }
      const auditId = await insertEchoAudit(
        pool,
        serverId,
        identity,
        published
          ? 'voice.livekit_track_published'
          : 'voice.livekit_track_unpublished',
        'channel',
        channelId,
        { source: String(src ?? '') },
      );
      publishEchoWorkspaceEvent(
        fastify,
        { kind: 'workspace_invalidated', version: auditId, serverId },
        { serverId },
      );
    } else if ((event.event as string) === 'room_finished') {
      vcTrace(req.log, 'livekit.webhook:branch_room_finished', {
        serverId,
        channelId,
      });
      echoLivekitWebhookEventTotal.labels('room_finished').inc();
      req.log.info(
        `[LiveKit:Webhook] ✓ room_finished — server=${serverId} channel=${channelId}`,
      );
      const del = await pool.query(
        `DELETE FROM echo_voice_participants
         WHERE server_id = $1 AND channel_id = $2
         RETURNING user_id`,
        [serverId, channelId],
      );
      const purgedUserIds = (del.rows as { user_id: unknown }[]).map((r) =>
        String(r.user_id),
      );
      if (purgedUserIds.length > 0) {
        vcTrace(req.log, 'livekit.webhook:room_finished_purged', {
          serverId,
          channelId,
          purgedCount: purgedUserIds.length,
        });
        let latestAuditId: string | null = null;
        for (const uid of purgedUserIds) {
          try {
            latestAuditId = await insertEchoAudit(
              pool,
              serverId,
              uid,
              'voice.livekit_room_finished',
              'channel',
              channelId,
              { reason: 'room_finished' },
            );
          } catch (e) {
            vcTrace(req.log, 'livekit.webhook:room_finished_audit_failed', {
              serverId,
              channelId,
              uid,
              err: e instanceof Error ? e.message : String(e),
            });
          }
        }
        publishEchoWorkspaceEvent(
          fastify,
          {
            kind: 'workspace_invalidated',
            version: latestAuditId ?? `room_finished-${Date.now()}`,
            serverId,
          },
          { serverId },
        );
      }
      let superseded = 0;
      if (serverId === ECHO_DM_REALM_SERVER_ID) {
        if (await echoDmVoiceE2eeRequired(pool, channelId)) {
          superseded = await supersedeVoiceE2eeEpochsForChannel(
            pool,
            serverId,
            channelId,
          );
        }
      } else if (
        await getEchoChannelVoiceE2eeEnabled(pool, serverId, channelId)
      ) {
        superseded = await supersedeVoiceE2eeEpochsForChannel(
          pool,
          serverId,
          channelId,
        );
      }
      if (superseded > 0) publishVoiceE2eeEpochSuperseded();
    } else if ((event.event as string) === 'active_speakers_changed') {
      echoLivekitWebhookEventTotal.labels('active_speakers_changed').inc();
      const ids = parseActiveSpeakerIdentities(event);
      vcTrace(req.log, 'livekit.webhook:branch_active_speakers_changed', {
        serverId,
        channelId,
        speakerCount: ids.length,
        speakerIdsSample: ids.slice(0, 12),
        emitToWorkspace:
          ids.length > 0 && config.liveKitEmitActiveSpeakersWebhook,
      });
      req.log.info(
        `[LiveKit:Webhook] active_speakers_changed — speakers=${ids.length} ids=[${ids.join(', ')}] room=${event.room?.name ?? '?'}`,
      );
      if (ids.length > 0 && config.liveKitEmitActiveSpeakersWebhook) {
        publishEchoWorkspaceEvent(
          fastify,
          {
            kind: 'voice_active_speakers',
            version: `${Date.now()}`,
            serverId,
            voiceChannelId: channelId,
            activeSpeakerIds: ids,
          },
          { serverId },
        );
      }
    } else {
      vcTrace(req.log, 'livekit.webhook:no_handler', {
        event: event.event,
        serverId,
        channelId,
        hasIdentity: !!identity,
      });
      echoLivekitWebhookEventTotal.labels('no_handler').inc();
      req.log.info(`[LiveKit:Webhook] event=${event.event} — no action taken`);
    }

    vcTrace(req.log, 'livekit.webhook:done', { event: event.event });
    return reply.code(200).send({ ok: true });
  });
}
