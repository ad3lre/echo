import type { Ref } from 'vue';
import type {
  VcActivityUiPhase,
  VcActivityUiState,
} from '@/features/voice/vcActivityTypes';

export type VcGameRoomEnabledOpts = {
  serverMode: boolean;
  isDmVoiceCallUi: Ref<boolean>;
  vcActivityUi: Ref<VcActivityUiState>;
  phase: VcActivityUiPhase;
  gameRoomChannelId: Ref<string | null>;
  isAuthenticated: () => boolean;
};

/** Whether the authoritative game-server room should connect for a guild VC activity. */
export function isVcGameRoomEnabled(opts: VcGameRoomEnabledOpts): boolean {
  return (
    opts.serverMode &&
    !opts.isDmVoiceCallUi.value &&
    opts.vcActivityUi.value.phase === opts.phase &&
    !!(opts.gameRoomChannelId.value?.trim() && opts.isAuthenticated())
  );
}
