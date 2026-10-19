<script setup lang="ts">
import { echoT } from '@/i18n';
import { computed } from 'vue';
import type {
  DiscordActionRow,
  DiscordComponentEmoji,
  DiscordMessageButton,
  DiscordParsedMessageComponents,
} from '@shared/discordMessageComponents';
import {
  DISCORD_BUTTON_STYLE,
  parseDiscordMessageComponents,
} from '@shared/discordMessageComponents';
import { renderDiscordEmbedMarkdownHtml } from '@/features/chat/markdown/discordEmbedMarkdown';
import { renderSingleEmojiHtml } from '@/features/chat/emoji/customEmojiDisplay';
import { openExternal } from '@/platform/desktopBridge';
import { dispatchAppToast } from '@/features/layout/failures/controllerMissingAction';

const props = defineProps<{
  components: unknown;
  messageFlags?: number;
}>();

const parsed = computed<DiscordParsedMessageComponents | null>(() =>
  parseDiscordMessageComponents(props.components, props.messageFlags),
);

function buttonClass(style: DiscordMessageButton['style']): string {
  switch (style) {
    case DISCORD_BUTTON_STYLE.PRIMARY:
      return 'discord-msg-btn discord-msg-btn--primary';
    case DISCORD_BUTTON_STYLE.SUCCESS:
      return 'discord-msg-btn discord-msg-btn--success';
    case DISCORD_BUTTON_STYLE.DANGER:
      return 'discord-msg-btn discord-msg-btn--danger';
    case DISCORD_BUTTON_STYLE.LINK:
      return 'discord-msg-btn discord-msg-btn--link';
    default:
      return 'discord-msg-btn discord-msg-btn--secondary';
  }
}

function emojiHtml(emoji: DiscordComponentEmoji | undefined): string {
  if (!emoji) return '';
  if (emoji.id) {
    const token = emoji.animated
      ? `<a:${emoji.name ?? 'emoji'}:${emoji.id}>`
      : `<:${emoji.name ?? 'emoji'}:${emoji.id}>`;
    return renderSingleEmojiHtml(token, { allowDiscordCdnGuess: true });
  }
  if (emoji.name) return renderSingleEmojiHtml(emoji.name);
  return '';
}

function renderTextBlock(text: string): string {
  if (text === '---') {
    return '<hr class="discord-components__hr" />';
  }
  return renderDiscordEmbedMarkdownHtml(text);
}

async function onButtonClick(btn: DiscordMessageButton) {
  if (btn.disabled) return;
  if (btn.style === DISCORD_BUTTON_STYLE.LINK && btn.url) {
    await openExternal(btn.url);
    return;
  }
  dispatchAppToast(
    btn.customId
      ? echoT('chatB.discordComponents.displayOnlyNamed', {
          label: btn.label || btn.customId,
          id: btn.customId,
        })
      : echoT('chatB.discordComponents.displayOnly'),
    'info',
  );
}

function rowKey(row: DiscordActionRow, index: number): string {
  return `${index}-${row.buttons.map((b) => b.customId ?? b.url ?? b.label).join('|')}`;
}
</script>

<template>
  <div
    v-if="parsed"
    class="discord-components mt-2 max-w-xl"
    data-testid="message-discord-components"
    v-spoiler-reveal
  >
    <div
      v-for="(block, bi) in parsed.textBlocks"
      :key="`text-${bi}`"
      class="discord-components__text discord-embed-md mb-2 break-words text-sm leading-snug text-fg-soft"
      v-html="renderTextBlock(block)"
    />

    <div
      v-for="(row, ri) in parsed.actionRows"
      :key="rowKey(row, ri)"
      class="discord-components__row flex flex-wrap gap-2"
      :class="{ 'mt-2': ri > 0 || parsed.textBlocks.length > 0 }"
    >
      <button
        v-for="(btn, bi) in row.buttons"
        :key="`${ri}-${bi}-${btn.customId ?? btn.url ?? btn.label}`"
        type="button"
        class="discord-components__button inline-flex min-h-[38px] max-w-full items-center justify-center gap-1.5 rounded-[3px] px-4 py-1.5 text-sm font-medium leading-tight transition-colors disabled:cursor-not-allowed disabled:opacity-50"
        :class="buttonClass(btn.style)"
        :disabled="btn.disabled"
        :title="
          btn.style === DISCORD_BUTTON_STYLE.LINK && btn.url
            ? btn.url
            : btn.customId
              ? `custom_id: ${btn.customId}`
              : undefined
        "
        @click="onButtonClick(btn)"
      >
        <span
          v-if="btn.emoji"
          class="discord-components__emoji inline-flex shrink-0 items-center [&_.emoji]:h-[1.1em] [&_.emoji]:w-[1.1em]"
          v-html="emojiHtml(btn.emoji)"
        />
        <span v-if="btn.label" class="truncate">{{ btn.label }}</span>
        <svg
          v-if="btn.style === DISCORD_BUTTON_STYLE.LINK"
          class="h-3.5 w-3.5 shrink-0 opacity-80"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          aria-hidden="true"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
          />
        </svg>
      </button>
    </div>
  </div>
</template>

<style scoped src="./styles/MessageDiscordComponents.scss"></style>
