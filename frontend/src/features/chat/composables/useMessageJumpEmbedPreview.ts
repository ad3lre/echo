import { ref, watch, type MaybeRefOrGetter, toValue } from 'vue';
import type { Embed } from '@shared/types';
import { fetchEchoChannelMessage } from '@/api/echo/messages';
import { useAuthSessionStore } from '@/stores/authSession';

function truncatePlain(text: string, max: number): string {
  const t = text.replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

function isResolvedJumpEmbed(embed: Embed): boolean {
  return Boolean(embed.description?.trim());
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
  const resolveFailed = ref(false);
  let requestSeq = 0;

  watch(
    () => toValue(embed),
    (next) => {
      const seq = ++requestSeq;
      resolveFailed.value = false;
      displayEmbed.value = next;
      const j = next?.echoJump;
      const token = auth.accessToken?.trim();
      if (!next || !j || !token || isResolvedJumpEmbed(next)) {
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
          displayEmbed.value = {
            ...next,
            url: next.url ?? message.id,
            provider: next.provider ?? 'Echo',
            title:
              next.title && next.title !== '#channel' ? next.title : '#message',
            description: desc,
            author: { name: authorName },
            timestamp: message.timestamp ?? next.timestamp,
            echoJump: { channelId: j.channelId, messageId: j.messageId },
          };
        } catch {
          if (seq !== requestSeq) return;
          resolveFailed.value = true;
        } finally {
          if (seq === requestSeq) loading.value = false;
        }
      })();
    },
    { immediate: true, deep: true },
  );

  return { displayEmbed, loading, resolveFailed };
}
