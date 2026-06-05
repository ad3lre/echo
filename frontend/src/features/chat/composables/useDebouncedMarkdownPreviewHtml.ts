import {
  computed,
  onUnmounted,
  ref,
  watch,
  type ComputedRef,
  type Ref,
} from 'vue';
import type { MentionEntity } from '@shared/types';
import {
  mightHaveMarkdownSyntax,
  parseMessageContent,
  type IdTokenResolvers,
} from '@/composables/useMarkdown';
import { markdownKatexReadyVersion } from '@/composables/markdownKatex';

/** Composer preview only — avoids multi‑second main-thread stalls on huge pastes. */
const PREVIEW_CHAR_CAP = 14_000;
/** Typing debounce — long enough to skip parse storms, short enough for live preview. */
const DEBOUNCE_MS_TYPING = 72;
/**
 * When many characters change in one update (paste, select-all delete, etc.), wait longer
 * before running the heavy parse so the main thread stays responsive.
 */
const DEBOUNCE_MS_BULK = 260;
/** Chars added/removed in one tick above this → treat as paste/bulk, not live typing. */
const BULK_CHANGE_MIN_CHARS = 200;

/**
 * Runs `parseMessageContent` only when split/inline/expanded markdown preview is active,
 * debounced so large pastes do not freeze the UI. Truncates very long text for preview.
 */
export function useDebouncedMarkdownPreviewHtml(options: {
  content: Ref<string>;
  mentions: Ref<MentionEntity[]>;
  parseIdResolvers: ComputedRef<IdTokenResolvers | undefined>;
  previewOpen: Ref<boolean>;
  previewInline: Ref<boolean>;
  previewExpanded: ComputedRef<boolean>;
}): Ref<string> {
  const html = ref('');
  let timer: ReturnType<typeof setTimeout> | null = null;
  let rafId: number | null = null;
  let lastParsedContentLen = 0;

  const surfaceActive = computed(
    () =>
      options.previewOpen.value ||
      options.previewInline.value ||
      options.previewExpanded.value,
  );

  function clearTimer() {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  }

  function clearRaf() {
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  }

  function clearScheduledWork() {
    clearTimer();
    clearRaf();
  }

  function mentionsForSlice(
    fullLen: number,
    mentions: MentionEntity[],
  ): MentionEntity[] {
    if (fullLen <= PREVIEW_CHAR_CAP) return mentions;
    return mentions.filter((m) => m.end <= PREVIEW_CHAR_CAP);
  }

  function buildHtml(): string {
    const raw = options.content.value;
    if (!raw.trim()) return '';
    const slice =
      raw.length > PREVIEW_CHAR_CAP ? raw.slice(0, PREVIEW_CHAR_CAP) : raw;
    const mentions = mentionsForSlice(raw.length, options.mentions.value);
    if (
      !mightHaveMarkdownSyntax(slice) &&
      mentions.length === 0 &&
      !/<a?:\w+:\d+>/.test(slice) &&
      !/<icon:[^>]+>/.test(slice)
    ) {
      const escaped = slice
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\n/g, '<br>');
      if (raw.length <= PREVIEW_CHAR_CAP) return escaped;
      return `${escaped}<p class="text-xs opacity-70 mt-2">Preview truncated (${PREVIEW_CHAR_CAP.toLocaleString()} of ${raw.length.toLocaleString()} characters).</p>`;
    }
    const base = parseMessageContent(
      slice,
      mentions,
      options.parseIdResolvers.value,
    );
    if (raw.length <= PREVIEW_CHAR_CAP) return base;
    return `${base}<p class="text-xs opacity-70 mt-2">Preview truncated (${PREVIEW_CHAR_CAP.toLocaleString()} of ${raw.length.toLocaleString()} characters).</p>`;
  }

  function commitHtml(next: string) {
    if (html.value !== next) html.value = next;
  }

  function flush() {
    clearScheduledWork();
    if (!surfaceActive.value) {
      html.value = '';
      lastParsedContentLen = 0;
      return;
    }
    commitHtml(buildHtml());
    lastParsedContentLen = options.content.value.length;
  }

  function schedule() {
    if (!surfaceActive.value) {
      clearScheduledWork();
      html.value = '';
      lastParsedContentLen = 0;
      return;
    }
    const len = options.content.value.length;
    const delta = Math.abs(len - lastParsedContentLen);
    const delay =
      delta >= BULK_CHANGE_MIN_CHARS ? DEBOUNCE_MS_BULK : DEBOUNCE_MS_TYPING;
    clearScheduledWork();
    if (delay <= 0) {
      rafId = requestAnimationFrame(() => {
        rafId = null;
        commitHtml(buildHtml());
        lastParsedContentLen = options.content.value.length;
      });
      return;
    }
    timer = setTimeout(() => {
      timer = null;
      commitHtml(buildHtml());
      lastParsedContentLen = options.content.value.length;
    }, delay);
  }

  watch(
    surfaceActive,
    (on) => {
      if (on) flush();
      else {
        clearScheduledWork();
        html.value = '';
        lastParsedContentLen = 0;
      }
    },
    { flush: 'sync', immediate: true },
  );

  watch(
    () =>
      [
        options.content.value,
        options.mentions.value,
        options.parseIdResolvers.value,
        markdownKatexReadyVersion.value,
      ] as const,
    () => {
      if (!surfaceActive.value) return;
      schedule();
    },
    { flush: 'sync' },
  );

  onUnmounted(() => clearScheduledWork());

  return html;
}
