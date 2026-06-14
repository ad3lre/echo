import type { RailTab } from '@/features/layout/mainSurface';
import {
  isPerfHarnessEnabled,
  perfHarnessRecordChatSwitch,
} from '@/observability/perfHarness';
import { emitDiagnostic, newTraceId } from '@/observability/sessionDiagnostics';

// Chrome DevTools exposes non-standard `console.profile`/`profileEnd` that the
// lib.dom typings omit; narrow to an optional shape rather than reaching for any.
type DevtoolsConsole = Console & {
  profile?: (label: string) => void;
  profileEnd?: (label: string) => void;
};

type PerfDumpWindow = Window & { dumpPerf?: () => void };

type ChatSwitchSnapshot = {
  switchId: number;
  traceId: string;
  rail: RailTab;
  selectedServerId: string | null;
  channelId: string;
  mainSurfaceType: string;
  startedAtMs: number;
  timerLabel: string;
  shouldProfile: boolean;
};

let nextChatSwitchId = 0;
let activeChatSwitch: ChatSwitchSnapshot | null = null;

function nowMs(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

function shouldProfileChatSwitch(): boolean {
  if (typeof window === 'undefined') return false;
  const w = window as unknown as { __echoProfileChatSwitch?: boolean };
  if (w.__echoProfileChatSwitch === true) return true;
  try {
    const params = new URLSearchParams(window.location.search);
    return params.get('profileChatSwitch') === '1';
  } catch {
    return false;
  }
}

export function beginChatSwitch(params: {
  rail: RailTab;
  selectedServerId: string | null;
  channelId: string;
  mainSurfaceType: string;
}): ChatSwitchSnapshot | null {
  const channelId = params.channelId.trim();
  if (!channelId) return null;
  const switchId = ++nextChatSwitchId;
  const timerLabel = `ServerSwitchTotal#${switchId}`;
  const profileEnabled = shouldProfileChatSwitch();
  const snapshot: ChatSwitchSnapshot = {
    switchId,
    traceId: newTraceId(),
    rail: params.rail,
    selectedServerId: params.selectedServerId,
    channelId,
    mainSurfaceType: params.mainSurfaceType,
    startedAtMs: nowMs(),
    timerLabel,
    shouldProfile: profileEnabled,
  };
  activeChatSwitch = snapshot;

  if (typeof performance !== 'undefined' && performance.mark) {
    performance.mark(`chat-switch-start-${snapshot.switchId}`);
  }
  if (
    profileEnabled &&
    typeof console !== 'undefined' &&
    typeof console.time === 'function'
  ) {
    console.time(timerLabel);
  }
  if (
    profileEnabled &&
    typeof console !== 'undefined' &&
    (console as DevtoolsConsole).profile
  ) {
    (console as DevtoolsConsole).profile?.(`chat-switch-${snapshot.switchId}`);
  }

  if (profileEnabled) {
    const style =
      'background: #222; color: #bada55; font-weight: bold; padding: 2px 4px; border-radius: 3px;';
    console.log(`%c[ChatSwitch] Start #${snapshot.switchId}`, style, {
      channelId,
      server: params.selectedServerId,
      time: snapshot.startedAtMs,
    });
  }

  emitDiagnostic({
    level: 'info',
    domain: 'perf',
    event: 'chat_switch_start',
    stage: 'start',
    traceId: snapshot.traceId,
    context: {
      switchId: snapshot.switchId,
      rail: snapshot.rail,
      selectedServerId: snapshot.selectedServerId,
      channelId: snapshot.channelId,
      mainSurfaceType: snapshot.mainSurfaceType,
    },
  });
  if (isPerfHarnessEnabled()) {
    perfHarnessRecordChatSwitch({
      event: 'chat_switch_start',
      durationMs: 0,
      context: {
        switchId: snapshot.switchId,
        channelId: snapshot.channelId,
        selectedServerId: snapshot.selectedServerId,
      },
    });
  }
  return snapshot;
}

export function getActiveChatSwitchSnapshot(): ChatSwitchSnapshot | null {
  return activeChatSwitch;
}

export function isActiveChatSwitchChannel(
  channelId: string | null | undefined,
): boolean {
  const cid = channelId?.trim() ?? '';
  return !!activeChatSwitch && !!cid && activeChatSwitch.channelId === cid;
}

export function emitChatSwitchEvent(params: {
  event:
    | 'chat_switch_ui_rendered'
    | 'chat_switch_fetch_start'
    | 'chat_switch_fetch_end'
    | 'chat_switch_merge_done'
    | 'chat_switch_first_message_visible';
  channelId?: string | null;
  context?: Record<string, unknown>;
}): void {
  const snapshot = activeChatSwitch;
  if (!snapshot) return;
  if (
    params.channelId != null &&
    params.channelId.trim().length > 0 &&
    snapshot.channelId !== params.channelId.trim()
  ) {
    return;
  }
  const durationMs = Math.max(0, Math.round(nowMs() - snapshot.startedAtMs));
  if (snapshot.shouldProfile) {
    const style =
      'background: #222; color: #00bcd4; font-weight: bold; padding: 2px 4px; border-radius: 3px;';
    console.log(
      `%c[ChatSwitch] ${params.event} (+${durationMs}ms)`,
      style,
      params.context ?? {},
    );
  }

  if (params.event === 'chat_switch_ui_rendered') {
    if (
      typeof performance !== 'undefined' &&
      performance.mark &&
      performance.measure
    ) {
      performance.mark(`chat-switch-ui-rendered-${snapshot.switchId}`);
      try {
        performance.measure(
          `ChatSwitchTotalUI-${snapshot.switchId}`,
          `chat-switch-start-${snapshot.switchId}`,
          `chat-switch-ui-rendered-${snapshot.switchId}`,
        );
      } catch (e) {
        void e;
      }
    }
    if (
      snapshot.shouldProfile &&
      typeof console !== 'undefined' &&
      (console as DevtoolsConsole).profileEnd
    ) {
      (console as DevtoolsConsole).profileEnd?.(
        `chat-switch-${snapshot.switchId}`,
      );
    }
  }

  if (params.event === 'chat_switch_first_message_visible') {
    if (
      snapshot.shouldProfile &&
      typeof console !== 'undefined' &&
      typeof console.timeEnd === 'function'
    ) {
      try {
        console.timeEnd(snapshot.timerLabel);
      } catch (e) {
        void e;
      }
    }
  }

  emitDiagnostic({
    level: 'info',
    domain: 'perf',
    event: params.event,
    stage: 'success',
    traceId: snapshot.traceId,
    durationMs,
    context: {
      switchId: snapshot.switchId,
      rail: snapshot.rail,
      selectedServerId: snapshot.selectedServerId,
      channelId: snapshot.channelId,
      mainSurfaceType: snapshot.mainSurfaceType,
      ...(params.context ?? {}),
    },
  });

  if (isPerfHarnessEnabled()) {
    // Forward every phase (fetch_start → fetch_end → merge_done → ui_rendered →
    // first_message_visible) so a baseline run can split "data ready" from
    // "rendered" instead of seeing only the collapsed total.
    perfHarnessRecordChatSwitch({
      event: params.event,
      durationMs,
      context: {
        switchId: snapshot.switchId,
        channelId: snapshot.channelId,
        ...(params.context ?? {}),
      },
    });
  }
}

if (typeof window !== 'undefined') {
  (window as PerfDumpWindow).dumpPerf = () => {
    const entries = performance.getEntriesByType('measure');
    const sorted = entries.sort((a, b) => b.duration - a.duration).slice(0, 10);
    console.table(
      sorted.map((e) => ({
        name: e.name,
        duration: `${e.duration.toFixed(2)}ms`,
      })),
    );
  };
}
