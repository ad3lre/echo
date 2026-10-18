import { useStageVcActivityBlock } from '@/features/voice/composables/useStageVcActivityBlock';

type StageBlockArgs = Parameters<typeof useStageVcActivityBlock>[0];

/**
 * Wraps each VC-activity opener with the stage-block guard (a stage channel
 * cannot launch activities), so the shell can hand presentational components
 * the guarded `*OnVoice` variants.
 *
 * Also jumps the main surface to the connected voice channel when needed.
 * Activity UI mounts whenever `vcActivityUi.phase !== 'closed'` (not only while
 * CallView is already on screen), so openers set phase synchronously — waiting
 * on `nextTick` / async chunk load left the picker looking like a no-op when
 * the user was browsing text with a sidebar-only voice session.
 */
export function useAppLayoutVcActivityGuards(
  deps: Pick<
    StageBlockArgs,
    | 'isViewingVoiceChannel'
    | 'effectiveActiveChannel'
    | 'vcActivityUi'
    | 'closeVcActivity'
  > & {
    /** Jump main surface to the connected guild VC when not already viewing it. */
    ensureViewingConnectedVoiceChannel?: () => void;
    openVcActivityPicker: () => void;
    openVcActivityYoutubeBrowse: () => void;
    openVcActivityWordle: () => void;
    openVcActivityHangman: () => void;
    openVcActivitySkriggles: () => void;
    openVcActivityTicTacToe: () => void;
    openVcActivityOpenGuessr: () => void;
    openVcActivitySkribblIo: () => void;
    openVcActivityGarticPhone: () => void;
    openVcActivityKrunker: () => void;
    openVcActivityCodenames: () => void;
    openVcActivityRichup: () => void;
    openVcActivityGooberDash: () => void;
    openVcActivitySmashKarts: () => void;
    openVcActivityClusterRush: () => void;
    openVcActivityWatchTogether: () => void;
  },
) {
  const { guardOpen: guardVcActivityOpen } = useStageVcActivityBlock({
    isViewingVoiceChannel: deps.isViewingVoiceChannel,
    effectiveActiveChannel: deps.effectiveActiveChannel,
    vcActivityUi: deps.vcActivityUi,
    closeVcActivity: deps.closeVcActivity,
  });

  function guardOpenWithVoiceSurface<T extends (...args: never[]) => unknown>(
    fn: T,
  ): T {
    const stageGuarded = guardVcActivityOpen(fn);
    return ((...args: Parameters<T>) => {
      deps.ensureViewingConnectedVoiceChannel?.();
      return stageGuarded(...args);
    }) as T;
  }

  return {
    openVcActivityPickerOnVoice: guardOpenWithVoiceSurface(
      deps.openVcActivityPicker,
    ),
    openVcActivityYoutubeBrowseOnVoice: guardOpenWithVoiceSurface(
      deps.openVcActivityYoutubeBrowse,
    ),
    openVcActivityWordleOnVoice: guardOpenWithVoiceSurface(
      deps.openVcActivityWordle,
    ),
    openVcActivityHangmanOnVoice: guardOpenWithVoiceSurface(
      deps.openVcActivityHangman,
    ),
    openVcActivitySkrigglesOnVoice: guardOpenWithVoiceSurface(
      deps.openVcActivitySkriggles,
    ),
    openVcActivityTicTacToeOnVoice: guardOpenWithVoiceSurface(
      deps.openVcActivityTicTacToe,
    ),
    openVcActivityOpenGuessrOnVoice: guardOpenWithVoiceSurface(
      deps.openVcActivityOpenGuessr,
    ),
    openVcActivitySkribblIoOnVoice: guardOpenWithVoiceSurface(
      deps.openVcActivitySkribblIo,
    ),
    openVcActivityGarticPhoneOnVoice: guardOpenWithVoiceSurface(
      deps.openVcActivityGarticPhone,
    ),
    openVcActivityKrunkerOnVoice: guardOpenWithVoiceSurface(
      deps.openVcActivityKrunker,
    ),
    openVcActivityCodenamesOnVoice: guardOpenWithVoiceSurface(
      deps.openVcActivityCodenames,
    ),
    openVcActivityRichupOnVoice: guardOpenWithVoiceSurface(
      deps.openVcActivityRichup,
    ),
    openVcActivityGooberDashOnVoice: guardOpenWithVoiceSurface(
      deps.openVcActivityGooberDash,
    ),
    openVcActivitySmashKartsOnVoice: guardOpenWithVoiceSurface(
      deps.openVcActivitySmashKarts,
    ),
    openVcActivityClusterRushOnVoice: guardOpenWithVoiceSurface(
      deps.openVcActivityClusterRush,
    ),
    openVcActivityWatchTogetherOnVoice: guardOpenWithVoiceSurface(
      deps.openVcActivityWatchTogether,
    ),
  };
}
