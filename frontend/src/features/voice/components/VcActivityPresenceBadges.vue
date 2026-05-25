<script setup lang="ts">
import { iconYoutubeSvgPath, icons } from '@/assets/icons';
import type { VcActivityPresenceKind } from '@/features/voice/vcActivityTypes';

withDefaults(
  defineProps<{
    kinds: VcActivityPresenceKind[];
    /** `sm` = channel list; `md` = CallView tiles */
    size?: 'sm' | 'md';
  }>(),
  { size: 'sm' },
);

function titleFor(k: VcActivityPresenceKind): string {
  switch (k) {
    case 'youtube':
      return 'In YouTube activity';
    case 'wordle':
      return 'In Wordline activity';
    case 'hangman':
      return 'In Hangman activity';
    case 'openguessr':
      return 'In OpenGuessr activity';
    case 'skribbl_io':
      return 'In skribbl.io activity';
    case 'gartic_phone':
      return 'In Gartic Phone activity';
    case 'krunker':
      return 'In Krunker activity';
    case 'codenames':
      return 'In Echoed Names activity';
    case 'richup':
      return 'In Richup.io activity';
    case 'goober_dash':
      return 'In Goober Dash activity';
    case 'smash_karts':
      return 'In Smash Karts activity';
    case 'cluster_rush':
      return 'In Cluster Rush activity';
    case 'activities':
      return 'Browsing activities';
    default:
      return '';
  }
}
</script>

<template>
  <div
    v-if="kinds.length"
    class="vc-act-pres-badges inline-flex items-center"
    :class="size === 'md' ? 'gap-0.5' : 'gap-px'"
    aria-label="Voice activity"
  >
    <span
      v-for="k in kinds"
      :key="k"
      class="vc-act-pres-badges__chip inline-flex items-center justify-center rounded-md border border-border bg-elevated"
      :class="
        size === 'md' ? 'h-6 w-6 min-h-6 min-w-6' : 'h-4 w-4 min-h-4 min-w-4'
      "
      :title="titleFor(k)"
    >
      <svg
        v-if="k === 'youtube'"
        class="text-[#ff0000]"
        :class="size === 'md' ? 'h-3.5 w-3.5' : 'h-2.5 w-2.5'"
        viewBox="0 0 24 24"
        fill="currentColor"
        aria-hidden="true"
      >
        <path :d="iconYoutubeSvgPath" />
      </svg>
      <span
        v-else-if="k === 'wordle'"
        class="font-bold leading-none text-[#538d4e]"
        :class="size === 'md' ? 'text-[9px]' : 'text-[8px]'"
        aria-hidden="true"
        >WL</span
      >
      <img
        v-else-if="k === 'hangman'"
        :src="icons.puzzle"
        alt=""
        class="opacity-80"
        :class="size === 'md' ? 'h-3.5 w-3.5' : 'h-2.5 w-2.5'"
      />
      <img
        v-else-if="k === 'openguessr'"
        :src="icons.globe"
        alt=""
        class="opacity-80"
        :class="size === 'md' ? 'h-3.5 w-3.5' : 'h-2.5 w-2.5'"
      />
      <span
        v-else-if="k === 'skribbl_io'"
        class="font-bold leading-none text-sky-400"
        :class="size === 'md' ? 'text-[10px]' : 'text-[8px]'"
        aria-hidden="true"
        >Sb</span
      >
      <img
        v-else-if="k === 'gartic_phone'"
        :src="icons.pen"
        alt=""
        class="opacity-80"
        :class="size === 'md' ? 'h-3.5 w-3.5' : 'h-2.5 w-2.5'"
      />
      <img
        v-else-if="k === 'krunker'"
        :src="icons.speedometer"
        alt=""
        class="opacity-80"
        :class="size === 'md' ? 'h-3.5 w-3.5' : 'h-2.5 w-2.5'"
      />
      <img
        v-else-if="k === 'codenames'"
        :src="icons.usersAvatar"
        alt=""
        class="opacity-80"
        :class="size === 'md' ? 'h-3.5 w-3.5' : 'h-2.5 w-2.5'"
      />
      <img
        v-else-if="k === 'richup'"
        :src="icons.creditCard"
        alt=""
        class="opacity-80"
        :class="size === 'md' ? 'h-3.5 w-3.5' : 'h-2.5 w-2.5'"
      />
      <span
        v-else-if="k === 'goober_dash'"
        class="font-bold leading-none text-fuchsia-400"
        :class="size === 'md' ? 'text-[11px]' : 'text-[9px]'"
        aria-hidden="true"
        >G</span
      >
      <span
        v-else-if="k === 'smash_karts'"
        class="font-bold leading-none text-orange-400"
        :class="size === 'md' ? 'text-[10px]' : 'text-[8px]'"
        aria-hidden="true"
        >SK</span
      >
      <span
        v-else-if="k === 'cluster_rush'"
        class="font-bold leading-none text-amber-400"
        :class="size === 'md' ? 'text-[10px]' : 'text-[8px]'"
        aria-hidden="true"
        >CR</span
      >
      <img
        v-else
        :src="icons.puzzle"
        alt=""
        class="opacity-80"
        :class="size === 'md' ? 'h-3.5 w-3.5' : 'h-2.5 w-2.5'"
      />
    </span>
  </div>
</template>

<style scoped lang="scss">
.vc-act-pres-badges__chip {
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--border) 80%, transparent);
}
[data-theme='light'] .vc-act-pres-badges__chip {
  box-shadow: none;
  border-color: color-mix(in srgb, var(--border) 92%, transparent);
}
[data-theme='light'] .vc-act-pres-badges__chip img {
  filter: none;
  opacity: 0.72;
}
[data-theme='dark'] .vc-act-pres-badges__chip img {
  filter: invert(1);
  opacity: 0.72;
}
</style>
