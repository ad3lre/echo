import { echoFetch } from './transport';

export {
  ECHO_VOICE_BITRATE_MAX_KBPS,
  ECHO_VOICE_BITRATE_MIN_KBPS,
} from '@shared/voiceChannelBitrateLimits';

export async function postEchoVoiceJoin(
  token: string,
  serverId: string,
  channelId: string,
): Promise<void> {
  await echoFetch<Record<string, unknown>>(
    token,
    `/servers/${encodeURIComponent(serverId)}/channels/${encodeURIComponent(channelId)}/voice/join`,
    { method: 'POST' },
  );
}

export async function postEchoVoiceLeave(
  token: string,
  serverId: string,
): Promise<void> {
  await echoFetch<Record<string, unknown>>(
    token,
    `/servers/${encodeURIComponent(serverId)}/voice/leave`,
    { method: 'POST' },
  );
}

export async function fetchEchoVoiceParticipants(
  token: string,
  serverId: string,
  channelId: string,
): Promise<{ participants: string[] }> {
  return echoFetch(
    token,
    `/servers/${encodeURIComponent(serverId)}/channels/${encodeURIComponent(channelId)}/voice/participants`,
  );
}

export type EchoVoiceE2eeSessionInfo = {
  required: boolean;
  epochId: string | null;
};

export type EchoLiveKitSessionResponse = {
  url: string;
  token: string;
  roomName: string;
  /** Per-channel audio bitrate in bps, or null to use the server default. */
  bitrateBps: number | null;
  voiceE2ee?: EchoVoiceE2eeSessionInfo;
};

/** Runtime validation at the HTTP trust boundary (no schema lib). */
export function parseEchoLiveKitSessionResponse(
  data: unknown,
): EchoLiveKitSessionResponse {
  if (!data || typeof data !== 'object') {
    throw new Error('Invalid LiveKit session response: expected object');
  }
  const o = data as Record<string, unknown>;
  const { url, token, roomName } = o;
  if (
    typeof url !== 'string' ||
    typeof token !== 'string' ||
    typeof roomName !== 'string'
  ) {
    throw new Error(
      'Invalid LiveKit session response: missing url, token, or roomName',
    );
  }
  const bitrateBps = typeof o.bitrateBps === 'number' ? o.bitrateBps : null;
  let voiceE2ee: EchoVoiceE2eeSessionInfo | undefined;
  const ve = o.voiceE2ee;
  if (ve && typeof ve === 'object' && !Array.isArray(ve)) {
    const r = ve as Record<string, unknown>;
    if (typeof r.required === 'boolean') {
      voiceE2ee = {
        required: r.required,
        epochId: typeof r.epochId === 'string' ? r.epochId : null,
      };
    }
  }
  return {
    url,
    token,
    roomName,
    bitrateBps,
    ...(voiceE2ee ? { voiceE2ee } : {}),
  };
}

export async function postEchoVoiceLivekitSession(
  token: string,
  serverId: string,
  channelId: string,
): Promise<EchoLiveKitSessionResponse> {
  const raw = await echoFetch<Record<string, unknown>>(
    token,
    `/servers/${encodeURIComponent(serverId)}/channels/${encodeURIComponent(channelId)}/voice/livekit-session`,
    { method: 'POST' },
  );
  return parseEchoLiveKitSessionResponse(raw);
}

/** DM / group-DM call — same SFU as guild voice; room `echo_dm_realm:<channelId>`. */
export async function postEchoDmLivekitSession(
  token: string,
  channelId: string,
): Promise<EchoLiveKitSessionResponse> {
  const raw = await echoFetch<Record<string, unknown>>(
    token,
    `/dm/channels/${encodeURIComponent(channelId)}/voice/livekit-session`,
    { method: 'POST' },
  );
  return parseEchoLiveKitSessionResponse(raw);
}

export type EchoVoiceModerateAction =
  | 'disconnect'
  | 'move'
  | 'server_mute'
  | 'server_unmute'
  | 'server_deafen'
  | 'server_undeafen'
  | 'invite_to_speak'
  | 'move_to_audience';

export async function postEchoStageRequestSpeak(
  token: string,
  serverId: string,
  channelId: string,
): Promise<void> {
  await echoFetch<Record<string, unknown>>(
    token,
    `/servers/${encodeURIComponent(serverId)}/channels/${encodeURIComponent(channelId)}/stage/request-speak`,
    { method: 'POST' },
  );
}

export async function deleteEchoStageRequestSpeak(
  token: string,
  serverId: string,
  channelId: string,
): Promise<void> {
  await echoFetch<Record<string, unknown>>(
    token,
    `/servers/${encodeURIComponent(serverId)}/channels/${encodeURIComponent(channelId)}/stage/request-speak`,
    { method: 'DELETE' },
  );
}

export async function postEchoVoiceModerate(
  token: string | null | undefined,
  serverId: string,
  body: {
    action: EchoVoiceModerateAction;
    targetUserId: string;
    targetChannelId?: string;
  },
): Promise<void> {
  await echoFetch<Record<string, unknown>>(
    token,
    `/servers/${encodeURIComponent(serverId)}/voice/moderate`,
    { method: 'POST', body: JSON.stringify(body) },
  );
}
