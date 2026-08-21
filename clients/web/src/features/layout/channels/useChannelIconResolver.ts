import { computed, type Ref } from 'vue';
import { useServerEmojiLibrary } from '@/features/chat/emoji/useServerEmojiLibrary';
import { useUserEmojiLibrary } from '@/features/chat/emoji/useUserEmojiLibrary';
import {
  useGlobalEmojiTokenResolver,
  isEchoEmojiTokenResolveMiss,
} from '@/features/chat/emoji/useGlobalEmojiTokenResolver';
import {
  getChannelIcon,
  getChannelIconVisual,
  type ChannelIconVisual,
} from '@/assets/icons';
import type { EchoChannelType } from '@shared/types';
import {
  type ChannelIconEmojiUrlLookup,
  resolveChannelIconRasterUrl,
  channelIconKeyUsesSvgInvertFilter,
} from '@/features/layout/channels/channelIconKeys';
import {
  fallbackDiscordCdnCustomEmojiImageUrl,
  safeCustomEmojiUrl,
  shouldAllowDiscordCdnGuessForEmojiId,
} from '@/features/chat/emoji/customEmojiUrl';

type ChannelLike = {
  name: string;
  type?: EchoChannelType;
  iconKey?: string;
};

export function useChannelIconResolver(
  serverId: Ref<string | null | undefined>,
) {
  const library = useServerEmojiLibrary(serverId);
  const userEmojiLibrary = useUserEmojiLibrary();
  const globalEmoji = useGlobalEmojiTokenResolver();

  const lookupCustomEmojiUrl: ChannelIconEmojiUrlLookup = (emojiId) => {
    const id = emojiId.trim();
    if (!id) return null;
    const fromPack = library.emojiById.value.get(id);
    const packUrl = fromPack?.imageUrl?.trim();
    if (packUrl) {
      const safe = safeCustomEmojiUrl(packUrl);
      if (safe) return safe;
    }
    const userRow = userEmojiLibrary.emojiById.value.get(id);
    const userUrl = userRow?.imageUrl?.trim();
    if (userUrl) {
      const safe = safeCustomEmojiUrl(userUrl);
      if (safe) return safe;
    }
    const cached = globalEmoji.urlById.value.get(id)?.trim();
    if (cached) {
      const safe = safeCustomEmojiUrl(cached);
      if (safe) return safe;
    }
    const echoMissed = isEchoEmojiTokenResolveMiss(id);
    if (
      shouldAllowDiscordCdnGuessForEmojiId(
        id,
        globalEmoji.urlById.value,
        echoMissed,
      )
    ) {
      const cdn = fallbackDiscordCdnCustomEmojiImageUrl(id, false);
      if (cdn) return cdn;
    }
    globalEmoji.ensureEmojiId(id);
    return null;
  };

  const resolverRevision = computed(
    () =>
      library.packs.value.length +
      library.emojiById.value.size +
      userEmojiLibrary.emojiById.value.size +
      globalEmoji.cacheVersion.value,
  );

  function getVisual(
    channel: ChannelLike | null | undefined,
  ): ChannelIconVisual {
    void resolverRevision.value;
    return getChannelIconVisual(channel, lookupCustomEmojiUrl);
  }

  function getIconUrl(channel: ChannelLike | null | undefined): string {
    void resolverRevision.value;
    return getChannelIcon(channel, lookupCustomEmojiUrl);
  }

  function getRasterUrl(iconKey: string | undefined | null): string | null {
    void resolverRevision.value;
    return resolveChannelIconRasterUrl(iconKey, lookupCustomEmojiUrl);
  }

  function usesSvgInvert(
    channelOrIconKey: ChannelLike | string | null | undefined,
  ): boolean {
    if (
      channelOrIconKey &&
      typeof channelOrIconKey === 'object' &&
      'name' in channelOrIconKey
    ) {
      return getVisual(channelOrIconKey).kind === 'svg';
    }
    return channelIconKeyUsesSvgInvertFilter(
      typeof channelOrIconKey === 'string' ? channelOrIconKey : null,
    );
  }

  return {
    getVisual,
    getIconUrl,
    getRasterUrl,
    usesSvgInvert,
    lookupCustomEmojiUrl,
    resolverRevision,
  };
}
