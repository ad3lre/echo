import { describe, expect, it } from 'vitest';
import { ref } from 'vue';
import {
  CODENAMES_SERVER_MODE,
  HANGMAN_SERVER_MODE,
  SKRIGGLES_SERVER_MODE,
  TIC_TAC_TOE_SERVER_MODE,
} from '@shared/vcActivityCatalog';
import { resolveVcGameRoomChannelId } from './resolveVcGameRoomChannelId';
import { isVcGameRoomEnabled } from './vcGameRoomEnabled';
import type {
  VcActivityUiPhase,
  VcActivityUiState,
} from '@/features/voice/vcActivityTypes';

const SERVER_GAME_PHASES: {
  phase: VcActivityUiPhase;
  serverMode: boolean;
}[] = [
  { phase: 'hangman', serverMode: HANGMAN_SERVER_MODE },
  { phase: 'skriggles', serverMode: SKRIGGLES_SERVER_MODE },
  { phase: 'tic_tac_toe', serverMode: TIC_TAC_TOE_SERVER_MODE },
  { phase: 'codenames', serverMode: CODENAMES_SERVER_MODE },
];

/** Shared VC channel id resolution used by every authoritative game-server activity. */
describe('vc server game room channel (all authoritative games)', () => {
  for (const { phase, serverMode } of SERVER_GAME_PHASES) {
    if (!serverMode) continue;

    it(`${phase}: resolves room from connected VC when guild tree lookup misses`, () => {
      const channelId = resolveVcGameRoomChannelId({
        currentVoiceChannelId: 'vc-live',
        findChannelContextById: () => null,
        effectiveActiveChannel: { id: 'text', name: 'general', type: 'text' },
      });
      expect(channelId).toBe('vc-live');
    });

    it(`${phase}: can enable game room once channel id resolves`, () => {
      const channelId = resolveVcGameRoomChannelId({
        currentVoiceChannelId: 'vc-live',
        findChannelContextById: () => null,
        effectiveActiveChannel: { id: 'text', name: 'general', type: 'text' },
      });
      const enabled = isVcGameRoomEnabled({
        serverMode: true,
        isDmVoiceCallUi: ref(false),
        vcActivityUi: ref({ phase } as VcActivityUiState),
        phase,
        gameRoomChannelId: ref(channelId),
        isAuthenticated: () => true,
      });
      expect(enabled).toBe(true);
    });
  }
});
