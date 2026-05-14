function formatPollEndedAgo(endMs: number, nowMs: number): string {
  const msAgo = Math.max(0, nowMs - endMs);
  const sec = Math.floor(msAgo / 1000);
  const min = Math.floor(sec / 60);
  const hr = Math.floor(min / 60);
  const day = Math.floor(hr / 24);

  if (day >= 1) return `Ended ${day} ${day === 1 ? 'day' : 'days'} ago`;
  if (hr >= 1) return `Ended ${hr} ${hr === 1 ? 'hour' : 'hours'} ago`;
  if (min >= 1) return `Ended ${min} ${min === 1 ? 'minute' : 'minutes'} ago`;
  return 'Ended just now';
}

/**
 * Format remaining time until poll ends (or how long since it ended).
 * Returns null if no endsAt or invalid.
 * If the poll has ended, returns "Ended … ago" (updates when `nowMs` changes).
 * Otherwise returns "Ends in …".
 */
export function formatPollTimeRemaining(
  endsAt: string | undefined,
  nowMs: number = Date.now(),
): string | null {
  if (!endsAt) return null;
  const end = new Date(endsAt);
  if (Number.isNaN(end.getTime())) return null;
  const ms = end.getTime() - nowMs;
  if (ms <= 0) return formatPollEndedAgo(end.getTime(), nowMs);

  const sec = Math.floor(ms / 1000);
  const min = Math.floor(sec / 60);
  const hr = Math.floor(min / 60);
  const day = Math.floor(hr / 24);

  if (day >= 1) return `Ends in ${day} ${day === 1 ? 'day' : 'days'}`;
  if (hr >= 1) return `Ends in ${hr} ${hr === 1 ? 'hour' : 'hours'}`;
  if (min >= 1) return `Ends in ${min} ${min === 1 ? 'minute' : 'minutes'}`;
  return 'Ends in < 1 minute';
}

export function isPollEnded(endsAt: string | undefined): boolean {
  if (!endsAt) return false;
  const end = new Date(endsAt);
  return !Number.isNaN(end.getTime()) && end.getTime() <= Date.now();
}
