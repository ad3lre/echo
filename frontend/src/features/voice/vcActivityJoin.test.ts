import { describe, expect, it } from 'vitest';
import {
  primaryVcActivityPresenceKind,
  vcActivityJoinLabel,
  vcActivityPresenceKindToPhase,
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
});
