import { isDmThreadId } from '@/features/layout/mainSurface';

export type ServerChannelContextForMainSurface = {
  channel: { type: string; parentChannelId?: string };
} | null;

/**
 * Main chat surface channel kind for URL / layout (DM threads are not server channels).
 */
export function resolveServerChannelInfoForMainSurface(
  channelId: string,
  findChannelContextById: (id: string) => ServerChannelContextForMainSurface,
): { type: 'voice' | 'text' | 'forum'; parentChannelId?: string } | null {
  if (isDmThreadId(channelId)) return null;
  const ctx = findChannelContextById(channelId);
  if (!ctx?.channel) return null;
  const t = ctx.channel.type;
  if (t === 'voice') return { type: 'voice' };
  if (t === 'forum') return { type: 'forum' };
  return {
    type: 'text',
    ...(typeof ctx.channel.parentChannelId === 'string' &&
    ctx.channel.parentChannelId.trim()
      ? { parentChannelId: ctx.channel.parentChannelId.trim() }
      : {}),
  };
}

export function bindResolveServerChannelInfoForMainSurface(
  findChannelContextById: (id: string) => ServerChannelContextForMainSurface,
) {
  return (channelId: string) =>
    resolveServerChannelInfoForMainSurface(channelId, findChannelContextById);
}
