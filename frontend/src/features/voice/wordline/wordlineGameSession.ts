import { computed, type ComputedRef, type Ref } from 'vue';
import type { LiveKitRoomState } from '@/composables/useLiveKitVoiceRoom';
import { useGameRoom } from '@/features/games/useGameRoom';
import type {
  VcActivityUiPhase,
  VcActivityUiState,
} from '@/features/voice/vcActivityTypes';
import { WORDLE_SERVER_MODE } from '@shared/vcActivityCatalog';
import { WORDLINE_ACTION, type WordlineView } from '@shared/games/wordline';

export type CreateWordlineGameSessionOpts = {
  currentUserId: () => string | undefined;
  vcActivityUi: Ref<VcActivityUiState>;
  isDmVoiceCallUi: Ref<boolean>;
  currentVoiceChannelId: Ref<string | null>;
  liveKitState: Ref<LiveKitRoomState>;
  accessToken: () => string | undefined;
  resolveGuildVoiceServerId: (channelId: string) => string;
};

export type WordlineGameSession = {
  wordlineView: ComputedRef<WordlineView | null>;
  submitWordlineGuess: (guess: string) => void;
  setWordlineMode: (mode: WordlineView['mode']) => void;
  resetIfLeavingPhase: (phase: VcActivityUiPhase) => void;
};

export function createWordlineGameSession(
  opts: CreateWordlineGameSessionOpts,
): WordlineGameSession {
  const room = useGameRoom<WordlineView>({
    gameKey: 'wordle',
    roomId: computed(() => opts.currentVoiceChannelId.value),
    serverId: computed(() => {
      const ch = opts.currentVoiceChannelId.value?.trim() ?? '';
      return ch ? opts.resolveGuildVoiceServerId(ch) : null;
    }),
    accessToken: computed(() => opts.accessToken()?.trim() ?? null),
    enabled: computed(
      () =>
        WORDLE_SERVER_MODE &&
        !opts.isDmVoiceCallUi.value &&
        opts.vcActivityUi.value.phase === 'wordle' &&
        opts.liveKitState.value === 'connected' &&
        !!(
          opts.currentVoiceChannelId.value?.trim() && opts.accessToken()?.trim()
        ),
    ),
  });

  const wordlineView = computed(() => room.view.value);

  function submitWordlineGuess(guess: string): void {
    const g = guess.trim().toLowerCase();
    if (!/^[a-z]{5}$/.test(g)) return;
    room.sendAction(WORDLINE_ACTION.submitGuess, { guess: g });
  }

  function setWordlineMode(mode: WordlineView['mode']): void {
    room.sendAction(WORDLINE_ACTION.setMode, { mode });
  }

  function resetIfLeavingPhase(phase: VcActivityUiPhase): void {
    if (phase !== 'wordle') {
      room.view.value = null;
      room.rev.value = 0;
    }
  }

  return {
    wordlineView,
    submitWordlineGuess,
    setWordlineMode,
    resetIfLeavingPhase,
  };
}
