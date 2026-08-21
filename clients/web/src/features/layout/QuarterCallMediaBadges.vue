<script setup lang="ts">
withDefaults(
  defineProps<{
    icons: { mic: string; headphones: string };
    showDeafened: boolean;
    showMutedOnly: boolean;
    /** Match parent clip shape, e.g. `rounded-full` or `rounded-xl` */
    surfaceClass?: string;
    /** Larger hit-target for quarter / beside-chat DM tiles. */
    density?: 'default' | 'comfortable';
  }>(),
  { surfaceClass: 'rounded-full', density: 'default' },
);
</script>

<template>
  <div
    v-if="showDeafened"
    class="pointer-events-none absolute inset-0 z-10 flex items-center justify-center"
    :class="surfaceClass"
  >
    <div class="absolute inset-0 z-0 bg-scrim-2" :class="surfaceClass" />
    <img
      :src="icons.headphones"
      alt=""
      class="relative z-[1] h-[38%] w-[38%] opacity-95 filter invert"
      :class="
        density === 'comfortable'
          ? 'min-h-[18px] min-w-[18px] max-h-6 max-w-6'
          : 'min-h-[14px] min-w-[14px] max-h-5 max-w-5'
      "
    />
  </div>
  <div
    v-else-if="showMutedOnly"
    class="pointer-events-none absolute z-10 flex items-center justify-center rounded-full bg-overlay-heavy ring-1 ring-white/25"
    :class="
      density === 'comfortable'
        ? 'bottom-1 right-1 h-5 w-5'
        : 'bottom-0.5 right-0.5 h-4 w-4'
    "
  >
    <span
      class="relative flex items-center justify-center"
      :class="density === 'comfortable' ? 'h-3.5 w-3.5' : 'h-3 w-3'"
    >
      <img
        :src="icons.mic"
        alt=""
        class="opacity-90 filter invert"
        :class="density === 'comfortable' ? 'h-3 w-3' : 'h-2.5 w-2.5'"
      />
      <span
        class="absolute left-1/2 top-1/2 h-px max-w-[14px] w-[130%] -translate-x-1/2 -translate-y-1/2 rotate-[-40deg] bg-red-400"
        aria-hidden="true"
      />
    </span>
  </div>
</template>
