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

<style scoped lang="scss">
.echo-media-shell {
  position: relative;
  overflow: hidden;
  border-radius: 0.5rem;
  background: rgb(0 0 0 / 0.35);
  outline: none;

  &:focus-visible {
    box-shadow: 0 0 0 2px var(--accent);
  }
}

.echo-media-shell--audio {
  background: var(--elevated);
  border: 1px solid var(--border);
}

.echo-media-shell__media {
  position: relative;
  width: 100%;
}

.echo-media-shell--video .echo-media-shell__media :deep(video) {
  display: block;
  width: 100%;
  max-width: 100%;
  vertical-align: top;
}

.echo-media-shell--audio .echo-media-shell__media :deep(audio) {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
}

.echo-media-shell--audio .echo-media-shell__media {
  display: block;
}

.echo-media-shell__center-play {
  position: absolute;
  left: 50%;
  top: 50%;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 3.25rem;
  height: 3.25rem;
  margin: -1.625rem 0 0 -1.625rem;
  border: none;
  border-radius: 9999px;
  background: rgb(0 0 0 / 0.55);
  color: rgb(255 255 255 / 0.95);
  cursor: pointer;
  backdrop-filter: blur(8px);
  transition:
    transform 0.15s,
    background-color 0.15s;

  svg {
    width: 1.35rem;
    height: 1.35rem;
    margin-left: 0.15rem;
  }

  &:hover {
    transform: scale(1.05);
    background: rgb(0 0 0 / 0.65);
  }
}

.echo-media-shell__controls {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 3;
  background: linear-gradient(transparent, rgb(0 0 0 / 0.55));
  transition: opacity 0.25s ease;
}

.echo-media-shell--audio .echo-media-shell__controls {
  position: relative;
  background: transparent;
}

.echo-media-shell__controls--hidden {
  opacity: 0;
  pointer-events: none;
}

.echo-media-shell--audio .echo-media-shell__controls--hidden {
  opacity: 1;
  pointer-events: auto;
}
</style>
