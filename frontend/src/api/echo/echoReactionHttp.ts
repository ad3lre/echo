import {
  echoFetch,
  EchoApiError,
  trimEchoPathSegment,
} from '@/api/echo/transport';
import type { MessageReaction } from '@shared/types';
import { failResult, type ActionResult } from '@/types/actionResult';

function parseReactionsPayload(data: unknown): MessageReaction[] {
  const o =
    data && typeof data === 'object' && !Array.isArray(data)
      ? (data as Record<string, unknown>)
      : {};
  const r = o.reactions;
  if (!Array.isArray(r)) return [];
  return r as MessageReaction[];
}

/**
 * Persist a reaction add/remove via Echo REST (parity with socket toggle).
 * Used when Socket.IO is disconnected so reactions still work over HTTP + cookies.
 */
export async function echoHttpToggleReaction(opts: {
  token: string | null | undefined;
  channelId: string;
  messageId: string;
  emoji: string;
  /** True = remove caller’s reaction; false = add. */
  removing: boolean;
}): Promise<ActionResult & { reactions?: MessageReaction[] }> {
  const { channelId, messageId, emoji, removing, token } = opts;
  const ch = trimEchoPathSegment(channelId);
  const mid = trimEchoPathSegment(messageId);
  const path = `/channels/${encodeURIComponent(ch)}/messages/${encodeURIComponent(mid)}/reactions`;
  try {
    const raw = await echoFetch<unknown>(
      token,
      path,
      removing
        ? {
            method: 'DELETE',
            body: JSON.stringify({ emoji }),
          }
        : {
            method: 'PUT',
            body: JSON.stringify({ emoji }),
          },
    );
    const reactions = parseReactionsPayload(raw);
    return { ok: true, reactions };
  } catch (e) {
    if (e instanceof EchoApiError) {
      const retryable = e.status >= 500;
      if (e.status === 401) {
        return failResult(
          'UNAUTHENTICATED',
          e.message || 'Sign in again to react.',
          false,
        );
      }
      if (e.status === 403) {
        return failResult(
          'FORBIDDEN',
          e.message || 'You cannot react in this channel.',
          false,
        );
      }
      if (e.status === 404) {
        return failResult(
          'NOT_FOUND',
          e.message || 'Message not found.',
          false,
        );
      }
      return failResult('HTTP_ERROR', e.message, retryable);
    }
    return failResult(
      'UNKNOWN',
      'Could not sync your reaction. Try again.',
      true,
    );
  }
}
