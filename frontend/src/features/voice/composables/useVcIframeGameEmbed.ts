import { onBeforeUnmount, ref, watch, type Ref } from 'vue';
import {
  vcIframeEmbedRequiresWebgl,
  type VcIframeEmbedPhase,
} from '@/features/voice/vcActivityTypes';

/** Unity WebGL opens IndexedDB during startup; defer navigation briefly after mount/teardown. */
const UNITY_IFRAME_SRC_DELAY_MS = 50;

export function useVcIframeGameEmbed(opts: {
  phase: Ref<VcIframeEmbedPhase | null>;
  url: Ref<string>;
  visible: Ref<boolean>;
}) {
  const iframeKey = ref(0);
  const iframeSrc = ref('about:blank');
  const iframeRef = ref<HTMLIFrameElement | null>(null);

  let pendingSrcTimer: ReturnType<typeof setTimeout> | null = null;

  function clearPendingSrc(): void {
    if (pendingSrcTimer != null) {
      clearTimeout(pendingSrcTimer);
      pendingSrcTimer = null;
    }
  }

  function blankIframe(): void {
    clearPendingSrc();
    iframeSrc.value = 'about:blank';
    const el = iframeRef.value;
    if (el) {
      try {
        el.src = 'about:blank';
      } catch {
        /* ignore */
      }
    }
  }

  function srcAssignDelayMs(phase: VcIframeEmbedPhase): number {
    return vcIframeEmbedRequiresWebgl(phase) ? UNITY_IFRAME_SRC_DELAY_MS : 0;
  }

  function scheduleSrcAssign(url: string, phase: VcIframeEmbedPhase): void {
    clearPendingSrc();
    iframeSrc.value = 'about:blank';
    const delayMs = srcAssignDelayMs(phase);
    pendingSrcTimer = setTimeout(() => {
      pendingSrcTimer = null;
      iframeSrc.value = url;
    }, delayMs);
  }

  function bumpKeyIfNeeded(
    next: VcIframeEmbedPhase,
    prev: VcIframeEmbedPhase | null | undefined,
  ): void {
    if (prev == null || prev !== next) {
      iframeKey.value += 1;
    }
  }

  watch(
    () => [opts.phase.value, opts.url.value, opts.visible.value] as const,
    ([phase, url, visible], old) => {
      const prevPhase = old?.[0] ?? null;
      if (!visible || !phase || !url) {
        blankIframe();
        return;
      }
      bumpKeyIfNeeded(phase, prevPhase);
      scheduleSrcAssign(url, phase);
    },
    { immediate: true },
  );

  onBeforeUnmount(() => {
    blankIframe();
  });

  function reload(): void {
    const phase = opts.phase.value;
    const url = opts.url.value;
    if (!phase || !url || !opts.visible.value) return;
    iframeKey.value += 1;
    scheduleSrcAssign(url, phase);
  }

  return { iframeKey, iframeSrc, iframeRef, reload };
}
