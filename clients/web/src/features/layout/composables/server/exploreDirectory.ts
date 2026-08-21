import { ECHO_DIRECTORY_EXCLUDED_SERVER_NAMES_SET } from '@shared/exploreDirectoryExcludedNames';

/** Shown in Explore when a server has no directory description set yet. */
export const EXPLORE_SERVER_FALLBACK_BLURB =
  'Public community on Echo — join to chat, use voice channels, and connect with members.';

/**
 * Direct Messages is a client shell concept, not a joinable guild. Also filters misconfigured
 * directory rows that reuse that name or the `echo` pseudo-id, plus shared fixture / internal names.
 */
export function isExcludedFromExploreDirectory(entry: {
  id?: string | null;
  name?: string | null;
}): boolean {
  const id = typeof entry.id === 'string' ? entry.id.trim().toLowerCase() : '';
  if (id === 'echo') return true;
  const n =
    typeof entry.name === 'string' ? entry.name.trim().toLowerCase() : '';
  return ECHO_DIRECTORY_EXCLUDED_SERVER_NAMES_SET.has(n);
}

export function exploreDirectoryBlurb(raw?: string | null): string {
  const t = typeof raw === 'string' ? raw.trim() : '';
  return t || EXPLORE_SERVER_FALLBACK_BLURB;
}
