import { echoFetch } from './transport';
import type { EchoVcActivityKey } from '@shared/vcActivityCatalog';

export type EchoGameTokenResponse = {
  url: string;
  token: string;
  roomId: string;
  gameKey: EchoVcActivityKey;
};

export function parseEchoGameTokenResponse(
  data: unknown,
): EchoGameTokenResponse {
  if (!data || typeof data !== 'object') {
    throw new Error('Invalid game token response: expected object');
  }
  const o = data as Record<string, unknown>;
  const { url, token, roomId, gameKey } = o;
  if (
    typeof url !== 'string' ||
    typeof token !== 'string' ||
    typeof roomId !== 'string' ||
    typeof gameKey !== 'string'
  ) {
    throw new Error(
      'Invalid game token response: missing url, token, roomId, or gameKey',
    );
  }
  return { url, token, roomId, gameKey: gameKey as EchoVcActivityKey };
}

export async function postEchoVoiceGameToken(
  token: string,
  serverId: string,
  channelId: string,
  gameKey: EchoVcActivityKey,
): Promise<EchoGameTokenResponse> {
  const raw = await echoFetch<Record<string, unknown>>(
    token,
    `/servers/${encodeURIComponent(serverId)}/channels/${encodeURIComponent(channelId)}/voice/game-token`,
    {
      method: 'POST',
      body: JSON.stringify({ gameKey }),
    },
  );
  return parseEchoGameTokenResponse(raw);
}
