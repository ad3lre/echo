import {
  computed,
  shallowRef,
  type ComputedRef,
  type Ref,
  type ShallowRef,
} from 'vue';
import type {
  EchoSkrigglesActivityV1,
  EchoSkrigglesCanvasCmdV1,
  EchoSkrigglesCanvasSnapshotV1,
  EchoSkrigglesSettingsV1,
  EchoSkrigglesStrokeBatchV1,
} from '@/audio/voiceEchoLiveKitData';
import type { LiveKitRoomState } from '@/composables/useLiveKitVoiceRoom';
import { useGameRoom } from '@/features/games/useGameRoom';
import type { GameRoomApi } from '@/features/games/useGameRoom';
import { normalizeSkrigglesWord } from '@/features/voice/skriggles/vcSkrigglesGuess';
import type { SkrigglesCanvasEvent } from '@/features/voice/skriggles/skrigglesVoiceSession';
import {
  handleSkrigglesRelayEvent,
  mapSkrigglesActivity,
  SKRIGGLES_RELAY_KIND,
} from '@/features/voice/skriggles/skrigglesGameSessionMap';
import type {
  VcActivityUiPhase,
  VcActivityUiState,
} from '@/features/voice/vcActivityTypes';
import { vcActivityPresenceKindsFromUi } from '@/features/voice/vcActivityTypes';
import { SKRIGGLES_ACTION, type SkrigglesView } from '@shared/games/skriggles';
import { SKRIGGLES_SERVER_MODE } from '@shared/vcActivityCatalog';

export type CreateSkrigglesGameSessionOpts = {
  currentUserId: () => string | undefined;
  vcActivityUi: Ref<VcActivityUiState>;
  vcActivityPresenceByUserId: Ref<Map<string, readonly string[]>>;
  isDmVoiceCallUi: Ref<boolean>;
  currentVoiceChannelId: Ref<string | null>;
  liveKitState: Ref<LiveKitRoomState>;
  accessToken: () => string | undefined;
  resolveGuildVoiceServerId: (channelId: string) => string;
};

export type SkrigglesGameSession = {
  vcSkrigglesActivity: ComputedRef<EchoSkrigglesActivityV1 | null>;
  skrigglesRosterUserIds: ComputedRef<string[]>;
  skrigglesCanvasEvents: ShallowRef<SkrigglesCanvasEvent[]>;
  commitSkrigglesWordChoice: (word: string) => void;
  submitSkrigglesGuess: (guess: string) => void;
  updateSkrigglesSettings: (settings: Partial<EchoSkrigglesSettingsV1>) => void;
  startSkrigglesGame: () => void;
  advanceSkrigglesRound: () => void;
  publishSkrigglesStrokeBatch: (batch: EchoSkrigglesStrokeBatchV1) => void;
  publishSkrigglesCanvasCmd: (cmd: EchoSkrigglesCanvasCmdV1) => void;
  publishSkrigglesCanvasSnapshot: (
    snapshot: EchoSkrigglesCanvasSnapshotV1,
  ) => void;
  tickSkrigglesTimers: () => void;
  resetSkrigglesIfLeavingPhase: (phase: VcActivityUiPhase) => void;
  scheduleSkrigglesBootstrap: () => void;
  tryApplySkrigglesRemote: () => void;
  onSkrigglesGuessIntent: () => void;
  onSkrigglesWordChoiceIntent: () => void;
  onSkrigglesSettingsIntent: () => void;
  onSkrigglesStartIntent: () => void;
  onSkrigglesNextRoundIntent: () => void;
  receiveSkrigglesRoundSecret: () => void;
  onSkrigglesStrokeBatch: () => void;
  onSkrigglesCanvasCmd: () => void;
  onSkrigglesCanvasSnapshot: () => void;
};

function skrigglesRosterFromPresence(
  opts: CreateSkrigglesGameSessionOpts,
): string[] {
  const out = new Set<string>();
  const self = opts.currentUserId()?.trim();
  const ui = opts.vcActivityUi.value;
  if (self && ui.phase === 'skriggles') {
    if (vcActivityPresenceKindsFromUi(ui).includes('skriggles')) out.add(self);
  }
  for (const [id, acts] of opts.vcActivityPresenceByUserId.value) {
    const uid = id.trim();
    if (!uid) continue;
    if (acts.includes('skriggles')) out.add(uid);
  }
  return [...out].sort((a, b) => a.localeCompare(b));
}

function useSkrigglesRoom(
  opts: CreateSkrigglesGameSessionOpts,
  canvasEvents: ShallowRef<SkrigglesCanvasEvent[]>,
): GameRoomApi<SkrigglesView> {
  return useGameRoom<SkrigglesView>({
    gameKey: 'skriggles',
    roomId: computed(() => opts.currentVoiceChannelId.value),
    serverId: computed(() => {
      const ch = opts.currentVoiceChannelId.value?.trim() ?? '';
      return ch ? opts.resolveGuildVoiceServerId(ch) : null;
    }),
    accessToken: computed(() => opts.accessToken()?.trim() ?? null),
    enabled: computed(
      () =>
        SKRIGGLES_SERVER_MODE &&
        !opts.isDmVoiceCallUi.value &&
        opts.vcActivityUi.value.phase === 'skriggles' &&
        opts.liveKitState.value === 'connected' &&
        !!(
          opts.currentVoiceChannelId.value?.trim() && opts.accessToken()?.trim()
        ),
    ),
    onEvent: (msg) => {
      if (msg.kind !== SKRIGGLES_RELAY_KIND || !msg.data) return;
      handleSkrigglesRelayEvent(
        canvasEvents,
        msg.data as Record<string, unknown>,
      );
    },
  });
}

function buildSkrigglesGameplay(
  room: GameRoomApi<SkrigglesView>,
  opts: CreateSkrigglesGameSessionOpts,
) {
  function relayCanvas(type: string, roundSeq: number, payload: unknown): void {
    room.sendAction(type, { roundSeq, payload });
  }

  return {
    commitSkrigglesWordChoice(word: string) {
      const v = room.view.value;
      if (!v || !v.youAreDrawer || v.phase !== 'word_pick') return;
      room.sendAction(SKRIGGLES_ACTION.wordChoice, {
        word: normalizeSkrigglesWord(word),
      });
    },
    submitSkrigglesGuess(guess: string) {
      const v = room.view.value;
      const self = opts.currentUserId()?.trim() ?? '';
      if (!v || !self || v.phase !== 'drawing' || v.youAreDrawer) return;
      const text = guess.trim();
      if (!text) return;
      room.sendAction(SKRIGGLES_ACTION.guess, { guess: text.slice(0, 64) });
    },
    updateSkrigglesSettings(settings: Partial<EchoSkrigglesSettingsV1>) {
      if (!room.view.value?.youAreOrchestrator) return;
      room.sendAction(SKRIGGLES_ACTION.settings, { settings });
    },
    startSkrigglesGame() {
      if (!room.view.value?.youAreOrchestrator) return;
      room.sendAction(SKRIGGLES_ACTION.start);
    },
    advanceSkrigglesRound() {
      const v = room.view.value;
      if (!v || v.phase !== 'round_reveal' || !v.youAreOrchestrator) return;
      room.sendAction(SKRIGGLES_ACTION.nextRound, {
        completedRoundSeq: v.roundSeq,
      });
    },
    publishSkrigglesStrokeBatch(batch: EchoSkrigglesStrokeBatchV1) {
      relayCanvas(SKRIGGLES_ACTION.strokeBatch, batch.roundSeq, batch);
    },
    publishSkrigglesCanvasCmd(cmd: EchoSkrigglesCanvasCmdV1) {
      relayCanvas(SKRIGGLES_ACTION.canvasCmd, cmd.roundSeq, cmd);
    },
    publishSkrigglesCanvasSnapshot(snapshot: EchoSkrigglesCanvasSnapshotV1) {
      relayCanvas(SKRIGGLES_ACTION.canvasSnapshot, snapshot.roundSeq, snapshot);
    },
  };
}

const noop = (): void => {};

export function createSkrigglesGameSession(
  opts: CreateSkrigglesGameSessionOpts,
): SkrigglesGameSession {
  const skrigglesCanvasEvents = shallowRef<SkrigglesCanvasEvent[]>([]);
  const room = useSkrigglesRoom(opts, skrigglesCanvasEvents);
  const gameplay = buildSkrigglesGameplay(room, opts);

  const vcSkrigglesActivity = computed(() => {
    const v = room.view.value;
    const self = opts.currentUserId()?.trim() ?? '';
    if (!v || !self) return null;
    return mapSkrigglesActivity(v, room.rev.value, self);
  });

  return {
    vcSkrigglesActivity,
    skrigglesRosterUserIds: computed(() => skrigglesRosterFromPresence(opts)),
    skrigglesCanvasEvents,
    ...gameplay,
    tickSkrigglesTimers: noop,
    resetSkrigglesIfLeavingPhase(phase) {
      if (phase === 'skriggles') return;
      skrigglesCanvasEvents.value = [];
      room.view.value = null;
      room.rev.value = 0;
    },
    scheduleSkrigglesBootstrap: noop,
    tryApplySkrigglesRemote: noop,
    onSkrigglesGuessIntent: noop,
    onSkrigglesWordChoiceIntent: noop,
    onSkrigglesSettingsIntent: noop,
    onSkrigglesStartIntent: noop,
    onSkrigglesNextRoundIntent: noop,
    receiveSkrigglesRoundSecret: noop,
    onSkrigglesStrokeBatch: noop,
    onSkrigglesCanvasCmd: noop,
    onSkrigglesCanvasSnapshot: noop,
  };
}
