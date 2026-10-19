<script setup lang="ts">
import { echoT } from '@/i18n';
import { computed } from 'vue';
import { iconYoutubeSvgPath, icons } from '@/assets/icons';
import type { VcActivityPresenceKind } from '@/features/voice/vcActivityTypes';
import {
  WATCH_TOGETHER_VC_ACTIVITY_ENABLED,
  YOUTUBE_INTEGRATION_ENABLED,
} from '@shared/integrationKillSwitches';

const props = withDefaults(
  defineProps<{
    kinds: VcActivityPresenceKind[];
    /** `sm` = channel list; `md` = CallView tiles */
    size?: 'sm' | 'md';
  }>(),
  { size: 'sm' },
);

const visibleKinds = computed(() => {
  let kinds = props.kinds;
  if (!YOUTUBE_INTEGRATION_ENABLED) {
    kinds = kinds.filter((k) => k !== 'youtube');
  }
  if (!WATCH_TOGETHER_VC_ACTIVITY_ENABLED) {
    kinds = kinds.filter((k) => k !== 'watch_together');
  }
  return kinds;
});

function titleFor(k: VcActivityPresenceKind): string {
  switch (k) {
    case 'youtube':
      return echoT('b30.vcPresence.youtube');
    case 'watch_together':
      return echoT('b30.vcPresence.watchTogether');
    case 'wordle':
      return 'In Wordline activity';
    case 'hangman':
      return 'In Hangman activity';
    case 'openguessr':
      return echoT('b30.vcPresence.openguessr');
    case 'skribbl_io':
      return 'In skribbl.io activity';
    case 'gartic_phone':
      return echoT('b30.vcPresence.garticPhone');
    case 'krunker':
      return echoT('b30.vcPresence.krunker');
    case 'codenames':
      return 'In Echoed Names activity';
    case 'richup':
      return echoT('b30.vcPresence.richup');
    case 'goober_dash':
      return echoT('b30.vcPresence.gooberDash');
    case 'smash_karts':
      return echoT('b30.vcPresence.smashKarts');
    case 'cluster_rush':
      return echoT('b30.vcPresence.clusterRush');
    case 'activities':
      return echoT('b30.vcPresence.browsing');
    default:
      return '';
  }
}
</script>

<template>
  <div
    v-if="visibleKinds.length"
    class="vc-act-pres-badges inline-flex items-center"
    :class="size === 'md' ? 'gap-0.5' : 'gap-px'"
    :aria-label="echoT('b30.vcPresence.voiceActivity')"
  >
    <span
      v-for="k in visibleKinds"
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
        v-else-if="k === 'watch_together'"
        class="font-bold leading-none text-[#6d9fff]"
        :class="size === 'md' ? 'text-[10px]' : 'text-[8px]'"
        aria-hidden="true"
        >WT</span
      >
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
