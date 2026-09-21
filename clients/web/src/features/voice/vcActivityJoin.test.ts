import { describe, expect, it } from 'vitest';
import { nextTick, ref } from 'vue';
import {
  primaryVcActivityPresenceKind,
  vcActivityJoinLabel,
  vcActivityPresenceKindToPhase,
  waitForLiveKitConnected,
} from '@/features/voice/vcActivityJoin';

describe('vcActivityJoin', () => {
  it('prefers in-progress games over youtube', () => {
    expect(
      primaryVcActivityPresenceKind(['youtube', 'hangman', 'activities']),
    ).toBe('hangman');
    expect(
      primaryVcActivityPresenceKind(['youtube', 'skriggles', 'skribbl_io']),
    ).toBe('skriggles');
  });

  it('maps skriggles presence to phase', () => {
    expect(vcActivityPresenceKindToPhase('skriggles')).toBe('skriggles');
  });

  it('maps presence kinds to UI phases', () => {
    expect(vcActivityPresenceKindToPhase('activities')).toBe('pick');
    expect(vcActivityPresenceKindToPhase('codenames')).toBe('codenames');
  });

  it('labels join copy for native games', () => {
    expect(vcActivityJoinLabel('wordle')).toBe('Wordline');
    expect(vcActivityJoinLabel('hangman')).toBe('Hangman');
    expect(vcActivityJoinLabel('skriggles')).toBe('Skriggles');
    expect(vcActivityJoinLabel('tic_tac_toe')).toBe('Tic Tac Echo');
  });

  it('does not wait for the timeout after a terminal connection failure', async () => {
    const state = ref('connecting');
    const connected = waitForLiveKitConnected(state, 10_000);
    state.value = 'error';
    await nextTick();
    await expect(connected).resolves.toBe(false);
  });
});
