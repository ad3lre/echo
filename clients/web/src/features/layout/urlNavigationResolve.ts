/**
 * Workspace-aware resolution for Echo URL paths (guild validity, fallbacks).
 * Pure — no Vue.
 */

import type { EchoParsedPath } from '@/features/layout/urlNavigation';
import { isEchoGraphId } from '@/features/layout/ids/echoIds';

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
    if (
      ch &&
      (ch.type === 'text' || ch.type === 'voice' || ch.type === 'stage')
    )
      return true;
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
  opts?: { preserveUnresolved?: boolean },
): EchoParsedPath {
  const resolvedServerId = resolveGuildServerIdFromPathSegment(ctx, serverId);
  const exists = ctx.servers.some((s) => s.id === resolvedServerId);
  if (!exists || resolvedServerId === 'echo') {
    if (opts?.preserveUnresolved) {
      return { kind: 'guild', serverId, channelId };
    }
    return pickFallbackParsedPath(ctx);
  }

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
  /**
   * Deep links / History API can run before the channel tree is present locally (hydrate race,
   * cache miss, or `popstate`). Treat Echo graph channel ids like the shell's immediate switch:
   * keep the URL on the guild instead of falling through to Explore.
   */
  if (effectiveChannelId && isEchoGraphId(effectiveChannelId)) {
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
