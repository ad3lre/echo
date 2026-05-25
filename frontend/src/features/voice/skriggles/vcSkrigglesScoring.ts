/** Max points a guesser can earn on a correct guess (skribbl-style). */
export const SKRIGGLES_MAX_GUESSER_POINTS = 200;

/** Points awarded to drawer when someone guesses correctly. */
export const SKRIGGLES_DRAWER_BONUS_PER_GUESS = 25;

/**
 * Guesser points scale with time remaining in the draw phase.
 * @param drawTimeSec Total draw duration in seconds.
 * @param timeRemainingSec Seconds left when guess was correct.
 * @param position 0 = first correct guesser this round.
 */
export function guesserPointsForCorrect(opts: {
  drawTimeSec: number;
  timeRemainingSec: number;
  position: number;
}): number {
  const total = Math.max(1, opts.drawTimeSec);
  const remaining = Math.max(0, Math.min(total, opts.timeRemainingSec));
  const base = Math.round((remaining / total) * SKRIGGLES_MAX_GUESSER_POINTS);
  const positionBonus = Math.max(0, 50 - opts.position * 15);
  return Math.max(10, base + positionBonus);
}

export function drawerPointsForGuess(_position: number): number {
  return SKRIGGLES_DRAWER_BONUS_PER_GUESS;
}

export function timeRemainingSec(
  phaseEndsAt: number | null,
  nowMs: number = Date.now(),
): number {
  if (phaseEndsAt == null || !Number.isFinite(phaseEndsAt)) return 0;
  return Math.max(0, Math.ceil((phaseEndsAt - nowMs) / 1000));
}
