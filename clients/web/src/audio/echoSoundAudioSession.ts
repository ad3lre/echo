/**
 * Safari 16.4+ exposes `navigator.audioSession` (Audio Session API). Without an
 * appropriate session type, Web/HTML audio can take exclusive focus and pause
 * background music from other apps. `transient` matches short notification-style
 * SFX that should mix over other playback (see W3C audio-session §3.1).
 *
 * Important: `transient` (and some other types) are **incompatible with mic
 * capture**. Voice join must call {@link ensureEchoVoiceCaptureAudioSession}
 * before `getUserMedia`, or Safari throws
 * "Audio session category is not compatible with audio capture".
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

/** Types that allow mic capture on Safari's Audio Session API. */
const VOICE_CAPTURE_SESSION_TYPES = new Set([
  'auto',
  'playback',
  'play-and-record',
]);

/**
 * Ensure Safari's audio session allows microphone capture before getUserMedia.
 * SFX may have left the session on `transient`, which blocks voice join.
 */
export function ensureEchoVoiceCaptureAudioSession(): void {
  const session = getNavigatorAudioSession();
  if (!session || typeof session.type !== 'string') return;
  const current = session.type.trim().toLowerCase();
  if (VOICE_CAPTURE_SESSION_TYPES.has(current)) return;
  try {
    // Prefer play-and-record for VC; fall back to auto if the UA rejects it.
    session.type = 'play-and-record';
  } catch {
    try {
      session.type = 'auto';
    } catch {
      /* ignore — getUserMedia will surface a clearer error */
    }
  }
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
