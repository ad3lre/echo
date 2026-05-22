import type { Pool } from 'pg';
import { config } from '../../config';
import { getEchoChannelVoiceE2eeEnabled } from '../../domain/echoStore/voiceE2ee';
import { getEchoChannelType } from '../../domain/echoStore/voice';
import { getEffectiveChannelPermissions } from '../../domain/echoStore/permissions';
import { isEchoServerOwner } from '../../domain/echoStore/access';
import { getGoogleLinkByUserId } from '../../domain/googleUserLinkRepo';
import { getYoutubeLinkByUserId } from '../../domain/youtubeUserLinkRepo';
import { resolveYoutubeDeliveryForUser } from '../../domain/youtubeDeliveryMode';
import {
  isYoutubeStreamKeyStageBroadcast,
  YOUTUBE_STAGE_STREAM_KEY_BROADCAST_ID,
  YOUTUBE_STAGE_STREAM_KEY_STREAM_ID,
} from '../../domain/youtubeRtmpIngest';
import {
  clearStageYoutubeBroadcast,
  getStageYoutubeBroadcast,
  listActiveStageYoutubeBroadcastsForLinkUser,
  tryClaimStageYoutubeBroadcastStart,
  updateStageYoutubeBroadcastStatus,
  upsertStageYoutubeBroadcast,
  type StageYoutubeBroadcastRow,
} from '../../domain/stageYoutubeBroadcastRepo';
import { getYoutubeUserAccessTokenForApi } from '../../domain/youtubeUserAccessToken';
import {
  createYoutubeLiveSession,
  transitionYoutubeBroadcast,
  youtubeLiveRtmpIngestUrl,
  type YoutubeLivePrivacy,
} from '../integrations/youtubeApiClient';
import {
  startStageRoomCompositeRtmpEgress,
  stopLiveKitEgress,
} from '../livekit/livekitEgress';

export type StageYoutubeStreamPublic = {
  active: boolean;
  status: string | null;
  title: string | null;
  privacyStatus: string | null;
  watchUrl: string | null;
  youtubeChannelTitle: string | null;
  /** How this stage session reaches YouTube (oauth API vs saved stream key). */
  streamSource: 'oauth' | 'stream_key' | null;
  startedByUserId: string | null;
  errorCode: string | null;
};

export async function canUserManageStageYoutubeStream(
  pool: Pool,
  serverId: string,
  channelId: string,
  userId: string,
): Promise<boolean> {
  if (await isEchoServerOwner(pool, serverId, userId)) return true;
  const perms = await getEffectiveChannelPermissions(
    pool,
    serverId,
    userId,
    channelId,
  );
  return perms.has('MANAGE_CHANNELS') || perms.has('MANAGE_GUILD');
}

function watchUrlForViewer(
  row: StageYoutubeBroadcastRow,
  canSeeDetails: boolean,
): string | null {
  if (!row.watchUrl) return null;
  if (canSeeDetails) return row.watchUrl;
  return row.privacyStatus === 'public' ? row.watchUrl : null;
}

function publicStreamFromRow(
  row: StageYoutubeBroadcastRow | null,
  viewerUserId: string,
  pool: Pool,
  serverId: string,
  channelId: string,
): Promise<StageYoutubeStreamPublic> {
  return (async () => {
    if (!row || row.status === 'ended' || row.status === 'failed') {
      return {
        active: false,
        status: row?.status ?? null,
        title: null,
        privacyStatus: null,
        watchUrl: null,
        youtubeChannelTitle: null,
        streamSource: null,
        startedByUserId: null,
        errorCode: row?.errorCode ?? null,
      };
    }
    const link = await getYoutubeLinkByUserId(pool, row.youtubeLinkUserId);
    const streamKeyMode = isYoutubeStreamKeyStageBroadcast(row.youtubeBroadcastId);
    const canSeeDetails = await canUserManageStageYoutubeStream(
      pool,
      serverId,
      channelId,
      viewerUserId,
    );
    return {
      active: row.status === 'starting' || row.status === 'live',
      status: row.status,
      title: canSeeDetails ? row.title : null,
      privacyStatus: canSeeDetails ? row.privacyStatus : null,
      watchUrl: watchUrlForViewer(row, canSeeDetails),
      youtubeChannelTitle: streamKeyMode
        ? 'Stream key'
        : (link?.channelTitle ?? null),
      streamSource: streamKeyMode ? 'stream_key' : 'oauth',
      startedByUserId: canSeeDetails ? row.startedByUserId : null,
      errorCode: canSeeDetails ? row.errorCode : null,
    };
  })();
}

export async function getStageYoutubeStreamStatus(
  pool: Pool,
  serverId: string,
  channelId: string,
  viewerUserId: string,
): Promise<StageYoutubeStreamPublic> {
  const row = await getStageYoutubeBroadcast(pool, serverId, channelId);
  return publicStreamFromRow(row, viewerUserId, pool, serverId, channelId);
}

const YOUTUBE_API_USER_MESSAGE =
  'Could not reach YouTube right now. Try again in a few minutes.';

export type StartStageYoutubeStreamResult =
  | { ok: true; stream: StageYoutubeStreamPublic }
  | { ok: false; code: string; message: string };

export async function startStageYoutubeStream(
  pool: Pool,
  opts: {
    serverId: string;
    channelId: string;
    actorUserId: string;
    title?: string;
    privacyStatus?: YoutubeLivePrivacy;
    description?: string;
  },
): Promise<StartStageYoutubeStreamResult> {
  const channelType = await getEchoChannelType(
    pool,
    opts.serverId,
    opts.channelId,
  );
  if (channelType === null) {
    return {
      ok: false,
      code: 'NOT_FOUND',
      message: 'Channel not found.',
    };
  }
  if (channelType !== 'stage') {
    return {
      ok: false,
      code: 'NOT_STAGE_CHANNEL',
      message: 'YouTube live is only available in stage channels.',
    };
  }

  if (
    !(await canUserManageStageYoutubeStream(
      pool,
      opts.serverId,
      opts.channelId,
      opts.actorUserId,
    ))
  ) {
    return {
      ok: false,
      code: 'FORBIDDEN',
      message: 'Manage Channels permission required to go live on YouTube.',
    };
  }

  if (!config.liveKitEnabled) {
    return {
      ok: false,
      code: 'LIVEKIT_DISABLED',
      message: 'Voice is not configured on this server.',
    };
  }

  if (!config.liveKitEgressEnabled) {
    return {
      ok: false,
      code: 'LIVEKIT_EGRESS_DISABLED',
      message:
        'LiveKit egress is not enabled. Set LIVEKIT_EGRESS_ENABLED=true and run the egress service.',
    };
  }

  const e2ee = await getEchoChannelVoiceE2eeEnabled(
    pool,
    opts.serverId,
    opts.channelId,
  );
  if (e2ee) {
    return {
      ok: false,
      code: 'VOICE_E2EE_BLOCKS_EGRESS',
      message:
        'YouTube live streaming is not available while voice E2EE is enabled on this stage.',
    };
  }

  const delivery = await resolveYoutubeDeliveryForUser(pool, opts.actorUserId);
  if (delivery.mode === 'none') {
    return {
      ok: false,
      code: 'YOUTUBE_NOT_LINKED',
      message:
        'Connect YouTube in Settings (channel link or stream key) before going live.',
    };
  }

  if (delivery.mode === 'oauth') {
    const googleLink = await getGoogleLinkByUserId(pool, opts.actorUserId);
    if (!googleLink) {
      return {
        ok: false,
        code: 'GOOGLE_NOT_LINKED',
        message:
          'Link your Google account in Settings → Google before using channel link.',
      };
    }
    return startStageYoutubeStreamOauth(pool, opts, delivery.userId);
  }

  return startStageYoutubeStreamWithStreamKey(pool, opts, delivery.rtmpUrl);
}

async function startStageYoutubeStreamWithStreamKey(
  pool: Pool,
  opts: {
    serverId: string;
    channelId: string;
    actorUserId: string;
    title?: string;
    privacyStatus?: YoutubeLivePrivacy;
    description?: string;
  },
  rtmpUrl: string,
): Promise<StartStageYoutubeStreamResult> {
  const privacyStatus: YoutubeLivePrivacy =
    opts.privacyStatus === 'public' ||
    opts.privacyStatus === 'private' ||
    opts.privacyStatus === 'unlisted'
      ? opts.privacyStatus
      : 'unlisted';
  const title =
    (opts.title ?? '').trim() ||
    `Echo stage — ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`;

  const claimed = await tryClaimStageYoutubeBroadcastStart(pool, {
    serverId: opts.serverId,
    channelId: opts.channelId,
    startedByUserId: opts.actorUserId,
    youtubeLinkUserId: opts.actorUserId,
    privacyStatus,
    title,
  });
  if (!claimed) {
    return {
      ok: false,
      code: 'ALREADY_LIVE',
      message: 'This stage is already streaming to YouTube.',
    };
  }

  await upsertStageYoutubeBroadcast(pool, {
    serverId: opts.serverId,
    channelId: opts.channelId,
    startedByUserId: opts.actorUserId,
    youtubeLinkUserId: opts.actorUserId,
    youtubeBroadcastId: YOUTUBE_STAGE_STREAM_KEY_BROADCAST_ID,
    youtubeStreamId: YOUTUBE_STAGE_STREAM_KEY_STREAM_ID,
    livekitEgressId: null,
    status: 'starting',
    privacyStatus,
    title,
    watchUrl: null,
    errorCode: null,
  });

  let egressId: string;
  try {
    egressId = await startStageRoomCompositeRtmpEgress({
      serverId: opts.serverId,
      channelId: opts.channelId,
      rtmpUrl,
    });
  } catch (e) {
    const code =
      e instanceof Error && e.message === 'LIVEKIT_EGRESS_NOT_CONFIGURED'
        ? 'LIVEKIT_EGRESS_DISABLED'
        : 'LIVEKIT_EGRESS_FAILED';
    await updateStageYoutubeBroadcastStatus(pool, opts.serverId, opts.channelId, {
      status: 'failed',
      errorCode: code,
      ended: true,
    });
    await clearStageYoutubeBroadcast(pool, opts.serverId, opts.channelId);
    return {
      ok: false,
      code,
      message: 'Could not start the RTMP stream to YouTube.',
    };
  }

  await updateStageYoutubeBroadcastStatus(pool, opts.serverId, opts.channelId, {
    status: 'live',
    livekitEgressId: egressId,
  });

  const stream = await getStageYoutubeStreamStatus(
    pool,
    opts.serverId,
    opts.channelId,
    opts.actorUserId,
  );
  return { ok: true, stream };
}

async function startStageYoutubeStreamOauth(
  pool: Pool,
  opts: {
    serverId: string;
    channelId: string;
    actorUserId: string;
    title?: string;
    privacyStatus?: YoutubeLivePrivacy;
    description?: string;
  },
  _youtubeUserId: string,
): Promise<StartStageYoutubeStreamResult> {
  const privacyStatus: YoutubeLivePrivacy =
    opts.privacyStatus === 'public' ||
    opts.privacyStatus === 'private' ||
    opts.privacyStatus === 'unlisted'
      ? opts.privacyStatus
      : 'unlisted';
  const title =
    (opts.title ?? '').trim() ||
    `Echo stage — ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`;

  const claimed = await tryClaimStageYoutubeBroadcastStart(pool, {
    serverId: opts.serverId,
    channelId: opts.channelId,
    startedByUserId: opts.actorUserId,
    youtubeLinkUserId: opts.actorUserId,
    privacyStatus,
    title,
  });
  if (!claimed) {
    return {
      ok: false,
      code: 'ALREADY_LIVE',
      message: 'This stage is already streaming to YouTube.',
    };
  }

  let accessToken: string;
  try {
    accessToken = await getYoutubeUserAccessTokenForApi(pool, opts.actorUserId);
  } catch (e) {
    await clearStageYoutubeBroadcast(pool, opts.serverId, opts.channelId);
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === 'NOT_LINKED' || msg === 'TOKEN_EXPIRED') {
      return {
        ok: false,
        code: 'YOUTUBE_TOKEN_EXPIRED',
        message: 'Reconnect your YouTube account in Settings.',
      };
    }
    throw e;
  }

  let session;
  try {
    session = await createYoutubeLiveSession(accessToken, {
      title,
      privacyStatus,
      description: opts.description,
    });
  } catch {
    await clearStageYoutubeBroadcast(pool, opts.serverId, opts.channelId);
    return {
      ok: false,
      code: 'YOUTUBE_API_ERROR',
      message: YOUTUBE_API_USER_MESSAGE,
    };
  }

  await upsertStageYoutubeBroadcast(pool, {
    serverId: opts.serverId,
    channelId: opts.channelId,
    startedByUserId: opts.actorUserId,
    youtubeLinkUserId: opts.actorUserId,
    youtubeBroadcastId: session.broadcastId,
    youtubeStreamId: session.streamId,
    livekitEgressId: null,
    status: 'starting',
    privacyStatus,
    title,
    watchUrl: session.watchUrl,
    errorCode: null,
  });

  const rtmpUrl = youtubeLiveRtmpIngestUrl(session);
  let egressId: string;
  try {
    egressId = await startStageRoomCompositeRtmpEgress({
      serverId: opts.serverId,
      channelId: opts.channelId,
      rtmpUrl,
    });
  } catch (e) {
    const code =
      e instanceof Error && e.message === 'LIVEKIT_EGRESS_NOT_CONFIGURED'
        ? 'LIVEKIT_EGRESS_DISABLED'
        : 'LIVEKIT_EGRESS_FAILED';
    await updateStageYoutubeBroadcastStatus(pool, opts.serverId, opts.channelId, {
      status: 'failed',
      errorCode: code,
      ended: true,
    });
    try {
      await transitionYoutubeBroadcast(
        accessToken,
        session.broadcastId,
        'complete',
      );
    } catch {
      /* best effort */
    }
    await clearStageYoutubeBroadcast(pool, opts.serverId, opts.channelId);
    return {
      ok: false,
      code,
      message: 'Could not start the RTMP stream to YouTube.',
    };
  }

  await updateStageYoutubeBroadcastStatus(pool, opts.serverId, opts.channelId, {
    status: 'starting',
    livekitEgressId: egressId,
    watchUrl: session.watchUrl,
  });

  try {
    await transitionYoutubeBroadcast(
      accessToken,
      session.broadcastId,
      'testing',
    );
    await transitionYoutubeBroadcast(accessToken, session.broadcastId, 'live');
  } catch {
    await stopLiveKitEgress(egressId);
    await updateStageYoutubeBroadcastStatus(pool, opts.serverId, opts.channelId, {
      status: 'failed',
      errorCode: 'YOUTUBE_GO_LIVE_FAILED',
      ended: true,
    });
    try {
      await transitionYoutubeBroadcast(
        accessToken,
        session.broadcastId,
        'complete',
      );
    } catch {
      /* ignore */
    }
    await clearStageYoutubeBroadcast(pool, opts.serverId, opts.channelId);
    return {
      ok: false,
      code: 'YOUTUBE_GO_LIVE_FAILED',
      message: 'YouTube rejected the live transition. Try again.',
    };
  }

  await updateStageYoutubeBroadcastStatus(pool, opts.serverId, opts.channelId, {
    status: 'live',
    livekitEgressId: egressId,
    watchUrl: session.watchUrl,
  });

  const stream = await getStageYoutubeStreamStatus(
    pool,
    opts.serverId,
    opts.channelId,
    opts.actorUserId,
  );
  return { ok: true, stream };
}

export type StopStageYoutubeStreamResult =
  | { ok: true }
  | { ok: false; code: string; message: string };

async function forceStopStageYoutubeBroadcastRow(
  pool: Pool,
  row: StageYoutubeBroadcastRow,
): Promise<void> {
  if (row.status !== 'starting' && row.status !== 'live' && row.status !== 'stopping') {
    return;
  }

  await updateStageYoutubeBroadcastStatus(pool, row.serverId, row.channelId, {
    status: 'stopping',
  });

  if (row.livekitEgressId) {
    await stopLiveKitEgress(row.livekitEgressId);
  }

  if (
    row.youtubeBroadcastId.trim() &&
    !isYoutubeStreamKeyStageBroadcast(row.youtubeBroadcastId)
  ) {
    try {
      const accessToken = await getYoutubeUserAccessTokenForApi(
        pool,
        row.youtubeLinkUserId,
      );
      await transitionYoutubeBroadcast(
        accessToken,
        row.youtubeBroadcastId,
        'complete',
      );
    } catch {
      /* token or API failure should not block local cleanup */
    }
  }

  await updateStageYoutubeBroadcastStatus(pool, row.serverId, row.channelId, {
    status: 'ended',
    ended: true,
  });
  await clearStageYoutubeBroadcast(pool, row.serverId, row.channelId);
}

/** Ends every in-progress stage YouTube stream using this user's linked channel. */
export async function stopAllActiveStageYoutubeStreamsForLinkUser(
  pool: Pool,
  youtubeLinkUserId: string,
): Promise<void> {
  const rows = await listActiveStageYoutubeBroadcastsForLinkUser(
    pool,
    youtubeLinkUserId,
  );
  for (const row of rows) {
    await forceStopStageYoutubeBroadcastRow(pool, row);
  }
}

export async function stopStageYoutubeStream(
  pool: Pool,
  opts: {
    serverId: string;
    channelId: string;
    actorUserId: string;
  },
): Promise<StopStageYoutubeStreamResult> {
  if (
    !(await canUserManageStageYoutubeStream(
      pool,
      opts.serverId,
      opts.channelId,
      opts.actorUserId,
    ))
  ) {
    return {
      ok: false,
      code: 'FORBIDDEN',
      message: 'Manage Channels permission required to stop YouTube live.',
    };
  }

  const row = await getStageYoutubeBroadcast(
    pool,
    opts.serverId,
    opts.channelId,
  );
  if (!row || (row.status !== 'starting' && row.status !== 'live')) {
    return {
      ok: false,
      code: 'NOT_LIVE',
      message: 'This stage is not streaming to YouTube.',
    };
  }

  await forceStopStageYoutubeBroadcastRow(pool, row);
  return { ok: true };
}
