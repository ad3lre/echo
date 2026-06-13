/** Wall-clock anchored playback sample for synced HTML5 / HLS players (guild VC). */
export type EchoMediaPlaybackSyncV1 = {
  playing: boolean;
  /** Player media time in seconds at {@link wallMs}. */
  mediaTimeSec: number;
  /** `Date.now()` on the publisher when the sample was taken. */
  wallMs: number;
};

export function parseEchoMediaPlaybackSyncV1(
  raw: unknown,
): EchoMediaPlaybackSyncV1 | null {
  if (raw == null || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.playing !== 'boolean') return null;
  if (typeof o.mediaTimeSec !== 'number' || !Number.isFinite(o.mediaTimeSec)) {
    return null;
  }
  if (typeof o.wallMs !== 'number' || !Number.isFinite(o.wallMs)) return null;
  return {
    playing: o.playing,
    mediaTimeSec: o.mediaTimeSec,
    wallMs: o.wallMs,
  };
}
