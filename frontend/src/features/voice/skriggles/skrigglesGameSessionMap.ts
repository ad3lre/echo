import type {
  EchoSkrigglesActivityV1,
  EchoSkrigglesCanvasCmdV1,
  EchoSkrigglesCanvasSnapshotV1,
  EchoSkrigglesStrokeBatchV1,
} from '@/audio/voiceEchoLiveKitData';
import type { SkrigglesCanvasEvent } from '@/features/voice/skriggles/skrigglesVoiceSession';
import {
  SKRIGGLES_ACTION,
  SKRIGGLES_RELAY_KIND,
  type SkrigglesView,
} from '@shared/games/skriggles';
import type { ShallowRef } from 'vue';

export function mapSkrigglesActivity(
  view: SkrigglesView,
  rev: number,
  fromUserId: string,
): EchoSkrigglesActivityV1 {
  return {
    v: 1,
    t: 'skriggles_activity',
    updatedAt: Date.now(),
    revision: rev,
    fromUserId,
    roundSeq: view.roundSeq,
    rosterUserIds: view.rosterUserIds,
    phase: view.phase,
    settings: view.settings,
    scores: view.scores,
    drawerUserId: view.drawerUserId,
    wordChoices: view.wordChoices,
    wordHint: view.wordHint,
    phaseEndsAt: view.phaseEndsAt,
    chatLog: view.chatLog,
    roundResult: view.roundResult,
    canvasStrokeSeq: view.canvasStrokeSeq,
    correctGuessersThisRound: view.correctGuessersThisRound,
    hintRevealed: view.hintRevealed,
  };
}

export function pushSkrigglesCanvasEvent(
  events: ShallowRef<SkrigglesCanvasEvent[]>,
  event: SkrigglesCanvasEvent,
): void {
  const next = [...events.value, event];
  events.value = next.length > 200 ? next.slice(next.length - 200) : next;
}

export function handleSkrigglesRelayEvent(
  events: ShallowRef<SkrigglesCanvasEvent[]>,
  data: Record<string, unknown>,
): void {
  const type = data.type;
  if (type === SKRIGGLES_ACTION.strokeBatch && data.payload) {
    pushSkrigglesCanvasEvent(events, {
      kind: 'stroke',
      batch: data.payload as EchoSkrigglesStrokeBatchV1,
    });
    return;
  }
  if (type === SKRIGGLES_ACTION.canvasCmd && data.payload) {
    pushSkrigglesCanvasEvent(events, {
      kind: 'cmd',
      cmd: data.payload as EchoSkrigglesCanvasCmdV1,
    });
    return;
  }
  if (type === SKRIGGLES_ACTION.canvasSnapshot && data.payload) {
    pushSkrigglesCanvasEvent(events, {
      kind: 'snapshot',
      snapshot: data.payload as EchoSkrigglesCanvasSnapshotV1,
    });
  }
}

export { SKRIGGLES_RELAY_KIND };
