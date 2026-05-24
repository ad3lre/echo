/**
 * Invariants: MainSurface vs explicit send channelId.
 * Used in dev to catch UI/permission drift (wrong surface still calling send).
 */

import type { MainSurface, NavState } from './mainSurface';
import { assertNever, isDmThreadId } from './mainSurface';
import { resolveSendTarget } from './resolveSendTarget';
import type {
  OutgoingBlockAttempt,
  OutgoingContentType,
} from '@/composables/useChatPermissions';

export type SendSurfaceValidation =
  | { ok: true }
  | { ok: false; message: string };

/**
 * Full check: expected target from surface+nav must equal `channelId`.
 * Surfaces with no send target fail if any channelId is passed.
 */
export function validateSendChannelForSurface(
  surface: MainSurface,
  channelId: string,
  nav: NavState,
): SendSurfaceValidation {
  const expected = resolveSendTarget(surface, nav);
  if (expected.type === 'none') {
    return {
      ok: false,
      message: `Surface "${surface.type}" has no send target; refused channelId="${channelId}" (${expected.reason})`,
    };
  }
  if (expected.channelId !== channelId) {
    return {
      ok: false,
      message: `Send target mismatch for surface "${surface.type}": expected "${expected.channelId}", got "${channelId}"`,
    };
  }
  return { ok: true };
}

/**
 * Structural check only (surface payload vs id shape). Does not use nav except for serverEmptyOnboarding via full validate — use validateSendChannelForSurface for strict checks.
 */
export function isSendChannelShapeConsistentWithSurface(
  surface: MainSurface,
  channelId: string,
): boolean {
  switch (surface.type) {
    case 'explore':
    case 'dmFriends':
    case 'dmRequests':
    case 'dmMessagesIdle':
    case 'dmNotifications':
    case 'unknown':
      return false;
    case 'dmThread':
      return channelId === surface.threadId;
    case 'serverText':
    case 'serverVoice':
      return !isDmThreadId(channelId) && channelId === surface.channelId;
    case 'serverForum':
      return (
        !!surface.postChannelId &&
        !isDmThreadId(channelId) &&
        channelId === surface.postChannelId
      );
    case 'serverPaper':
      return false;
    case 'serverEmptyOnboarding':
      return !isDmThreadId(channelId);
    default:
      return assertNever(surface);
  }
}

/**
 * Gate wrapper: dev-time contract check, then delegated permission gate.
 */
export function getOutgoingBlockReasonForShellAttempt(
  getOutgoingBlockReason: (attempt: OutgoingBlockAttempt) => string | null,
  input: {
    surface: MainSurface;
    nav: NavState;
    channelId: string;
    contentTypes?: OutgoingContentType[];
  },
): string | null {
  if (import.meta.env.DEV) {
    void validateSendChannelForSurface(
      input.surface,
      input.channelId,
      input.nav,
    );
  }
  return getOutgoingBlockReason({
    channelId: input.channelId,
    contentTypes: input.contentTypes,
    context: { source: 'shell_executeSend' },
  });
}
