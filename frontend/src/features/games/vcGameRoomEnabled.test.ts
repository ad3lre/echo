import { describe, expect, it } from 'vitest';
import { ref } from 'vue';
import { isVcGameRoomEnabled } from './vcGameRoomEnabled';
import type { VcActivityUiState } from '@/features/voice/vcActivityTypes';

describe('isVcGameRoomEnabled', () => {
  it('requires voice channel and matching activity phase', () => {
    const vcActivityUi = ref({ phase: 'hangman' } as VcActivityUiState);
    const enabled = isVcGameRoomEnabled({
      serverMode: true,
      isDmVoiceCallUi: ref(false),
      vcActivityUi,
      phase: 'hangman',
      gameRoomChannelId: ref('ch-voice'),
      isAuthenticated: () => true,
    });
    expect(enabled).toBe(true);
  });

  it('is false without a voice channel id', () => {
    const vcActivityUi = ref({ phase: 'hangman' } as VcActivityUiState);
    const enabled = isVcGameRoomEnabled({
      serverMode: true,
      isDmVoiceCallUi: ref(false),
      vcActivityUi,
      phase: 'hangman',
      gameRoomChannelId: ref(null),
      isAuthenticated: () => true,
    });
    expect(enabled).toBe(false);
  });

  it('is false when not authenticated', () => {
    const vcActivityUi = ref({ phase: 'hangman' } as VcActivityUiState);
    const enabled = isVcGameRoomEnabled({
      serverMode: true,
      isDmVoiceCallUi: ref(false),
      vcActivityUi,
      phase: 'hangman',
      gameRoomChannelId: ref('ch-voice'),
      isAuthenticated: () => false,
    });
    expect(enabled).toBe(false);
  });
});
