import {
  postEchoResolveEmojiTokens,
  type EchoEmojiTokenResolveApi,
} from '@/api/echo/emoji';

export type { EchoEmojiTokenResolveApi };

export async function resolveEmojiTokens(
  token: string,
  ids: string[],
): Promise<EchoEmojiTokenResolveApi[]> {
  const r = await postEchoResolveEmojiTokens(token, ids);
  return r.emojis ?? [];
}
