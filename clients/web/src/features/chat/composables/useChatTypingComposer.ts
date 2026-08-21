import { watch, onUnmounted, type Ref } from 'vue';
import { emitChannelTypingPulse } from '@/features/chat/channelTyping';

/**
 * Sends throttled `channel:typing` pulses while the composer has non-empty text.
 * Debounced first fire + minimum gap between emits (~compact, light on the wire).
 */
export function useChatTypingComposer(opts: {
  channelId: Ref<string>;
  content: Ref<string>;
  enabled: Ref<boolean>;
}) {
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let lastEmitMs = 0;
  const DEBOUNCE_MS = 480;
  const MIN_GAP_MS = 2600;

  function clearDebounce() {
    if (debounceTimer != null) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
  }

  function pulse() {
    const cid = opts.channelId.value.trim();
    if (!cid || !opts.enabled.value) return;
    const plain = opts.content.value.trim();
    if (!plain.length) return;
    const now = Date.now();
    if (now - lastEmitMs < MIN_GAP_MS) return;
    lastEmitMs = now;
    emitChannelTypingPulse(cid);
  }

  function schedulePulse() {
    clearDebounce();
    if (!opts.enabled.value) return;
    if (!opts.channelId.value.trim()) return;
    if (!opts.content.value.trim().length) return;
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      pulse();
    }, DEBOUNCE_MS);
  }

  watch(
    () =>
      [opts.channelId.value, opts.content.value, opts.enabled.value] as const,
    () => {
      if (!opts.enabled.value || !opts.content.value.trim().length) {
        clearDebounce();
        return;
      }
      schedulePulse();
    },
  );

  onUnmounted(() => clearDebounce());
}
