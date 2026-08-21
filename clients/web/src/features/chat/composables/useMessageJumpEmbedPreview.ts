import { ref, watch, type MaybeRefOrGetter, toValue } from 'vue';
import type { Embed } from '@shared/types';
import {
  echoJumpErrorMessage,
  isEchoJumpEmbedResolved,
  type EchoJumpEmbedErrorCode,
} from '@shared/echoJumpEmbedErrors';
import { fetchEchoChannelMessage } from '@/api/echo/messages';
import { EchoApiError } from '@/api/echo/transport';
import { useAuthSessionStore } from '@/features/auth/authSession';

function truncatePlain(text: string, max: number): string {
  const t = text.replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

function classifyJumpFetchError(err: unknown): EchoJumpEmbedErrorCode {
  if (err instanceof EchoApiError) {
    if (err.status === 404) return 'not_found';
    if (err.status === 401 || err.status === 403) return 'forbidden';
    if (err.status >= 500) return 'network_error';
  }
  return 'network_error';
}

/**
 * Enriches stub message-jump embeds (client-detected URL before `message:embeds`) via GET message.
 */
export function useMessageJumpEmbedPreview(
  embed: MaybeRefOrGetter<Embed | undefined>,
) {
  const auth = useAuthSessionStore();
  const displayEmbed = ref<Embed | undefined>(toValue(embed));
  const loading = ref(false);
  const resolveError = ref<EchoJumpEmbedErrorCode | null>(null);
  let requestSeq = 0;

  watch(
    () => toValue(embed),
    (next) => {
      const seq = ++requestSeq;
      resolveError.value = next?.echoJumpError ?? null;
      displayEmbed.value = next;
      const j = next?.echoJump;
      const token = auth.accessToken?.trim();
      if (!next || !j || !token || isEchoJumpEmbedResolved(next)) {
        loading.value = false;
        return;
      }
      loading.value = true;
      void (async () => {
        try {
          const { message } = await fetchEchoChannelMessage(
            token,
            j.channelId,
            j.messageId,
          );
          if (seq !== requestSeq) return;
          const authorName = message.authorDisplayName?.trim() || 'Unknown';
          const desc = message.content?.trim()
            ? truncatePlain(message.content, 200)
            : '—';
          resolveError.value = null;
          displayEmbed.value = {
            ...next,
            url: next.url ?? message.id,
            provider: next.provider ?? 'Echo',
            title:
              next.title && next.title !== '#channel' ? next.title : '#message',
            description: desc,
            author: { name: authorName },
            timestamp: message.timestamp ?? next.timestamp,
            color: next.color ?? 0x5865f2,
            echoJump: { channelId: j.channelId, messageId: j.messageId },
            echoJumpError: undefined,
          };
        } catch (err) {
          if (seq !== requestSeq) return;
          const code = classifyJumpFetchError(err);
          resolveError.value = code;
          displayEmbed.value = {
            ...next,
            provider: next.provider ?? 'Echo',
            title:
              next.title && next.title !== '#channel'
                ? next.title
                : 'Message link',
            description: echoJumpErrorMessage(code),
            color: 0xed4245,
            echoJump: { channelId: j.channelId, messageId: j.messageId },
            echoJumpError: code,
          };
        } finally {
          if (seq === requestSeq) loading.value = false;
        }
      })();
    },
    { immediate: true, deep: true },
  );

  return { displayEmbed, loading, resolveError };
}
