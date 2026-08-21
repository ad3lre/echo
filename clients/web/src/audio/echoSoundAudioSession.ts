/**
 * Safari 16.4+ exposes `navigator.audioSession` (Audio Session API). Without an
 * appropriate session type, Web/HTML audio can take exclusive focus and pause
 * background music from other apps. `transient` matches short notification-style
 * SFX that should mix over other playback (see W3C audio-session §3.1).
 */

type NavigatorWithAudioSession = Navigator & {
  readonly audioSession?: { type: string };
};

let transientRefCount = 0;
let savedSessionType: string | undefined;

function getNavigatorAudioSession(): { type: string } | null {
  if (typeof navigator === 'undefined') return null;
  const session = (navigator as NavigatorWithAudioSession).audioSession;
  return session ?? null;
}

/**
 * Ref-counted `transient` session for overlapping Echo SFX; restores the prior
 * type when the last sound finishes.
 */
export function pushEchoSoundTransientSession(): () => void {
  const session = getNavigatorAudioSession();
  if (!session || typeof session.type !== 'string') {
    return () => {};
  }

  if (transientRefCount === 0) {
    savedSessionType = session.type;
    try {
      session.type = 'transient';
    } catch {
      savedSessionType = undefined;
      return () => {};
    }
  }
  transientRefCount++;

  let released = false;
  return () => {
    if (released) return;
    released = true;
    transientRefCount = Math.max(0, transientRefCount - 1);
    if (transientRefCount > 0 || savedSessionType === undefined) return;
    const restore = savedSessionType;
    savedSessionType = undefined;
    try {
      session.type = restore;
    } catch {
      /* ignore */
    }
  };
}
