import { onMounted, onUnmounted, ref, type ComputedRef, type Ref } from 'vue';
import { playEchoSound } from '@/features/layout/useEchoSounds';
import type { LiveKitRoomState } from '@/features/voice/useLiveKitVoiceRoom';

function isEditableTarget(el: EventTarget | null): boolean {
  if (!el || !(el instanceof HTMLElement)) return false;
  return (
    el.closest('input, textarea, select, [contenteditable="true"]') != null
  );
}

/**
 * Hold Space to transmit (temporarily unmutes). Release restores prior mute state.
 * Only active while connected to a voice channel and LiveKit is connected.
 */
export function useVcPushToTalk(opts: {
  liveKitState: ComputedRef<LiveKitRoomState>;
  inVoiceChannel: () => boolean;
  vcMuted: Ref<boolean>;
  vcDeafened: Ref<boolean>;
  /** When false, PTT is disabled (e.g. settings toggle later). */
  enabled?: Ref<boolean>;
}) {
  const keyHeld = ref(false);
  const restoreMuted = ref<boolean | null>(null);

  function resetFromHold() {
    if (!keyHeld.value) return;
    keyHeld.value = false;
    if (restoreMuted.value !== null) {
      opts.vcMuted.value = restoreMuted.value;
      restoreMuted.value = null;
    }
    playEchoSound('pttOff', { silentFallback: true });
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.code !== 'Space') return;
    if (e.repeat) return;
    if (!opts.inVoiceChannel() || opts.liveKitState.value !== 'connected')
      return;
    if (opts.vcDeafened.value) return;
    if (opts.enabled?.value === false) return;
    if (isEditableTarget(e.target)) return;
    e.preventDefault();
    if (keyHeld.value) return;
    keyHeld.value = true;
    restoreMuted.value = opts.vcMuted.value;
    if (opts.vcMuted.value) {
      opts.vcMuted.value = false;
    }
    playEchoSound('pttOn', { silentFallback: true });
  }

  function onKeyUp(e: KeyboardEvent) {
    if (e.code !== 'Space') return;
    if (!keyHeld.value) return;
    e.preventDefault();
    resetFromHold();
  }

  function onWindowBlur() {
    resetFromHold();
  }

  onMounted(() => {
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('keyup', onKeyUp, true);
    window.addEventListener('blur', onWindowBlur);
  });

  onUnmounted(() => {
    window.removeEventListener('keydown', onKeyDown, true);
    window.removeEventListener('keyup', onKeyUp, true);
    window.removeEventListener('blur', onWindowBlur);
    resetFromHold();
  });
}
