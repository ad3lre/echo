import {
  EgressClient,
  EncodingOptionsPreset,
  StreamOutput,
  StreamProtocol,
} from 'livekit-server-sdk';
import { config } from '../../config';
import { liveKitRoomName, liveKitServiceHttpUrl } from './livekitAdapter';

export const STAGE_EGRESS_LAYOUTS = ['grid', 'spotlight', 'screen'] as const;
export type StageEgressLayout = (typeof STAGE_EGRESS_LAYOUTS)[number];

export function isStageEgressLayout(raw: string): raw is StageEgressLayout {
  return (STAGE_EGRESS_LAYOUTS as readonly string[]).includes(raw);
}

/** Public URL for Echo stage program egress template (LiveKit `custom_base_url`). */
export function resolveStageEgressCustomBaseUrl(): string | undefined {
  const explicit = process.env.LIVEKIT_STAGE_EGRESS_TEMPLATE_URL?.trim();
  if (explicit) {
    return explicit.endsWith('/') ? explicit : `${explicit}/`;
  }
  const app = config.echoAppPublicUrl?.trim();
  if (app.startsWith('http://') || app.startsWith('https://')) {
    return `${app.replace(/\/$/, '')}/egress/stage-program/`;
  }
  return undefined;
}

export function createLiveKitEgressClient(): EgressClient | null {
  if (!config.liveKitEnabled || !config.liveKitEgressEnabled) return null;
  return new EgressClient(
    liveKitServiceHttpUrl(config.liveKitPublicUrl),
    config.liveKitApiKey,
    config.liveKitApiSecret,
  );
}

/**
 * Starts a room-composite RTMP egress (stage program feed) to YouTube ingest.
 * Uses Echo's custom template when `LIVEKIT_STAGE_EGRESS_TEMPLATE_URL` or
 * `ECHO_APP_PUBLIC_URL` is set; otherwise LiveKit's built-in grid layout.
 */
export async function startStageRoomCompositeRtmpEgress(opts: {
  serverId: string;
  channelId: string;
  rtmpUrl: string;
  layout?: StageEgressLayout;
}): Promise<string> {
  const client = createLiveKitEgressClient();
  if (!client) {
    throw new Error('LIVEKIT_EGRESS_NOT_CONFIGURED');
  }
  const roomName = liveKitRoomName(opts.serverId, opts.channelId);
  const streamOutput = new StreamOutput({
    protocol: StreamProtocol.RTMP,
    urls: [opts.rtmpUrl],
  });
  const customBaseUrl = resolveStageEgressCustomBaseUrl();
  const layout: StageEgressLayout =
    opts.layout && isStageEgressLayout(opts.layout) ? opts.layout : 'grid';

  const info = await client.startRoomCompositeEgress(
    roomName,
    streamOutput,
    customBaseUrl
      ? {
          layout,
          customBaseUrl,
          encodingOptions: EncodingOptionsPreset.H264_1080P_30,
        }
      : {
          layout: 'grid',
          encodingOptions: EncodingOptionsPreset.H264_1080P_30,
        },
  );
  const egressId = info.egressId?.trim();
  if (!egressId) throw new Error('LIVEKIT_EGRESS_ID_MISSING');
  return egressId;
}

export async function updateStageRoomCompositeEgressLayout(
  egressId: string,
  layout: StageEgressLayout,
): Promise<void> {
  const client = createLiveKitEgressClient();
  if (!client) {
    throw new Error('LIVEKIT_EGRESS_NOT_CONFIGURED');
  }
  await client.updateLayout(egressId, layout);
}

export async function stopLiveKitEgress(egressId: string): Promise<void> {
  const client = createLiveKitEgressClient();
  if (!client) return;
  try {
    await client.stopEgress(egressId);
  } catch {
    /* egress may already be complete */
  }
}
