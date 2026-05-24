/** Format seconds as M:SS or H:MM:SS. */
export function formatMediaTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  if (h > 0) return `${h}:${pad(m)}:${pad(s)}`;
  return `${m}:${pad(s)}`;
}

/** Buffered fraction 0–100 for the current playback position. */
export function mediaBufferedPercent(
  el: HTMLMediaElement | null | undefined,
): number {
  if (!el || !Number.isFinite(el.duration) || el.duration <= 0) return 0;
  const t = el.currentTime;
  const ranges = el.buffered;
  for (let i = 0; i < ranges.length; i++) {
    if (t >= ranges.start(i) && t <= ranges.end(i)) {
      return Math.min(100, (ranges.end(i) / el.duration) * 100);
    }
  }
  if (ranges.length > 0) {
    return Math.min(100, (ranges.end(ranges.length - 1) / el.duration) * 100);
  }
  return 0;
}
