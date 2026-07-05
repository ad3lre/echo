import { watchEffect, type Ref } from 'vue';
import {
  discordCustomEmojiCandidateUrls,
  resolveCustomEmojiImageUrlForDisplay,
  shouldAllowDiscordCdnGuessForEmojiId,
} from '@/utils/customEmojiUrl';
import { isEchoEmojiTokenResolveMiss } from '@/composables/useGlobalEmojiTokenResolver';

function nextCandidateSrc(
  id: string,
  animated: boolean,
  currentSrc: string,
  tryIndex: number,
  cachedById: ReadonlyMap<string, string> | undefined,
): string | null {
  const echoMissed = isEchoEmojiTokenResolveMiss(id);
  const primary = resolveCustomEmojiImageUrlForDisplay(
    id,
    animated,
    cachedById,
    echoMissed,
    {
      allowDiscordCdnGuess: shouldAllowDiscordCdnGuessForEmojiId(
        id,
        cachedById,
        echoMissed,
      ),
    },
  );
  const candidates: string[] = [];
  if (primary) candidates.push(primary);
  for (const u of discordCustomEmojiCandidateUrls(id, animated)) {
    if (!candidates.includes(u)) candidates.push(u);
  }
  const cur = currentSrc.trim();
  let start = tryIndex;
  if (start <= 0 && cur) {
    const idx = candidates.findIndex((u) => u === cur);
    start = idx >= 0 ? idx + 1 : 0;
  }
  return candidates[start] ?? null;
}

export function markCustomEmojiImgLoaded(img: HTMLImageElement): void {
  img.classList.remove('custom-emoji--pending-load');
  const shell = img.closest('.custom-emoji-inline');
  shell?.classList.remove('custom-emoji-inline--loading');
}

/** Reveal skeleton-backed emojis that were already in the browser cache. */
export function reconcileCustomEmojiInlineImgs(root: ParentNode | null): void {
  if (!root) return;
  root
    .querySelectorAll('img.custom-emoji.custom-emoji--pending-load')
    .forEach((node) => {
      if (!(node instanceof HTMLImageElement)) return;
      if (node.complete && node.naturalWidth > 0) {
        markCustomEmojiImgLoaded(node);
      }
    });
}

/**
 * Delegated `error` handler for `<img class="custom-emoji">` in message HTML.
 * Retries Discord CDN variants (host + extension) when the first `src` 404s.
 */
export function handleCustomEmojiImgErrorEvent(
  ev: Event,
  cachedById: ReadonlyMap<string, string> | undefined,
): void {
  const img = ev.target;
  if (!(img instanceof HTMLImageElement)) return;
  if (!img.classList.contains('custom-emoji')) return;
  const id = img.dataset.emojiId?.trim();
  if (!id) return;
  const animated = img.dataset.emojiAnimated === 'true';
  const tryIndex = Number.parseInt(img.dataset.emojiSrcTry ?? '0', 10) || 0;
  const next = nextCandidateSrc(id, animated, img.src, tryIndex, cachedById);
  if (!next || next === img.src) {
    markCustomEmojiImgLoaded(img);
    return;
  }
  img.classList.add('custom-emoji--pending-load');
  img
    .closest('.custom-emoji-inline')
    ?.classList.add('custom-emoji-inline--loading');
  img.dataset.emojiSrcTry = String(tryIndex + 1);
  img.src = next;
}

function handleCustomEmojiImgLoadEvent(ev: Event): void {
  const img = ev.target;
  if (!(img instanceof HTMLImageElement)) return;
  if (!img.classList.contains('custom-emoji')) return;
  markCustomEmojiImgLoaded(img);
}

export function useCustomEmojiImgLoadRecovery(
  rootRef: Ref<HTMLElement | null | undefined>,
  cachedById: Ref<ReadonlyMap<string, string> | undefined>,
): void {
  function onError(ev: Event) {
    handleCustomEmojiImgErrorEvent(ev, cachedById.value);
  }

  watchEffect((onCleanup) => {
    const el = rootRef.value;
    if (!el) return;
    el.addEventListener('error', onError, true);
    el.addEventListener('load', handleCustomEmojiImgLoadEvent, true);
    reconcileCustomEmojiInlineImgs(el);
    onCleanup(() => {
      el.removeEventListener('error', onError, true);
      el.removeEventListener('load', handleCustomEmojiImgLoadEvent, true);
    });
  });
}
