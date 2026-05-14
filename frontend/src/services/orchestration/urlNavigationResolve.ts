/**
 * Workspace-aware resolution for Echo URL paths (guild validity, fallbacks).
 * Pure — no Vue.
 */

import type { EchoParsedPath } from '@/features/layout/urlNavigation';

export type UrlNavCategory = {
  name: string;
  channels: { id: string; type: string }[];
};

export type UrlNavigationResolveContext = {
  servers: { id: string; vanityCode?: string }[];
  categoriesByServer: Record<string, UrlNavCategory[]>;
  getFirstTextChannelId: (cats: UrlNavCategory[]) => string;
};

export function channelValidInServer(
  ctx: UrlNavigationResolveContext,
  serverId: string,
  channelId: string,
): boolean {
  const cats = ctx.categoriesByServer[serverId] ?? [];
  for (const c of cats) {
    const ch = c.channels?.find((x) => x.id === channelId);
    if (ch && (ch.type === 'text' || ch.type === 'voice')) return true;
  }
  return false;
}

export function pickFallbackParsedPath(
  ctx: UrlNavigationResolveContext,
): EchoParsedPath {
  const firstReal = ctx.servers.find((s) => s.id !== 'echo');
  if (firstReal) {
    const cats = ctx.categoriesByServer[firstReal.id] ?? [];
    const ch = ctx.getFirstTextChannelId(cats);
    if (ch) return { kind: 'guild', serverId: firstReal.id, channelId: ch };
  }
  return { kind: 'explore' };
}

/** Map URL segment (numeric/snowflake id or vanity slug) to canonical server id. */
export function resolveGuildServerIdFromPathSegment(
  ctx: UrlNavigationResolveContext,
  segment: string,
): string {
  const slug = segment.trim();
  if (!slug) return segment;
  if (ctx.servers.some((s) => s.id === slug)) return slug;
  const lower = slug.toLowerCase();
  const byVanity = ctx.servers.find(
    (s) => (s.vanityCode ?? '').trim().toLowerCase() === lower,
  );
  return byVanity?.id ?? slug;
}

export function resolveGuildPath(
  ctx: UrlNavigationResolveContext,
  serverId: string,
  channelId: string,
): EchoParsedPath {
  const resolvedServerId = resolveGuildServerIdFromPathSegment(ctx, serverId);
  const exists = ctx.servers.some((s) => s.id === resolvedServerId);
  if (!exists || resolvedServerId === 'echo')
    return pickFallbackParsedPath(ctx);

  const effectiveChannelId = channelId.trim();
  if (
    effectiveChannelId &&
    channelValidInServer(ctx, resolvedServerId, effectiveChannelId)
  ) {
    return {
      kind: 'guild',
      serverId: resolvedServerId,
      channelId: effectiveChannelId,
    };
  }
  const cats = ctx.categoriesByServer[resolvedServerId] ?? [];
  const ch = ctx.getFirstTextChannelId(cats);
  if (ch) return { kind: 'guild', serverId: resolvedServerId, channelId: ch };
  return pickFallbackParsedPath(ctx);
}
