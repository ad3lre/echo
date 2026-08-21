import { describe, expect, it } from 'vitest';
import {
  buildVcActivityArt,
  VC_ACTIVITY_LIBRARY_CARDS,
} from './vcActivityLibraryCards';

describe('vcActivityLibraryCards', () => {
  it('resolves hero art against the app base path', () => {
    const art = buildVcActivityArt('/app/');
    expect(art.youtube).toBe('/app/vc-activities/youtube-hero.svg');
    expect(art.ticTacToe).toBe('/app/vc-activities/tic-tac-toe-hero.svg');
  });

  it('every card points at an art key that exists', () => {
    const art = buildVcActivityArt('/');
    for (const card of VC_ACTIVITY_LIBRARY_CARDS) {
      expect(art[card.artKey], `missing art for ${card.key}`).toBeTruthy();
    }
  });

  it('activity keys are unique', () => {
    const keys = VC_ACTIVITY_LIBRARY_CARDS.map((c) => c.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
