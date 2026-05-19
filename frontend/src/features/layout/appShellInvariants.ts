/**
 * Dev-time checks that navigation, MainSurface, and send target stay aligned (silent drift detector).
 */

import type { MainSurface, NavState } from './mainSurface';
import { resolveSendTarget } from './resolveSendTarget';

export type ShellInvariantIssue = { code: string; detail: string };

/**
 * Returns non-empty list when something is inconsistent; empty means OK for checked rules.
 */
export function collectShellInvariantIssues(input: {
  mainSurface: MainSurface;
  nav: NavState;
}): ShellInvariantIssue[] {
  const issues: ShellInvariantIssue[] = [];
  const { mainSurface: surface, nav } = input;
  const target = resolveSendTarget(surface, nav);

  if (target.type === 'channel' && target.channelId !== nav.activeChannelId) {
    issues.push({
      code: 'send_target_nav_mismatch',
      detail: `resolveSendTarget says "${target.channelId}" but nav.activeChannelId is "${nav.activeChannelId}"`,
    });
  }

  if (surface.type === 'dmThread' && nav.activeChannelId !== surface.threadId) {
    issues.push({
      code: 'dm_thread_nav_mismatch',
      detail: `MainSurface dmThread ${surface.threadId} vs activeChannelId ${nav.activeChannelId}`,
    });
  }

  if (
    (surface.type === 'serverText' || surface.type === 'serverVoice') &&
    nav.activeChannelId !== surface.channelId
  ) {
    issues.push({
      code: 'server_surface_nav_mismatch',
      detail: `MainSurface ${surface.type} channel ${surface.channelId} vs activeChannelId ${nav.activeChannelId}`,
    });
  }

  return issues;
}
