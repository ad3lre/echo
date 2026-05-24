/**
 * Single bridge: given the shell's MainSurface (and nav for edge cases), what channel id is the send target?
 * Do not duplicate rail/tab rules here — MainSurface is already authoritative for UI mode.
 */

import type { MainSurface, NavState } from './mainSurface';
import { assertNever, isDmThreadId } from './mainSurface';

export type SendTarget =
  | { type: 'none'; reason: string }
  | { type: 'channel'; channelId: string };

export function resolveSendTarget(
  surface: MainSurface,
  nav: NavState,
): SendTarget {
  switch (surface.type) {
    case 'explore':
      return { type: 'none', reason: 'explore' };
    case 'dmFriends':
    case 'dmRequests':
    case 'dmMessagesIdle':
    case 'dmNotifications':
      return { type: 'none', reason: surface.type };
    case 'dmThread':
      return { type: 'channel', channelId: surface.threadId };
    case 'serverText':
      return { type: 'channel', channelId: surface.channelId };
    case 'serverVoice':
      return { type: 'channel', channelId: surface.channelId };
    case 'serverForum':
      return surface.postChannelId
        ? { type: 'channel', channelId: surface.postChannelId }
        : { type: 'none', reason: 'serverForum_no_post_selected' };
    case 'serverPaper':
      return { type: 'none', reason: 'serverPaper' };
    case 'serverEmptyOnboarding':
      if (isDmThreadId(nav.activeChannelId)) {
        return {
          type: 'none',
          reason: 'serverEmptyOnboarding_unexpected_dm_id',
        };
      }
      return { type: 'channel', channelId: nav.activeChannelId };
    case 'unknown':
      return { type: 'none', reason: 'unknown' };
    default:
      return assertNever(surface);
  }
}

/** Resolved channel id for send, or null when the surface does not define sending. */
export function resolvedSendChannelId(
  surface: MainSurface,
  nav: NavState,
): string | null {
  const t = resolveSendTarget(surface, nav);
  return t.type === 'channel' ? t.channelId : null;
}
