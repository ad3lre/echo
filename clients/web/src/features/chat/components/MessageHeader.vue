<script setup lang="ts">
import { echoT } from '@/i18n';
import { computed } from 'vue';
import type { MessageWithAuthor } from '@shared/types';
import { getChannelIcon, getChannelDisplayName, icons } from '@/assets/icons';
import { formatTimestamp } from '@/features/chat/formatTimestamp';
import DiscordSyncedMessageBadge from '@/features/chat/components/DiscordSyncedMessageBadge.vue';
import MessageSendPendingDots from '@/features/chat/components/MessageSendPendingDots.vue';

const props = withDefaults(
  defineProps<{
    message: MessageWithAuthor & { channelName?: string };
    /** Guild: server nickname when set; falls back to `message.author.name`. */
    authorLabel?: string;
    authorRoleColor?: string;
    /** Muted name (no role color) when author presence is offline. */
    authorOffline?: boolean;
    /** When false, inline time is hidden (continuation rows use gutter time instead). */
    showTimestamp?: boolean;
    isPinned?: boolean;
    saveFeedback?: boolean;
    sendPending?: boolean;
    channelId?: string;
  }>(),
  { authorOffline: false, showTimestamp: true, sendPending: false },
);

const timestampLabel = computed(() => formatTimestamp(props.message.timestamp));

defineEmits<{
  openProfile: [event: MouseEvent];
}>();
</script>

<template>
  <div class="msg-header-row flex flex-wrap items-baseline gap-2">
    <button
      type="button"
      class="author-name-trigger font-semibold"
      data-dev-hit="author"
      :data-echo-hint="echoT('b42.header.openProfile')"
      :class="props.authorOffline ? 'text-fg-subtle' : ''"
      :style="
        props.authorOffline ? {} : { color: authorRoleColor || undefined }
      "
      @click="$emit('openProfile', $event)"
    >
      {{ authorLabel ?? message.author.name }}
    </button>
    <DiscordSyncedMessageBadge v-if="message.bridgeFromDiscord" />
    <span
      v-if="showTimestamp"
      class="text-[10px] tabular-nums leading-tight text-muted whitespace-nowrap shrink-0"
      :data-echo-hint="echoT('b42.header.sent', { time: timestampLabel })"
    >
      {{ timestampLabel }}
    </span>
    <MessageSendPendingDots v-if="sendPending" />
    <span
      v-if="message.editedAt || saveFeedback"
      class="text-xs italic transition-opacity"
      :class="saveFeedback ? 'text-emerald-400' : 'text-muted'"
      :title="
        saveFeedback ? echoT('b42.header.saved') : echoT('b42.header.edited')
      "
      :data-echo-hint="
        saveFeedback
          ? echoT('b42.header.messageSaved')
          : echoT('b42.header.messageEdited')
      "
    >
      {{
        saveFeedback ? echoT('b42.header.saved') : echoT('b42.header.editedTag')
      }}
    </span>
    <span
      v-if="isPinned"
      class="inline-flex items-center gap-1 text-xs text-amber-400/90"
      :title="echoT('b42.header.pinned')"
      :data-echo-hint="echoT('b42.header.pinnedMessage')"
    >
      <img
        :src="icons.thumbtack"
        alt=""
        class="w-3.5 h-3.5 shrink-0 filter invert"
      />
      {{ echoT('b42.header.pinned') }}
    </span>
    <span
      v-if="message.channelName"
      class="inline-flex items-center gap-1.5 text-xs text-muted bg-glass-1 px-1.5 py-0.5 rounded"
      :data-dev-hit="channelId ? 'channel' : undefined"
      :data-echo-hint="
        echoT('b42.header.postedIn', {
          name: getChannelDisplayName(message.channelName),
        })
      "
    >
      <img
        :src="getChannelIcon({ name: message.channelName, type: 'text' })"
        alt=""
        class="h-3 w-3 flex-shrink-0 filter invert opacity-60"
      />
      <span>{{ getChannelDisplayName(message.channelName) }}</span>
    </span>
  </div>
</template>
