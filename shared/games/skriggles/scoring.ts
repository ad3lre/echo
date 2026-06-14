export const SKRIGGLES_MAX_GUESSER_POINTS = 200;
export const SKRIGGLES_DRAWER_BONUS_PER_GUESS = 25;

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
