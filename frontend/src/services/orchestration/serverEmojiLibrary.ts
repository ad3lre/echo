import {
  fetchEchoServerEmojiLibrary,
  fetchEchoUserEmojiLibrary,
  postEchoEmojiUsage,
} from '@/api/echo/emoji';
import type {
  EchoEmojiLibraryEmojiApi,
  EchoEmojiLibraryPackApi,
} from '@/api/echo/types';

export type { EchoEmojiLibraryEmojiApi, EchoEmojiLibraryPackApi };

export async function fetchServerEmojiLibraryPacks(
  token: string,
  serverId: string,
): Promise<EchoEmojiLibraryPackApi[]> {
  const result = await fetchEchoServerEmojiLibrary(token, serverId);
  return result.packs ?? [];
}

export async function fetchUserEmojiLibraryPacks(
  token: string,
): Promise<EchoEmojiLibraryPackApi[]> {
  const result = await fetchEchoUserEmojiLibrary(token);
  return result.packs ?? [];
}

export async function recordServerEmojiUsage(
  token: string,
  serverId: string,
  emojiId: string,
): Promise<void> {
  await postEchoEmojiUsage(token, serverId, emojiId);
}
