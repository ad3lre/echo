/** Supported chat media playback rates (HTMLMediaElement.playbackRate). */
export const MEDIA_PLAYBACK_RATES = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2] as const;

export type MediaPlaybackRate = (typeof MEDIA_PLAYBACK_RATES)[number];

const STORAGE_KEY = 'echo.chatMediaPlaybackRate';

export function formatPlaybackRateLabel(rate: number): string {
  if (!Number.isFinite(rate) || rate <= 0) return '1×';
  const rounded = Math.round(rate * 100) / 100;
  return Number.isInteger(rounded) ? `${rounded}×` : `${rounded}×`;
}

export function normalizePlaybackRate(rate: number): MediaPlaybackRate {
  const match = MEDIA_PLAYBACK_RATES.find((r) => Math.abs(r - rate) < 0.001);
  return match ?? 1;
}

export function readStoredPlaybackRate(): MediaPlaybackRate {
  if (typeof localStorage === 'undefined') return 1;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw == null) return 1;
    const n = parseFloat(raw);
    if (Number.isFinite(n)) return normalizePlaybackRate(n);
  } catch {
    /* ignore */
  }
  return 1;
}

export function writeStoredPlaybackRate(rate: MediaPlaybackRate): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, String(rate));
  } catch {
    /* ignore */
  }
}
