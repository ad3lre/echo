import { computed, nextTick, watch, type ComputedRef, type Ref } from 'vue';
import { normalizeEchoMessageFormatTemplateInput } from '@shared/messageChunkLimits';
import {
  channelMessageFormatWatchKey,
  createComposerMessageFormatActions,
  restoreComposerMessageFormatForChannel,
  syncComposerMessageFormatFromContent,
  type ComposerChannelMessageFormatHost,
} from './composerChannelMessageFormatLogic';

export type { ComposerChannelMessageFormatHost };

export type UseComposerChannelMessageFormatOptions = {
  messageFormatTemplate:
    | Ref<string | undefined>
    | ComputedRef<string | undefined>;
  messageFormatHard:
    | Ref<boolean | undefined>
    | ComputedRef<boolean | undefined>;
  channelId?: Ref<string | undefined> | ComputedRef<string | undefined>;
  /** When true, skip IME composition events (iOS / CJK keyboards). */
  guardImeComposition?: boolean;
};

export function useComposerChannelMessageFormat(
  composer: ComposerChannelMessageFormatHost,
  options: UseComposerChannelMessageFormatOptions,
) {
  const messageFormatNormalized = computed(() =>
    typeof options.messageFormatTemplate.value === 'string'
      ? normalizeEchoMessageFormatTemplateInput(
          options.messageFormatTemplate.value,
        )
      : '',
  );

  const hardFormatEnabled = computed(
    () =>
      options.messageFormatHard.value === true &&
      messageFormatNormalized.value.length > 0,
  );

  const syncRefs = { hardFormatEnabled, messageFormatNormalized };
  const guardImeComposition = options.guardImeComposition !== false;
  const actions = createComposerMessageFormatActions(
    composer,
    syncRefs,
    guardImeComposition,
  );

  watch(
    () => composer.content.value,
    () => syncComposerMessageFormatFromContent(composer, syncRefs),
  );

  if (options.channelId) {
    watch(
      () => channelMessageFormatWatchKey(options),
      () => {
        void nextTick(() =>
          restoreComposerMessageFormatForChannel(composer, syncRefs),
        );
      },
      { immediate: true },
    );
  }

  return {
    messageFormatNormalized,
    hardFormatEnabled,
    hardFormatProtectedPrefixLen: actions.hardFormatProtectedPrefixLen,
    ensureComposerHardFormatPrefix: actions.syncHardFormatPrefix,
    ensureComposerSoftFormatIfEmpty: actions.syncSoftFormatIfEmpty,
    applyChannelMessageFormatAfterRestore: actions.restoreChannelMessageFormat,
    handleFormatGuardKeydown: actions.onFormatGuardKeydown,
    registerFormatGuards: () =>
      composer.registerKeydownHandler(actions.onFormatGuardKeydown),
    unregisterFormatGuards: () => composer.registerKeydownHandler(null),
  };
}
