import { computed, type ComputedRef, type Ref } from 'vue';
import type { EchoCodenamesRoleAssignmentV1 } from '@/audio/voiceEchoLiveKitData';
import type { LiveKitRoomState } from '@/composables/useLiveKitVoiceRoom';
import { useGameRoom } from '@/features/games/useGameRoom';
import { isVcGameRoomEnabled } from '@/features/games/vcGameRoomEnabled';
import { vcGameRoomConnectionRefs } from '@/features/games/gameRoomSessionConnection';
import type { GameErrorMsg } from '@shared/games';
import { CODENAMES_ACTION, type CodenamesView } from '@shared/games/codenames';
import { CODENAMES_SERVER_MODE } from '@shared/vcActivityCatalog';
import type {
  VcActivityUiPhase,
  VcActivityUiState,
} from '@/features/voice/vcActivityTypes';
import {
  mapCodenamesActivity,
  requireOrchestratorView,
} from '@/features/voice/codenames/codenamesGameSessionMap';
import type { GameRoomApi } from '@/features/games/useGameRoom';

export type CreateCodenamesGameSessionOpts = {
  currentUserId: () => string | undefined;
  vcActivityUi: Ref<VcActivityUiState>;
  isDmVoiceCallUi: Ref<boolean>;
  gameRoomChannelId: ComputedRef<string | null>;
  isAuthenticated: () => boolean;
};

export type CodenamesGameSession = {
  vcCodenamesActivity: ComputedRef<
    import('@/audio/voiceEchoLiveKitData').EchoCodenamesActivityV1 | null
  >;
  vcCodenamesSpymasterKey: ComputedRef<
    import('@/audio/voiceEchoLiveKitData').EchoCodenamesAffiliationV1[] | null
  >;
  gameRoomConnected: ComputedRef<boolean>;
  gameRoomLastError: ComputedRef<GameErrorMsg | null>;
  requestVcCodenamesSetup: (
    assignments: EchoCodenamesRoleAssignmentV1[],
  ) => void;
  commitVcCodenamesDeal: () => string | null;
  requestVcCodenamesClue: (word: string, number: number) => void;
  requestVcCodenamesReveal: (cardIndex: number) => void;
  requestVcCodenamesEndTurn: () => void;
  requestVcCodenamesNewGame: () => void;
  requestVcCodenamesPushKeyToOrchestrator: () => void;
  resetIfLeavingPhase: (phase: VcActivityUiPhase) => void;
};

function useCodenamesRoom(
  opts: CreateCodenamesGameSessionOpts,
): GameRoomApi<CodenamesView> {
  return useGameRoom<CodenamesView>({
    gameKey: 'codenames',
    roomId: computed(() => opts.gameRoomChannelId.value),
    enabled: computed(() =>
      isVcGameRoomEnabled({
        serverMode: CODENAMES_SERVER_MODE,
        isDmVoiceCallUi: opts.isDmVoiceCallUi,
        vcActivityUi: opts.vcActivityUi,
        phase: 'codenames',
        gameRoomChannelId: opts.gameRoomChannelId,
        isAuthenticated: opts.isAuthenticated,
      }),
    ),
  });
}

function buildCodenamesActions(
  room: GameRoomApi<CodenamesView>,
): Omit<
  CodenamesGameSession,
  | 'vcCodenamesActivity'
  | 'vcCodenamesSpymasterKey'
  | 'gameRoomConnected'
  | 'gameRoomLastError'
  | 'resetIfLeavingPhase'
> {
  return {
    requestVcCodenamesSetup(assignments) {
      if (!requireOrchestratorView(room.view.value)) return;
      room.sendAction(CODENAMES_ACTION.setup, { roleAssignments: assignments });
    },
    commitVcCodenamesDeal() {
      const v = requireOrchestratorView(room.view.value);
      if (!v) return 'Only the session host can deal cards.';
      if (v.phase !== 'lobby') return 'Game is not ready to deal.';
      if (!v.roleAssignments.length) return 'Assign roles first.';
      room.sendAction(CODENAMES_ACTION.deal);
      return null;
    },
    requestVcCodenamesClue(word, number) {
      const v = room.view.value;
      if (!v || v.phase !== 'playing' || !v.youAreSpymaster) return;
      room.sendAction(CODENAMES_ACTION.clue, { word, number });
    },
    requestVcCodenamesReveal(cardIndex) {
      const v = room.view.value;
      if (!v || v.phase !== 'playing' || v.turnStage !== 'await_guess') return;
      if (!v.youAreOperative && !v.youAreSpymaster) return;
      room.sendAction(CODENAMES_ACTION.reveal, { cardIndex });
    },
    requestVcCodenamesEndTurn() {
      const v = room.view.value;
      if (!v || v.phase !== 'playing' || v.turnStage !== 'await_guess') return;
      if (!v.youAreOperative) return;
      room.sendAction(CODENAMES_ACTION.endTurn);
    },
    requestVcCodenamesNewGame() {
      const v = requireOrchestratorView(room.view.value);
      if (!v) return;
      room.sendAction(CODENAMES_ACTION.newGame, {
        completedGameSeq: v.gameSeq,
      });
    },
    requestVcCodenamesPushKeyToOrchestrator() {
      void room.view.value?.spymasterKey;
    },
  };
}

export function createCodenamesGameSession(
  opts: CreateCodenamesGameSessionOpts,
): CodenamesGameSession {
  const room = useCodenamesRoom(opts);
  const actions = buildCodenamesActions(room);
  const { gameRoomConnected, gameRoomLastError } =
    vcGameRoomConnectionRefs(room);

  const vcCodenamesActivity = computed(() => {
    const v = room.view.value;
    const self = opts.currentUserId()?.trim() ?? '';
    if (!v || !self) return null;
    return mapCodenamesActivity(v, room.rev.value, self);
  });

  return {
    vcCodenamesActivity,
    vcCodenamesSpymasterKey: computed(
      () => room.view.value?.spymasterKey ?? null,
    ),
    gameRoomConnected,
    gameRoomLastError,
    ...actions,
    resetIfLeavingPhase(phase) {
      if (phase !== 'codenames') {
        room.view.value = null;
        room.rev.value = 0;
      }
    },
  };
}
