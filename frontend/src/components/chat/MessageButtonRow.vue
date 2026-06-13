<script setup lang="ts">
import { computed } from 'vue';
import type { ButtonRowButton } from '@shared/buttonRow';
import {
  DISCORD_COMPONENT_TYPE,
  DISCORD_BUTTON_STYLE,
} from '@shared/discordMessageComponents';
import MessageDiscordComponents from './MessageDiscordComponents.vue';

const props = defineProps<{
  buttons: ButtonRowButton[];
}>();

const components = computed(() => [
  {
    type: DISCORD_COMPONENT_TYPE.ACTION_ROW,
    components: props.buttons.map((btn) => ({
      type: DISCORD_COMPONENT_TYPE.BUTTON,
      style: btn.style,
      label: btn.label,
      ...(btn.style === DISCORD_BUTTON_STYLE.LINK && btn.url
        ? { url: btn.url }
        : {}),
      ...(btn.style !== DISCORD_BUTTON_STYLE.LINK && btn.customId
        ? { custom_id: btn.customId }
        : {}),
      ...(btn.disabled ? { disabled: true } : {}),
      ...(btn.emoji ? { emoji: btn.emoji } : {}),
    })),
  },
]);
</script>

<template>
  <MessageDiscordComponents :components="components" class="my-2" />
</template>
