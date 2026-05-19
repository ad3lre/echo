/**
 * Normalize pathname parse results using workspace resolution before applying to shell.
 * Pure — no Vue.
 */

import type { EchoParsedPath } from './urlNavigation';
import {
  pickFallbackParsedPath,
  resolveGuildPath,
  type UrlNavigationResolveContext,
} from '@/services/orchestration/urlNavigationResolve';

export function normalizeBrowserPathParsed(
  pathParsed: EchoParsedPath,
  ctx: UrlNavigationResolveContext,
): { pathParsed: EchoParsedPath; adjusted: boolean } {
  if (pathParsed.kind === 'guild') {
    const want = resolveGuildPath(
      ctx,
      pathParsed.serverId,
      pathParsed.channelId,
    );
    if (
      want.kind !== 'guild' ||
      want.serverId !== pathParsed.serverId ||
      want.channelId !== pathParsed.channelId
    ) {
      return { pathParsed: want, adjusted: true };
    }
    return { pathParsed, adjusted: false };
  }
  if (pathParsed.kind === 'unknown') {
    return { pathParsed: pickFallbackParsedPath(ctx), adjusted: true };
  }
  return { pathParsed, adjusted: false };
}
