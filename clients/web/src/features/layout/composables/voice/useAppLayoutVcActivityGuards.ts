import { useStageVcActivityBlock } from '@/features/voice/composables/useStageVcActivityBlock';

type StageBlockArgs = Parameters<typeof useStageVcActivityBlock>[0];

/**
 * Wraps each VC-activity opener with the stage-block guard (a stage channel
 * cannot launch activities), so the shell can hand presentational components
 * the guarded `*OnVoice` variants.
 */
export function useAppLayoutVcActivityGuards(
  deps: Pick<
    StageBlockArgs,
    | 'isViewingVoiceChannel'
    | 'effectiveActiveChannel'
    | 'vcActivityUi'
    | 'closeVcActivity'
  > & {
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

  return {
    openVcActivityPickerOnVoice: guardVcActivityOpen(deps.openVcActivityPicker),
    openVcActivityYoutubeBrowseOnVoice: guardVcActivityOpen(
      deps.openVcActivityYoutubeBrowse,
    ),
    openVcActivityWordleOnVoice: guardVcActivityOpen(deps.openVcActivityWordle),
    openVcActivityHangmanOnVoice: guardVcActivityOpen(
      deps.openVcActivityHangman,
    ),
    openVcActivitySkrigglesOnVoice: guardVcActivityOpen(
      deps.openVcActivitySkriggles,
    ),
    openVcActivityTicTacToeOnVoice: guardVcActivityOpen(
      deps.openVcActivityTicTacToe,
    ),
    openVcActivityOpenGuessrOnVoice: guardVcActivityOpen(
      deps.openVcActivityOpenGuessr,
    ),
    openVcActivitySkribblIoOnVoice: guardVcActivityOpen(
      deps.openVcActivitySkribblIo,
    ),
    openVcActivityGarticPhoneOnVoice: guardVcActivityOpen(
      deps.openVcActivityGarticPhone,
    ),
    openVcActivityKrunkerOnVoice: guardVcActivityOpen(
      deps.openVcActivityKrunker,
    ),
    openVcActivityCodenamesOnVoice: guardVcActivityOpen(
      deps.openVcActivityCodenames,
    ),
    openVcActivityRichupOnVoice: guardVcActivityOpen(deps.openVcActivityRichup),
    openVcActivityGooberDashOnVoice: guardVcActivityOpen(
      deps.openVcActivityGooberDash,
    ),
    openVcActivitySmashKartsOnVoice: guardVcActivityOpen(
      deps.openVcActivitySmashKarts,
    ),
    openVcActivityClusterRushOnVoice: guardVcActivityOpen(
      deps.openVcActivityClusterRush,
    ),
    openVcActivityWatchTogetherOnVoice: guardVcActivityOpen(
      deps.openVcActivityWatchTogether,
    ),
  };
}
