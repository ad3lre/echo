import { echoFetch } from './transport';
import type {
  EchoEmojiLibraryPackApi,
  EchoEmojiMarketPackApi,
  EchoEmojiPackMarketSettingsApi,
} from './types';
import { normalizeEchoEmojiMarketPacksPayload } from '@/services/domain/echoEmojiMarketPacksFromHttp';

/** Emoji pack market catalog (Echo API; not `/api/v1/mock`). */
export async function fetchEchoEmojiMarketPacks(opts?: {
  q?: string;
}): Promise<{ packs: EchoEmojiMarketPackApi[] }> {
  const q = new URLSearchParams();
  if (opts?.q?.trim()) q.set('q', opts.q.trim());
  const qs = q.toString();
  const data = await echoFetch<Record<string, unknown>>(
    null,
    `/emoji-market/packs${qs ? `?${qs}` : ''}`,
  );
  return normalizeEchoEmojiMarketPacksPayload(data);
}

export async function fetchEchoEmojiMarketPackById(
  packId: string,
): Promise<{ pack: EchoEmojiMarketPackApi }> {
  const id = packId.trim();
  const data = await echoFetch<Record<string, unknown>>(
    null,
    `/emoji-market/packs/${encodeURIComponent(id)}`,
  );
  const packRaw = data.pack;
  if (!packRaw || typeof packRaw !== 'object' || Array.isArray(packRaw)) {
    throw new Error('Invalid emoji market pack response');
  }
  const normalized = normalizeEchoEmojiMarketPacksPayload({
    packs: [packRaw],
  });
  const pack = normalized.packs[0];
  if (!pack) throw new Error('Emoji pack not found');
  return { pack };
}

export const ECHO_EMOJI_PACK_DESCRIPTION_MIN_LEN = 10;

export async function fetchEchoServerEmojiLibrary(
  token: string,
  serverId: string,
): Promise<{ packs: EchoEmojiLibraryPackApi[] }> {
  return echoFetch(
    token,
    `/servers/${encodeURIComponent(serverId)}/emoji-library`,
  );
}

export async function fetchEchoUserEmojiLibrary(
  token: string,
): Promise<{ packs: EchoEmojiLibraryPackApi[] }> {
  return echoFetch(token, '/users/me/emoji-library');
}

export type EchoEmojiTokenResolveApi = {
  key: string;
  id: string;
  name: string;
  animated: boolean;
  imageUrl: string;
  assetUrl?: string;
  sourceDiscordEmojiId?: string;
};

export async function postEchoResolveEmojiTokens(
  token: string,
  ids: string[],
): Promise<{ emojis: EchoEmojiTokenResolveApi[] }> {
  return echoFetch(token, '/emoji/resolve', {
    method: 'POST',
    body: JSON.stringify({ ids }),
  });
}

export async function postEchoImportMarketEmojiPack(
  token: string,
  serverId: string,
  marketPackId: string,
): Promise<void> {
  await echoFetch<Record<string, unknown>>(
    token,
    `/servers/${encodeURIComponent(serverId)}/emoji-packs/import-market`,
    { method: 'POST', body: JSON.stringify({ marketPackId }) },
  );
}

export async function postEchoCreateCustomEmojiPack(
  token: string,
  serverId: string,
  body: {
    name: string;
    description: string;
    marketSettings?: EchoEmojiPackMarketSettingsApi;
    listedInMarket?: boolean;
  },
): Promise<{ packId: string }> {
  return echoFetch(
    token,
    `/servers/${encodeURIComponent(serverId)}/emoji-packs/custom`,
    {
      method: 'POST',
      body: JSON.stringify(body),
    },
  );
}

export async function patchEchoEmojiPackMeta(
  token: string,
  serverId: string,
  packId: string,
  body: {
    name?: string;
    description?: string;
    listedInMarket?: boolean;
    marketSettings?: EchoEmojiPackMarketSettingsApi;
  },
): Promise<void> {
  await echoFetch<Record<string, unknown>>(
    token,
    `/servers/${encodeURIComponent(serverId)}/emoji-packs/${encodeURIComponent(packId)}`,
    { method: 'PATCH', body: JSON.stringify(body) },
  );
}

export async function postEchoServerCustomEmoji(
  token: string,
  serverId: string,
  packId: string,
  body: {
    name: string;
    animated: boolean;
    imageUrl: string;
    expressionKind?: 'emoji' | 'sticker';
    stickerFormat?: string;
  },
): Promise<{ id: string }> {
  return echoFetch(
    token,
    `/servers/${encodeURIComponent(serverId)}/emoji-packs/${encodeURIComponent(packId)}/emojis`,
    {
      method: 'POST',
      body: JSON.stringify(body),
    },
  );
}

export async function deleteEchoServerCustomEmoji(
  token: string,
  serverId: string,
  packId: string,
  emojiId: string,
): Promise<void> {
  await echoFetch<Record<string, unknown>>(
    token,
    `/servers/${encodeURIComponent(serverId)}/emoji-packs/${encodeURIComponent(packId)}/emojis/${encodeURIComponent(emojiId)}`,
    { method: 'DELETE' },
  );
}

export async function patchEchoServerCustomEmojiName(
  token: string,
  serverId: string,
  packId: string,
  emojiId: string,
  name: string,
): Promise<void> {
  await echoFetch<Record<string, unknown>>(
    token,
    `/servers/${encodeURIComponent(serverId)}/emoji-packs/${encodeURIComponent(packId)}/emojis/${encodeURIComponent(emojiId)}`,
    { method: 'PATCH', body: JSON.stringify({ name }) },
  );
}

export async function postEchoEmojiUsage(
  token: string,
  serverId: string,
  emojiId: string,
): Promise<void> {
  await echoFetch<Record<string, unknown>>(
    token,
    `/servers/${encodeURIComponent(serverId)}/emoji-usage`,
    { method: 'POST', body: JSON.stringify({ emojiId }) },
  );
}
