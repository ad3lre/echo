import { watch, type Ref } from 'vue';
import { YOUTUBE_INTEGRATION_ENABLED } from '@shared/integrationKillSwitches';
import { ECHOED_NAMES_VC_ACTIVITY_ENABLED } from '@shared/vcActivityCatalog';
import type {
  VcActivityPresenceKind,
  VcActivityUiPhase,
} from '@/features/voice/vcActivityTypes';
import { vcIframeEmbedTitle } from '@/features/voice/vcActivityTypes';

/** Prefer in-progress games over passive surfaces when multiple badges are present. */
const PRESENCE_KIND_PRIORITY: readonly VcActivityPresenceKind[] = [
  'codenames',
  'hangman',
  'skriggles',
  'tic_tac_toe',
  'wordle',
  'skribbl_io',
  'gartic_phone',
  'krunker',
  'openguessr',
  'richup',
  'goober_dash',
  'smash_karts',
  'cluster_rush',
  'youtube',
  'activities',
];

export function primaryVcActivityPresenceKind(
  kinds: readonly VcActivityPresenceKind[],
): VcActivityPresenceKind | null {
  const visible = YOUTUBE_INTEGRATION_ENABLED
    ? kinds
    : kinds.filter((k) => k !== 'youtube');
  if (!visible.length) return null;
  for (const preferred of PRESENCE_KIND_PRIORITY) {
    if (visible.includes(preferred)) return preferred;
  }
  return visible[0] ?? null;
}

export function vcActivityPresenceKindToPhase(
  kind: VcActivityPresenceKind,
): VcActivityUiPhase | null {
  if (kind === 'activities') return 'pick';
  return kind;
}

export function vcActivityJoinLabel(kind: VcActivityPresenceKind): string {
  switch (kind) {
    case 'youtube':
      return 'Watch together';
    case 'activities':
      return 'Activities';
    case 'wordle':
      return 'Wordline';
    case 'hangman':
      return 'Hangman';
    case 'skriggles':
      return 'Skriggles';
    case 'tic_tac_toe':
      return 'Tic Tac Echo';
    case 'codenames':
      return 'Echoed Names';
    case 'openguessr':
    case 'skribbl_io':
    case 'gartic_phone':
    case 'krunker':
    case 'richup':
    case 'goober_dash':
    case 'smash_karts':
    case 'cluster_rush':
      return vcIframeEmbedTitle(kind);
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}

export type VcActivityPhaseOpeners = {
  openVcActivityPicker: () => void;
  openVcActivityYoutubeBrowse: () => void;
  openVcActivityWordle: () => void;
  openVcActivityHangman: () => void;
  openVcActivitySkriggles: () => void;
  openVcActivityTicTacToe: () => void;
  openVcActivityOpenGuessr: () => void;
  openVcActivitySkribblIo: () => void;
  openVcActivityGarticPhone: () => void;
  openVcActivityKrunker: () => void;
  openVcActivityCodenames: () => void;
  openVcActivityRichup: () => void;
  openVcActivityGooberDash: () => void;
  openVcActivitySmashKarts: () => void;
  openVcActivityClusterRush: () => void;
  closeVcActivity: () => void;
};

/** Open the guild VC activity surface for `phase` (voice should already be connected). */
export function applyVcActivityUiPhase(
  phase: VcActivityUiPhase,
  openers: VcActivityPhaseOpeners,
): void {
  switch (phase) {
    case 'closed':
      openers.closeVcActivity();
      return;
    case 'pick':
      openers.openVcActivityPicker();
      return;
    case 'youtube':
      if (YOUTUBE_INTEGRATION_ENABLED) {
        openers.openVcActivityYoutubeBrowse();
      } else {
        openers.openVcActivityPicker();
      }
      return;
    case 'wordle':
      openers.openVcActivityWordle();
      return;
    case 'hangman':
      openers.openVcActivityHangman();
      return;
    case 'skriggles':
      openers.openVcActivitySkriggles();
      return;
    case 'tic_tac_toe':
      openers.openVcActivityTicTacToe();
      return;
    case 'openguessr':
      openers.openVcActivityOpenGuessr();
      return;
    case 'skribbl_io':
      openers.openVcActivitySkribblIo();
      return;
    case 'gartic_phone':
      openers.openVcActivityGarticPhone();
      return;
    case 'krunker':
      openers.openVcActivityKrunker();
      return;
    case 'codenames':
      if (ECHOED_NAMES_VC_ACTIVITY_ENABLED) {
        openers.openVcActivityCodenames();
      } else {
        openers.openVcActivityPicker();
      }
      return;
    case 'richup':
      openers.openVcActivityRichup();
      return;
    case 'goober_dash':
      openers.openVcActivityGooberDash();
      return;
    case 'smash_karts':
      openers.openVcActivitySmashKarts();
      return;
    case 'cluster_rush':
      openers.openVcActivityClusterRush();
      return;
    default: {
      const _exhaustive: never = phase;
      return _exhaustive;
    }
  }
}

/** Wait until guild voice LiveKit is connected (best-effort; used after join-from-profile). */
export async function waitForLiveKitConnected(
  roomState: Ref<string>,
  timeoutMs = 20_000,
): Promise<boolean> {
  if (roomState.value === 'connected') return true;
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      stop();
      resolve(roomState.value === 'connected');
    }, timeoutMs);
    const stop = watch(
      roomState,
      (s) => {
        if (s === 'connected') {
          clearTimeout(timer);
          stop();
          resolve(true);
        }
      },
      { immediate: true },
    );
  });
}
