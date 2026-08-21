import {
  computed,
  ref,
  unref,
  watch,
  type ComputedRef,
  type MaybeRef,
} from 'vue';
import type { EchoWorkspaceEventSummary } from '@/api/echoClient';
import type { VcActivityUiState } from '@/features/voice/vcActivityTypes';
import {
  isStageEventLive,
  pickNearestStagePlanningEvent,
} from '@/features/voice/stage/stageLobbyUtils';

export type StageVcLobbyDismissMode =
  | 'voice_only'
  | 'youtube_live'
  | 'planned_event'
  | 'schedule_event';

export type UseStageVcLobbyOpts = {
  isStageChannel: ComputedRef<boolean>;
  channelId: ComputedRef<string>;
  serverId: ComputedRef<string>;
  upcomingEvents: ComputedRef<readonly EchoWorkspaceEventSummary[]>;
  vcActivityUi: MaybeRef<VcActivityUiState>;
  /** Any participant already running a VC activity in this channel. */
  channelHasActiveVcActivity: ComputedRef<boolean>;
  /** LiveKit session is active in this stage channel — skip pre-join lobby. */
  voiceConnectedToChannel: ComputedRef<boolean>;
};

export function useStageVcLobby(opts: UseStageVcLobbyOpts) {
  const lobbyDismissed = ref(false);
  const activeStageEvent = ref<EchoWorkspaceEventSummary | null>(null);
  const nowMs = ref(Date.now());
  let clockTimer: ReturnType<typeof setInterval> | null = null;

  function startClock() {
    stopClock();
    nowMs.value = Date.now();
    clockTimer = setInterval(() => {
      nowMs.value = Date.now();
    }, 30_000);
  }

  function stopClock() {
    if (clockTimer) {
      clearInterval(clockTimer);
      clockTimer = null;
    }
  }

  const planningEvent = computed(() =>
    pickNearestStagePlanningEvent(
      opts.upcomingEvents.value,
      opts.channelId.value,
      nowMs.value,
    ),
  );

  const planningEventIsLive = computed(() => {
    const ev = planningEvent.value;
    return ev ? isStageEventLive(ev, nowMs.value) : false;
  });

  watch(
    () => opts.channelId.value,
    () => {
      lobbyDismissed.value = false;
      activeStageEvent.value = null;
    },
  );

  watch(
    planningEventIsLive,
    (live) => {
      if (!live || !planningEvent.value) return;
      lobbyDismissed.value = true;
      activeStageEvent.value = planningEvent.value;
    },
    { immediate: true },
  );

  watch(
    () => opts.isStageChannel.value,
    (on) => {
      if (on) startClock();
      else stopClock();
    },
    { immediate: true },
  );

  const showLobby = computed(() => {
    if (!opts.isStageChannel.value) return false;
    if (!opts.channelId.value.trim()) return false;
    if (opts.voiceConnectedToChannel.value) return false;
    if (lobbyDismissed.value) return false;
    if (unref(opts.vcActivityUi).phase !== 'closed') return false;
    if (opts.channelHasActiveVcActivity.value) return false;
    return true;
  });

  function dismissLobby(
    mode: StageVcLobbyDismissMode,
    event?: EchoWorkspaceEventSummary | null,
  ) {
    lobbyDismissed.value = true;
    if (mode === 'planned_event' && event) {
      activeStageEvent.value = event;
    } else if (
      mode === 'voice_only' ||
      mode === 'youtube_live' ||
      mode === 'schedule_event'
    ) {
      activeStageEvent.value = null;
    }
  }

  return {
    showLobby,
    planningEvent,
    planningEventIsLive,
    activeStageEvent,
    nowMs,
    dismissLobby,
    stopClock,
  };
}
