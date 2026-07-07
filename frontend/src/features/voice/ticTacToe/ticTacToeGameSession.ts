import { computed, type ComputedRef, type Ref } from 'vue';
import type {
  EchoTicTacToeActivityV1,
  EchoTicTacToeInviteV1,
} from '@/audio/voiceEchoLiveKitData';
import { useGameRoom } from '@/features/games/useGameRoom';
import { isVcGameRoomEnabled } from '@/features/games/vcGameRoomEnabled';
import { vcGameRoomConnectionRefs } from '@/features/games/gameRoomSessionConnection';
import type { GameErrorMsg } from '@shared/games';
import { TTT_ACTION, type TttView } from '@shared/games/ticTacToe';
import type {
  VcActivityUiPhase,
  VcActivityUiState,
} from '@/features/voice/vcActivityTypes';
import { TIC_TAC_TOE_SERVER_MODE } from '@shared/vcActivityCatalog';

export type CreateTicTacToeGameSessionOpts = {
  currentUserId: () => string | undefined;
  vcActivityUi: Ref<VcActivityUiState>;
  isDmVoiceCallUi: Ref<boolean>;
  gameRoomChannelId: ComputedRef<string | null>;
  isAuthenticated: () => boolean;
};

export type TicTacToeGameSession = {
  vcTicTacToeActivity: ComputedRef<EchoTicTacToeActivityV1 | null>;
  vcTicTacToePendingInvite: ComputedRef<EchoTicTacToeInviteV1 | null>;
  gameRoomConnected: ComputedRef<boolean>;
  gameRoomLastError: ComputedRef<GameErrorMsg | null>;
  sendVcTicTacToeChallenge: (toUserId: string) => void;
  respondVcTicTacToeInvite: (accept: boolean) => void;
  dismissVcTicTacToeInvite: () => void;
  requestVcTicTacToeMove: (cellIndex: number) => void;
  requestVcTicTacToeRematch: () => void;
  resetIfLeavingPhase: (phase: VcActivityUiPhase) => void;
};

function mapActivity(
  view: TttView,
  rev: number,
  roomId: string,
): EchoTicTacToeActivityV1 | null {
  if (!view.ready) return null;
  return {
    matchId: roomId,
    revision: rev,
    board: view.board,
    status: view.status,
    xUserId: view.xUserId,
    oUserId: view.oUserId,
    currentTurn: view.currentTurn,
  };
}

function mapInvite(view: TttView): EchoTicTacToeInviteV1 | null {
  const inv = view.pendingInvite;
  if (!inv) return null;
  return {
    inviteId: inv.inviteId,
    fromUserId: inv.fromUserId,
    toUserId: inv.toUserId,
  };
}

function createTicTacToeGameRoom(opts: CreateTicTacToeGameSessionOpts) {
  return useGameRoom<TttView>({
    gameKey: 'tic_tac_toe',
    roomId: computed(() => opts.gameRoomChannelId.value),
    enabled: computed(() =>
      isVcGameRoomEnabled({
        serverMode: TIC_TAC_TOE_SERVER_MODE,
        isDmVoiceCallUi: opts.isDmVoiceCallUi,
        vcActivityUi: opts.vcActivityUi,
        phase: 'tic_tac_toe',
        gameRoomChannelId: opts.gameRoomChannelId,
        isAuthenticated: opts.isAuthenticated,
      }),
    ),
  });
}

export function createTicTacToeGameSession(
  opts: CreateTicTacToeGameSessionOpts,
): TicTacToeGameSession {
  const room = createTicTacToeGameRoom(opts);

  const { gameRoomConnected, gameRoomLastError } =
    vcGameRoomConnectionRefs(room);

  const vcTicTacToeActivity = computed(() => {
    const v = room.view.value;
    const ch = opts.gameRoomChannelId.value?.trim() ?? '';
    if (!v || !ch) return null;
    return mapActivity(v, room.rev.value, ch);
  });

  const vcTicTacToePendingInvite = computed(() => {
    const v = room.view.value;
    if (!v) return null;
    return mapInvite(v);
  });

  function sendVcTicTacToeChallenge(toUserId: string): void {
    const to = toUserId.trim();
    if (!to) return;
    room.sendAction(TTT_ACTION.challenge, { toUserId: to });
  }

  function respondVcTicTacToeInvite(accept: boolean): void {
    room.sendAction(
      accept ? TTT_ACTION.acceptInvite : TTT_ACTION.declineInvite,
    );
  }

  function dismissVcTicTacToeInvite(): void {
    room.sendAction(TTT_ACTION.declineInvite);
  }

  function requestVcTicTacToeMove(cellIndex: number): void {
    if (!Number.isInteger(cellIndex) || cellIndex < 0 || cellIndex > 8) return;
    room.sendAction(TTT_ACTION.place, { cell: cellIndex });
  }

  function requestVcTicTacToeRematch(): void {
    room.sendAction(TTT_ACTION.rematch);
  }

  function resetIfLeavingPhase(phase: VcActivityUiPhase): void {
    if (phase !== 'tic_tac_toe') {
      room.view.value = null;
      room.rev.value = 0;
    }
  }

  return {
    vcTicTacToeActivity,
    vcTicTacToePendingInvite,
    gameRoomConnected,
    gameRoomLastError,
    sendVcTicTacToeChallenge,
    respondVcTicTacToeInvite,
    dismissVcTicTacToeInvite,
    requestVcTicTacToeMove,
    requestVcTicTacToeRematch,
    resetIfLeavingPhase,
  };
}
