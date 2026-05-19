<script setup lang="ts">
import { computed, unref, toRef } from 'vue';
import type { Ref, ComputedRef } from 'vue';
import type { ChannelOption } from '@/composables/useChannelAutocomplete';
import { getChannelDisplayName } from '@/assets/icons';
import { useChannelIconResolver } from '@/composables/useChannelIconResolver';

const props = defineProps<{
  suggestions:
    | ChannelOption[]
    | Ref<ChannelOption[]>
    | ComputedRef<ChannelOption[]>;
  selectedIndex: number | Ref<number>;
  theme?: 'default' | 'forum';
  /** When set, custom-emoji / raster channel icons resolve like the sidebar. */
  serverId?: string;
}>();

const channelIconResolver = useChannelIconResolver(toRef(props, 'serverId'));

const emit = defineEmits<{
  select: [option: ChannelOption];
}>();

const suggestionList = computed(() =>
  Array.isArray(props.suggestions)
    ? props.suggestions
    : unref(props.suggestions),
);
const selectedIdx = computed(() =>
  typeof props.selectedIndex === 'number'
    ? props.selectedIndex
    : unref(props.selectedIndex),
);

function handleClick(option: ChannelOption) {
  emit('select', option);
}

function channelSecondaryText(option: {
  type?: 'text' | 'voice' | 'forum' | 'stage';
}): string {
  if (option.type === 'voice') return 'Voice channel';
  if (option.type === 'forum') return 'Forum channel';
  return 'Text channel';
}

function getOptionEmojiOrNull(option: {
  name: string;
  type?: 'text' | 'voice' | 'forum' | 'stage';
  iconKey?: string;
}): string | null {
  const v = channelIconResolver.getVisual(option);
  return v.kind === 'emoji' ? v.emoji : null;
}

function getOptionIconUrlOrFallback(option: {
  name: string;
  type?: 'text' | 'voice' | 'forum' | 'stage';
  iconKey?: string;
}): string {
  const v = channelIconResolver.getVisual(option);
  if (v.kind === 'svg' || v.kind === 'image') return v.url;
  return channelIconResolver.getIconUrl(option);
}

function optionIconUsesInvert(option: { iconKey?: string }): boolean {
  return channelIconResolver.usesSvgInvert(option.iconKey);
}
</script>

<template>
  <div
    class="channel-autocomplete-popover chat-liquid-glass-menu echo-autocomplete-menu relative min-w-[220px] py-1"
    role="listbox"
  >
    <button
      v-for="(option, i) in suggestionList"
      :key="option.id"
      type="button"
      role="option"
      :aria-selected="i === selectedIdx"
      class="channel-autocomplete-item echo-autocomplete-item chat-focus-ring flex w-full items-center gap-2 px-3 py-2 text-left text-sm rounded-md"
      :class="{ 'channel-autocomplete-item--selected': i === selectedIdx }"
      @mousedown.prevent
      @click="handleClick(option)"
    >
      <span
        class="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-elevated"
      >
        <img
          v-if="!getOptionEmojiOrNull(option)"
          :src="getOptionIconUrlOrFallback(option)"
          alt=""
          draggable="false"
          class="h-3.5 w-3.5 object-contain opacity-80"
          :class="{ 'filter invert': optionIconUsesInvert(option) }"
        />
        <span
          v-else
          class="h-3.5 w-3.5 flex items-center justify-center text-[13px] leading-none opacity-80"
          aria-hidden="true"
          >{{ getOptionEmojiOrNull(option) }}</span
        >
      </span>
      <span class="min-w-0 flex-1">
        <span class="truncate block text-foreground">{{
          getChannelDisplayName(option.name)
        }}</span>
        <span class="echo-autocomplete-item-secondary block truncate text-xs">{{
          channelSecondaryText(option)
        }}</span>
      </span>
    </button>
    <div
      v-if="suggestionList.length === 0"
      class="echo-autocomplete-empty px-3 py-2 text-sm"
      role="status"
      aria-live="polite"
    >
      No channels found
    </div>
  </div>
</template>

<style scoped>
.channel-autocomplete-item--selected {
  background: var(--menu-item-selected-bg);
}
</style>
