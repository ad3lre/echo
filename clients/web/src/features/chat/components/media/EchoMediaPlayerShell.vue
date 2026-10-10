<script setup lang="ts">
withDefaults(
  defineProps<{
    variant?: 'video' | 'audio';
    controlsVisible?: boolean;
    isPlaying?: boolean;
    showCenterPlay?: boolean;
    keyboardHint?: boolean;
  }>(),
  {
    variant: 'video',
    controlsVisible: true,
    isPlaying: false,
    showCenterPlay: true,
    keyboardHint: true,
  },
);

const emit = defineEmits<{
  (e: 'toggle-play'): void;
  (e: 'pointer-activity'): void;
  (e: 'pointer-leave'): void;
  (e: 'focus-in'): void;
}>();
</script>

<template>
  <div
    class="echo-media-shell"
    :class="[
      `echo-media-shell--${variant}`,
      { 'echo-media-shell--controls-hidden': !controlsVisible && isPlaying },
    ]"
    tabindex="0"
    :title="
      keyboardHint
        ? variant === 'video'
          ? 'Space: play · ←/→: seek · ↑/↓: volume · M: mute · F: fullscreen'
          : 'Space: play · ←/→: seek · ↑/↓: volume · M: mute'
        : undefined
    "
    @pointermove="emit('pointer-activity')"
    @pointerdown="
      ($event.currentTarget as HTMLElement).focus({ preventScroll: true });
      emit('pointer-activity');
    "
    @pointerleave="emit('pointer-leave')"
    @focusin="emit('focus-in')"
  >
    <div class="echo-media-shell__media">
      <slot />
    </div>

    <button
      v-if="showCenterPlay && !isPlaying"
      type="button"
      class="echo-media-shell__center-play chat-focus-ring"
      aria-label="Play"
      @click.stop="emit('toggle-play')"
    >
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path
          d="M8 5.14v13.72a1 1 0 0 0 1.5.86l10.2-6.86a1 1 0 0 0 0-1.72L9.5 4.28A1 1 0 0 0 8 5.14z"
        />
      </svg>
    </button>

    <div
      class="echo-media-shell__controls"
      :class="{
        'echo-media-shell__controls--hidden': !controlsVisible && isPlaying,
      }"
    >
      <slot name="controls" />
    </div>
  </div>
</template>

<style scoped lang="scss" src="./styles/EchoMediaPlayerShell.scss"></style>
