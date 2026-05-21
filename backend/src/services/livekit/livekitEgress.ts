import { EgressClient, StreamOutput, StreamProtocol } from 'livekit-server-sdk';
import { config } from '../../config';
import { liveKitRoomName, liveKitServiceHttpUrl } from './livekitAdapter';

export function createLiveKitEgressClient(): EgressClient | null {
  if (!config.liveKitEnabled || !config.liveKitEgressEnabled) return null;
  return new EgressClient(
    liveKitServiceHttpUrl(config.liveKitPublicUrl),
    config.liveKitApiKey,
    config.liveKitApiSecret,
  );
}

/**
 * Starts a room-composite RTMP egress (StreamYard-style program feed) to YouTube ingest.
 * Requires LiveKit Egress service running alongside the SFU.
 */
export async function startStageRoomCompositeRtmpEgress(opts: {
  serverId: string;
  channelId: string;
  rtmpUrl: string;
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
  const info = await client.startRoomCompositeEgress(
    roomName,
    streamOutput,
    'speaker',
  );
  const egressId = info.egressId?.trim();
  if (!egressId) throw new Error('LIVEKIT_EGRESS_ID_MISSING');
  return egressId;
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
