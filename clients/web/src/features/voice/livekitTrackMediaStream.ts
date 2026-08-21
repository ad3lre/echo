/**
 * LiveKit `Track` / `RemoteTrack` may expose `mediaStream` or only `mediaStreamTrack`.
 * `StreamVideoTile` and fullscreen overlay need a `MediaStream` for `HTMLVideoElement.srcObject`.
 */
export type MediaStreamFromLiveKitOptions = {
  /**
   * When set, only that kind counts as “still streaming” for {@link MediaStream} sources.
   * Prevents attaching a stream whose video track ended but whose tab-capture audio is still live
   * (would leave a black `<video>` on Firefox / Safari).
   */
  kind?: 'video' | 'audio';
};

function tracksForKind(
  ms: MediaStream,
  kind?: 'video' | 'audio',
): MediaStreamTrack[] {
  if (kind === 'video') return ms.getVideoTracks();
  if (kind === 'audio') return ms.getAudioTracks();
  return ms.getTracks();
}

/**
 * Build a `MediaStream` for `<video>` / `<audio>` from a LiveKit track wrapper.
 * Treats ended / partial-ended streams as `null` so callers clear the element instead of freezing
 * on the last decoded frame (common on Firefox / Safari when tab-capture audio outlives video).
 */
export function mediaStreamFromLiveKitTrack(
  t: unknown,
  opts?: MediaStreamFromLiveKitOptions,
): MediaStream | null {
  if (!t || typeof t !== 'object') return null;
  const wantKind = opts?.kind;
  const rec = t as {
    mediaStream?: MediaStream;
    mediaStreamTrack?: MediaStreamTrack;
    track?: MediaStreamTrack;
  };
  const mst = rec.mediaStreamTrack ?? rec.track;
  if (mst instanceof MediaStreamTrack) {
    if (wantKind && mst.kind !== wantKind) return null;
    if (mst.readyState === 'ended') return null;
    return new MediaStream([mst]);
  }
  if (rec.mediaStream instanceof MediaStream) {
    const tracks = tracksForKind(rec.mediaStream, wantKind);
    const alive = tracks.filter((tr) => tr.readyState === 'live');
    if (alive.length === 0) return null;
    // If only some tracks died (e.g. video ended, tab audio still live), rebuild so `<video>`
    // is not stuck showing the last frame on WebKit / Gecko.
    if (
      alive.length === tracks.length &&
      tracks.length === rec.mediaStream.getTracks().length
    ) {
      return rec.mediaStream;
    }
    return new MediaStream(alive);
  }
  return null;
}

/** Underlying browser track for `ended` / `readyState` listeners (LiveKit wrapper may stay non-null). */
export function livekitUnderlyingMediaStreamTrack(
  t: unknown,
): MediaStreamTrack | null {
  if (!t || typeof t !== 'object') return null;
  const rec = t as {
    mediaStreamTrack?: MediaStreamTrack;
    track?: MediaStreamTrack;
  };
  const mst = rec.mediaStreamTrack ?? rec.track;
  return mst instanceof MediaStreamTrack ? mst : null;
}

/** Drop last decoded frame and release the media element for reuse. */
export function clearHtmlVideoElement(el: HTMLVideoElement | null) {
  if (!el) return;
  try {
    el.pause();
  } catch {
    /* ignore */
  }
  el.srcObject = null;
  el.removeAttribute('src');
  try {
    void el.load();
  } catch {
    /* ignore */
  }
  // WebKit / Firefox sometimes retain a black compositor surface until the next frame after `srcObject = null`.
  requestAnimationFrame(() => {
    if (el.srcObject) el.srcObject = null;
    try {
      void el.load();
    } catch {
      /* ignore */
    }
  });
}
