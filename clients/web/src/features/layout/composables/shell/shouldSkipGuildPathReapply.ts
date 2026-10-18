import { isDmThreadId } from '@/features/layout/mainSurface';

/**
 * When the browser URL is still a guild deep-link but the user has switched into
 * a DM (or `/dm/open` is in flight), do not re-apply the guild path from the URL.
 * That reapply is what bounces users back to the server after a late hydrate /
 * channel-tree settle while `selectedServerId` briefly matches the guild again.
 */
export function shouldSkipGuildPathReapply(input: {
  selectedDMUserId: string | null | undefined;
  activeChannelId: string;
  selectedServerId: string | null | undefined;
  echoDmThreadIds: ReadonlySet<string>;
}): boolean {
  if (input.selectedDMUserId?.trim()) return true;
  if (input.selectedServerId === 'echo') return true;
  const cid = input.activeChannelId.trim();
  if (!cid) return false;
  if (isDmThreadId(cid)) return true;
  if (input.echoDmThreadIds.has(cid)) return true;
  return false;
}
