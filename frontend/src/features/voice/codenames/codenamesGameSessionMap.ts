import type { EchoCodenamesActivityV1 } from '@/audio/voiceEchoLiveKitData';
import type { CodenamesView } from '@shared/games/codenames';

export function mapCodenamesActivity(
  view: CodenamesView,
  rev: number,
  fromUserId: string,
): EchoCodenamesActivityV1 {
  return {
    v: 1,
    t: 'codenames_activity',
    updatedAt: Date.now(),
    revision: rev,
    fromUserId,
    gameSeq: view.gameSeq,
    rosterUserIds: view.rosterUserIds,
    phase: view.phase,
    turnStage: view.turnStage,
    cells: view.cells,
    startingTeam: view.startingTeam,
    currentTeam: view.currentTeam,
    winner: view.winner,
    currentClue: view.currentClue,
    guessesRemaining: view.guessesRemaining,
    roleAssignments: view.roleAssignments,
    ...(view.lastEvent ? { lastEvent: view.lastEvent } : {}),
  };
}

export function requireOrchestratorView(
  view: CodenamesView | null,
): CodenamesView | null {
  if (!view?.youAreOrchestrator) return null;
  return view;
}
