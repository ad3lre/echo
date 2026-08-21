import type { ComputedRef, Ref } from 'vue';
import type { MentionEntity } from '@shared/types';
import {
  echoHardFormatPrefixSatisfied,
  echoHardFormatProtectedPrefixLen,
  stripLeadingDuplicateHardFormatTemplate,
} from '@shared/messageChunkLimits';
import { shiftMentionsForReplacement } from '@/features/chat/editor/composerModel';

export type ComposerChannelMessageFormatHost = {
  flushComposerSync: () => void;
  getContent: () => string;
  getSelectionStart: () => number;
  getSelectionEnd: () => number;
  mentions: Ref<MentionEntity[]>;
  setSerializedState: (
    content: string,
    mentions: MentionEntity[],
    selectionStart: number,
    selectionEnd: number,
  ) => void;
  replaceRange: (start: number, end: number, text: string) => void;
  registerKeydownHandler: (
    handler: ((event: KeyboardEvent) => boolean) | null,
  ) => void;
  content: Ref<string>;
};

function shiftMentionEntities(
  mentions: MentionEntity[],
  delta: number,
): MentionEntity[] {
  if (delta === 0) return mentions.map((m) => ({ ...m }));
  return mentions.map((m) => ({
    ...m,
    start: m.start + delta,
    end: m.end + delta,
  }));
}

export function isImeComposingKeyboardEvent(e: KeyboardEvent): boolean {
  if (e.isComposing) return true;
  return e.keyCode === 229;
}

export function isProtectedPrefixDeletionKey(e: KeyboardEvent): boolean {
  if (e.key === 'Backspace' || e.key === 'Delete') return true;
  return (e.key === 'x' || e.key === 'X') && (e.ctrlKey || e.metaKey);
}

export function hardFormatProtectedPrefixLenFor(
  composer: ComposerChannelMessageFormatHost,
  hardFormatEnabled: boolean,
  template: string,
  content = composer.getContent(),
): number {
  if (!hardFormatEnabled || !template) return 0;
  return echoHardFormatProtectedPrefixLen(content, template);
}

function stripDuplicateHardFormatPrefix(
  composer: ComposerChannelMessageFormatHost,
  template: string,
): boolean {
  const cur = composer.getContent();
  const stripped = stripLeadingDuplicateHardFormatTemplate(cur, template);
  if (stripped === null || stripped === cur) return false;

  const lo = template.length;
  const hi = template.length * 2;
  const delta = lo - hi;
  const mentions = shiftMentionsForReplacement(
    cur,
    composer.mentions.value,
    lo,
    hi,
    0,
  );
  const shiftPos = (p: number) => {
    if (p <= lo) return p;
    if (p >= hi) return p + delta;
    return lo;
  };
  const a = shiftPos(composer.getSelectionStart());
  let b = shiftPos(composer.getSelectionEnd());
  if (b < a) b = a;
  composer.setSerializedState(stripped, mentions, a, b);
  return true;
}

function prependMissingHardFormatPrefix(
  composer: ComposerChannelMessageFormatHost,
  template: string,
) {
  const cur = composer.getContent();
  if (cur.trim().length === 0) {
    composer.setSerializedState(template, [], template.length, template.length);
    return;
  }
  if (echoHardFormatPrefixSatisfied(cur, template)) return;
  const next = template + cur;
  const mentions = shiftMentionEntities(
    composer.mentions.value,
    template.length,
  );
  const pos = Math.min(
    composer.getSelectionStart() + template.length,
    next.length,
  );
  composer.setSerializedState(next, mentions, pos, pos);
}

export function ensureComposerHardFormatPrefix(
  composer: ComposerChannelMessageFormatHost,
  template: string,
  hardFormatEnabled: boolean,
) {
  if (!template || !hardFormatEnabled) return;

  for (let k = 0; k < 8; k++) {
    if (!stripDuplicateHardFormatPrefix(composer, template)) break;
  }
  prependMissingHardFormatPrefix(composer, template);
}

export function ensureComposerSoftFormatIfEmpty(
  composer: ComposerChannelMessageFormatHost,
  template: string,
  hardFormatEnabled: boolean,
) {
  if (!template || hardFormatEnabled) return;
  if (composer.getContent().trim().length > 0) return;
  composer.setSerializedState(template, [], template.length, template.length);
}

export function applyChannelMessageFormatAfterRestore(
  composer: ComposerChannelMessageFormatHost,
  template: string,
  hardFormatEnabled: boolean,
) {
  composer.flushComposerSync();
  ensureComposerHardFormatPrefix(composer, template, hardFormatEnabled);
  ensureComposerSoftFormatIfEmpty(composer, template, hardFormatEnabled);
}

export function handleFormatGuardKeydown(
  e: KeyboardEvent,
  composer: ComposerChannelMessageFormatHost,
  template: string,
  hardFormatEnabled: boolean,
  guardImeComposition: boolean,
): boolean {
  if (guardImeComposition && isImeComposingKeyboardEvent(e)) {
    return false;
  }
  if (!hardFormatEnabled || !isProtectedPrefixDeletionKey(e)) {
    return false;
  }

  composer.flushComposerSync();
  const plen = hardFormatProtectedPrefixLenFor(
    composer,
    hardFormatEnabled,
    template,
  );
  const a = composer.getSelectionStart();
  const b = composer.getSelectionEnd();
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);

  if (plen === 0) {
    e.preventDefault();
    applyChannelMessageFormatAfterRestore(
      composer,
      template,
      hardFormatEnabled,
    );
    return true;
  }

  if (hi <= plen) {
    e.preventDefault();
    return true;
  }
  if (lo < plen) {
    e.preventDefault();
    composer.replaceRange(plen, hi, '');
    applyChannelMessageFormatAfterRestore(
      composer,
      template,
      hardFormatEnabled,
    );
    return true;
  }
  return false;
}

export type ComposerMessageFormatSyncRefs = {
  hardFormatEnabled: ComputedRef<boolean>;
  messageFormatNormalized: ComputedRef<string>;
};

export type ComposerMessageFormatChannelWatchRefs = {
  channelId?: Ref<string | undefined> | ComputedRef<string | undefined>;
  messageFormatTemplate:
    | Ref<string | undefined>
    | ComputedRef<string | undefined>;
  messageFormatHard:
    | Ref<boolean | undefined>
    | ComputedRef<boolean | undefined>;
};

export function syncComposerMessageFormatFromContent(
  composer: ComposerChannelMessageFormatHost,
  refs: ComposerMessageFormatSyncRefs,
) {
  if (!refs.hardFormatEnabled.value && !refs.messageFormatNormalized.value) {
    return;
  }
  composer.flushComposerSync();
  ensureComposerHardFormatPrefix(
    composer,
    refs.messageFormatNormalized.value,
    refs.hardFormatEnabled.value,
  );
  ensureComposerSoftFormatIfEmpty(
    composer,
    refs.messageFormatNormalized.value,
    refs.hardFormatEnabled.value,
  );
}

export function restoreComposerMessageFormatForChannel(
  composer: ComposerChannelMessageFormatHost,
  refs: ComposerMessageFormatSyncRefs,
) {
  applyChannelMessageFormatAfterRestore(
    composer,
    refs.messageFormatNormalized.value,
    refs.hardFormatEnabled.value,
  );
}

export function channelMessageFormatWatchKey(
  refs: ComposerMessageFormatChannelWatchRefs,
) {
  return [
    refs.channelId?.value,
    refs.messageFormatTemplate.value,
    refs.messageFormatHard.value,
  ] as const;
}

export function createComposerMessageFormatActions(
  composer: ComposerChannelMessageFormatHost,
  syncRefs: ComposerMessageFormatSyncRefs,
  guardImeComposition: boolean,
) {
  const hardFormatProtectedPrefixLen = (content?: string) =>
    hardFormatProtectedPrefixLenFor(
      composer,
      syncRefs.hardFormatEnabled.value,
      syncRefs.messageFormatNormalized.value,
      content,
    );

  const syncHardFormatPrefix = () =>
    ensureComposerHardFormatPrefix(
      composer,
      syncRefs.messageFormatNormalized.value,
      syncRefs.hardFormatEnabled.value,
    );

  const syncSoftFormatIfEmpty = () =>
    ensureComposerSoftFormatIfEmpty(
      composer,
      syncRefs.messageFormatNormalized.value,
      syncRefs.hardFormatEnabled.value,
    );

  const restoreChannelMessageFormat = () =>
    applyChannelMessageFormatAfterRestore(
      composer,
      syncRefs.messageFormatNormalized.value,
      syncRefs.hardFormatEnabled.value,
    );

  const onFormatGuardKeydown = (e: KeyboardEvent) =>
    handleFormatGuardKeydown(
      e,
      composer,
      syncRefs.messageFormatNormalized.value,
      syncRefs.hardFormatEnabled.value,
      guardImeComposition,
    );

  return {
    hardFormatProtectedPrefixLen,
    syncHardFormatPrefix,
    syncSoftFormatIfEmpty,
    restoreChannelMessageFormat,
    onFormatGuardKeydown,
  };
}
