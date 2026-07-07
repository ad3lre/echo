import { computed, type ComputedRef, type Ref } from 'vue';
import type { EchoHangmanActivityV1 } from '@/audio/voiceEchoLiveKitData';
import { useGameRoom } from '@/features/games/useGameRoom';
import { isVcGameRoomEnabled } from '@/features/games/vcGameRoomEnabled';
import { HANGMAN_ACTION, type HangmanView } from '@shared/games/hangman';
import { HANGMAN_SERVER_MODE } from '@shared/vcActivityCatalog';
import type {
  VcActivityUiPhase,
  VcActivityUiState,
} from '@/features/voice/vcActivityTypes';
import { validateHangmanSecretWord } from '@shared/games/hangman/core';

export type CreateHangmanGameSessionOpts = {
  currentUserId: () => string | undefined;
  vcActivityUi: Ref<VcActivityUiState>;
  isDmVoiceCallUi: Ref<boolean>;
  gameRoomChannelId: ComputedRef<string | null>;
  isAuthenticated: () => boolean;
};

export type HangmanGameSession = {
  vcHangmanActivity: ComputedRef<EchoHangmanActivityV1 | null>;
  hangmanRosterUserIds: ComputedRef<string[]>;
  gameRoomConnected: ComputedRef<boolean>;
  gameRoomLastError: ComputedRef<import('@shared/games').GameErrorMsg | null>;
  commitVcHangmanWord: (raw: string) => string | null;
  requestVcHangmanGuessLetter: (letter: string) => void;
  requestVcHangmanNextRound: () => void;
  resetIfLeavingPhase: (phase: VcActivityUiPhase) => void;
};

function mapActivity(
  view: HangmanView,
  rev: number,
  fromUserId: string,
): EchoHangmanActivityV1 {
  return {
    v: 1,
    t: 'hangman_activity',
    updatedAt: Date.now(),
    revision: rev,
    fromUserId,
    roundSeq: view.roundSeq,
    setterUserId: view.setterUserId,
    rosterUserIds: view.rosterUserIds,
    phase: view.phase,
    guessedLetters: view.guessedLetters,
    guessHistory: view.guessHistory,
    wrongCount: view.wrongCount,
    mask: view.mask,
    roundResult: view.roundResult,
    answerReveal: view.answerReveal,
  };
}

function commitHangmanWord(
  room: ReturnType<typeof useGameRoom<HangmanView>>,
  currentUserId: () => string | undefined,
  raw: string,
): string | null {
  const validated = validateHangmanSecretWord(raw);
  if (!validated.ok) return validated.error;
  const v = room.view.value;
  const self = currentUserId()?.trim() ?? '';
  if (!v || v.phase !== 'setter_picking' || !v.youAreSetter) {
    return 'Not your turn to pick a word.';
  }
  if (self !== v.setterUserId) return 'Not your turn to pick a word.';
  room.sendAction(HANGMAN_ACTION.commitWord, { word: validated.normalized });
  return null;
}

export function createHangmanGameSession(
  opts: CreateHangmanGameSessionOpts,
): HangmanGameSession {
  const room = useGameRoom<HangmanView>({
    gameKey: 'hangman',
    roomId: computed(() => opts.gameRoomChannelId.value),
    enabled: computed(() =>
      isVcGameRoomEnabled({
        serverMode: HANGMAN_SERVER_MODE,
        isDmVoiceCallUi: opts.isDmVoiceCallUi,
        vcActivityUi: opts.vcActivityUi,
        phase: 'hangman',
        gameRoomChannelId: opts.gameRoomChannelId,
        isAuthenticated: opts.isAuthenticated,
      }),
    ),
  });

  const vcHangmanActivity = computed(() => {
    const v = room.view.value;
    const self = opts.currentUserId()?.trim() ?? '';
    if (!v || !self) return null;
    return mapActivity(v, room.rev.value, self);
  });

  const hangmanRosterUserIds = computed(
    () => room.view.value?.rosterUserIds ?? [],
  );

  function commitVcHangmanWord(raw: string): string | null {
    return commitHangmanWord(room, opts.currentUserId, raw);
  }

  function requestVcHangmanGuessLetter(letter: string): void {
    const L = letter.trim().toUpperCase();
    if (!/^[A-Z]$/.test(L)) return;
    const v = room.view.value;
    const self = opts.currentUserId()?.trim() ?? '';
    if (!v || v.phase !== 'guessing' || !self) return;
    if (self === v.setterUserId) return;
    room.sendAction(HANGMAN_ACTION.guessLetter, { letter: L });
  }

  function requestVcHangmanNextRound(): void {
    const v = room.view.value;
    if (!v || v.phase !== 'round_over') return;
    room.sendAction(HANGMAN_ACTION.nextRound, {
      completedRoundSeq: v.roundSeq,
    });
  }

  function resetIfLeavingPhase(phase: VcActivityUiPhase): void {
    if (phase !== 'hangman') {
      /* useGameRoom tears down when enabled becomes false */
    }
  }

  return {
    vcHangmanActivity,
    hangmanRosterUserIds,
    gameRoomConnected: computed(() => room.connected.value),
    gameRoomLastError: computed(() => room.lastError.value),
    commitVcHangmanWord,
    requestVcHangmanGuessLetter,
    requestVcHangmanNextRound,
    resetIfLeavingPhase,
  };
}
