/**
 * Browser checks before joining LiveKit voice (guild VC or DM calls).
 * Ensures microphone access works; validates speaker/headphone enumeration when the browser exposes it.
 */

export class VoiceJoinMediaPreflightError extends Error {
  override readonly name = 'VoiceJoinMediaPreflightError';
}

function domExceptionName(e: unknown): string {
  if (e === null || e === undefined) return '';
  if (typeof e === 'object' && 'name' in e) {
    const n = (e as { name?: unknown }).name;
    if (typeof n === 'string' && n.trim()) return n.trim();
  }
  if (typeof DOMException !== 'undefined' && e instanceof DOMException) {
    return e.name?.trim() ?? '';
  }
  if (e instanceof Error) return e.name?.trim() ?? '';
  return '';
}

function domExceptionMessage(e: unknown): string {
  if (e instanceof Error && e.message.trim()) return e.message.trim();
  if (e && typeof e === 'object' && 'message' in e) {
    const m = (e as { message?: unknown }).message;
    if (typeof m === 'string' && m.trim()) return m.trim();
  }
  return '';
}

/** Map getUserMedia failures to actionable copy; include browser hint when name is missing. */
function throwMicPreflightFromGetUserMediaError(e: unknown): never {
  const rawName = domExceptionName(e);
  const name = rawName.toLowerCase();
  const msgLower = domExceptionMessage(e).toLowerCase();

  if (
    name === 'notallowederror' ||
    name === 'permissiondeniederror' ||
    msgLower.includes('permission denied') ||
    msgLower.includes('not allowed')
  ) {
    throw new VoiceJoinMediaPreflightError(
      'Microphone access was blocked. Allow the mic for this site in your browser bar, then tap Retry.',
    );
  }
  if (
    name === 'notfounderror' ||
    name === 'devicesnotfounderror' ||
    msgLower.includes('device not found')
  ) {
    throw new VoiceJoinMediaPreflightError(
      'No microphone was found. Connect a headset or microphone, then tap Retry.',
    );
  }
  if (
    name === 'notreadableerror' ||
    name === 'trackstarterror' ||
    msgLower.includes('could not start audio source') ||
    msgLower.includes('in use')
  ) {
    throw new VoiceJoinMediaPreflightError(
      'Your microphone is in use or unavailable. Close other apps using the mic, pick another input in Voice settings, then tap Retry.',
    );
  }
  if (name === 'aborterror') {
    throw new VoiceJoinMediaPreflightError(
      'Microphone access was interrupted. Try again.',
    );
  }
  if (name === 'securityerror') {
    throw new VoiceJoinMediaPreflightError(
      'Microphone access is blocked (secure context required). Use HTTPS or localhost.',
    );
  }
  if (name === 'overconstrainederror') {
    throw new VoiceJoinMediaPreflightError(
      'The browser could not use its default mic settings on this device. Open Voice & Video settings, turn off extra processing or pick another input, then tap Retry.',
    );
  }
  if (name === 'notsupportederror' || name === 'typeerror') {
    throw new VoiceJoinMediaPreflightError(
      'This browser reported the microphone request as unsupported. Try another browser or update, then tap Retry.',
    );
  }
  if (name === 'invalidstateerror') {
    throw new VoiceJoinMediaPreflightError(
      'Microphone is not ready yet (another capture may still be closing). Wait a moment and tap Retry.',
    );
  }

  const hint = rawName || domExceptionMessage(e) || 'unknown error';
  const short = hint.length > 120 ? `${hint.slice(0, 117)}…` : hint;
  throw new VoiceJoinMediaPreflightError(
    `Could not open the microphone (${short}). Check Voice & Video input device and browser permissions, then tap Retry.`,
  );
}

function stopStream(stream: MediaStream | null) {
  if (!stream) return;
  for (const t of stream.getTracks()) {
    try {
      t.stop();
    } catch {
      /* ignore */
    }
  }
}

type LegacyNavigator = Navigator & {
  webkitGetUserMedia?: LegacyGUM;
  mozGetUserMedia?: LegacyGUM;
  getUserMedia?: LegacyGUM;
};

type LegacyGUM = (
  constraints: MediaStreamConstraints,
  success: (stream: MediaStream) => void,
  error: (err: Error) => void,
) => void;

/**
 * No `getUserMedia` path exists (common on **non-secure** pages: plain `http://` except localhost).
 * Browsers still allow mic on **HTTPS** sites (e.g. hosted sign-in), which is why Cognito can prompt
 * while Echo on `http://LAN-IP:port` cannot expose `navigator.mediaDevices`.
 */
function throwMicrophoneApiUnavailable(): never {
  try {
    if (globalThis.isSecureContext === false) {
      throw new VoiceJoinMediaPreflightError(
        'Voice calls need a secure page: use HTTPS, or http://localhost / http://127.0.0.1. On plain HTTP (for example http://192.168.x.x), Chrome and Edge hide the microphone API, so Echo cannot request the mic even though HTTPS sign-in pages can. Serve Echo over TLS or use localhost, then tap Retry.',
      );
    }
  } catch {
    /* `isSecureContext` absent in very old runtimes */
  }
  if (typeof window !== 'undefined' && window.self !== window.top) {
    throw new VoiceJoinMediaPreflightError(
      'Echo is embedded in another page. The top site must allow the microphone for this frame (Permissions-Policy / feature policy), or open Echo in its own tab, then tap Retry.',
    );
  }
  throw new VoiceJoinMediaPreflightError(
    'This browser does not expose microphone capture from this page. Use a current Chrome, Edge, or Safari; open Echo on HTTPS or localhost; or check that extensions are not blocking media devices.',
  );
}

function micProbeShouldTryLooserConstraints(e: unknown): boolean {
  const name = domExceptionName(e).toLowerCase();
  if (
    name === 'notallowederror' ||
    name === 'permissiondeniederror' ||
    name === 'securityerror' ||
    name === 'notfounderror' ||
    name === 'devicesnotfounderror' ||
    name === 'aborterror'
  ) {
    return false;
  }
  return true;
}

/**
 * Request a short-lived mic stream so the browser shows its permission prompt when needed.
 * Prefer `navigator.mediaDevices.getUserMedia`; fall back to legacy prefixed APIs so we do not
 * bail out before trying when `enumerateDevices` is missing (some WebViews / older builds).
 *
 * Tries looser constraint sets when the default fails: some Chromium builds apply aggressive
 * defaults (e.g. voice isolation) that can fail on certain drivers while a minimal capture works.
 */
async function getUserMediaAudioProbe(): Promise<MediaStream> {
  if (typeof navigator === 'undefined') {
    throw new VoiceJoinMediaPreflightError(
      'Voice calls must run in a browser with microphone support.',
    );
  }
  const md = navigator.mediaDevices;
  if (typeof md?.getUserMedia === 'function') {
    const attempts: MediaStreamConstraints[] = [
      { audio: true },
      {
        audio: {
          voiceIsolation: false,
        } as MediaTrackConstraints,
      },
      {
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          automaticGainControl: false,
          voiceIsolation: false,
        } as MediaTrackConstraints,
      },
    ];
    for (let i = 0; i < attempts.length; i++) {
      try {
        return await md.getUserMedia(attempts[i]!);
      } catch (err) {
        const last = i === attempts.length - 1;
        if (last || !micProbeShouldTryLooserConstraints(err)) {
          throwMicPreflightFromGetUserMediaError(err);
        }
      }
    }
  }
  const n = navigator as LegacyNavigator;
  const legacy = n.webkitGetUserMedia ?? n.mozGetUserMedia ?? n.getUserMedia;
  if (typeof legacy === 'function') {
    try {
      return await new Promise<MediaStream>((resolve, reject) => {
        legacy.call(navigator, { audio: true }, resolve, reject);
      });
    } catch (e) {
      throwMicPreflightFromGetUserMediaError(e);
    }
  }
  throwMicrophoneApiUnavailable();
}

/**
 * @throws {VoiceJoinMediaPreflightError} When mic permission or hardware is unusable, or when
 *   the browser lists `audiooutput` devices but none are present (wired output expected).
 */
export async function assertVoiceJoinMediaReady(): Promise<void> {
  let stream: MediaStream | null = null;
  try {
    stream = await getUserMediaAudioProbe();
  } catch (e) {
    if (e instanceof VoiceJoinMediaPreflightError) throw e;
    throwMicPreflightFromGetUserMediaError(e);
  } finally {
    stopStream(stream);
  }

  const mdEnum = navigator.mediaDevices;
  if (typeof mdEnum?.enumerateDevices !== 'function') {
    return;
  }

  let devices: MediaDeviceInfo[];
  try {
    devices = await mdEnum.enumerateDevices();
  } catch {
    return;
  }

  const inputs = devices.filter((d) => d.kind === 'audioinput');
  if (inputs.length === 0) {
    throw new VoiceJoinMediaPreflightError(
      'No microphone device was detected after permission was granted.',
    );
  }

  const hasOutputKind = devices.some((d) => d.kind === 'audiooutput');
  if (!hasOutputKind) {
    // Safari and some environments omit `audiooutput` from enumeration; mic check is the gate.
    return;
  }
  const outputs = devices.filter(
    (d) => d.kind === 'audiooutput' && d.deviceId?.trim(),
  );
  if (outputs.length === 0) {
    throw new VoiceJoinMediaPreflightError(
      'No speaker or headphone output was detected. Connect headphones or speakers, then tap Retry.',
    );
  }
}

/**
 * Ensures the browser can open a camera capture (permission + hardware).
 * Call before enabling video in LiveKit so users get a clear prompt and errors
 * instead of a silent failure.
 */
export async function assertCameraCaptureReady(
  preferredDeviceId?: string,
): Promise<void> {
  if (
    typeof navigator === 'undefined' ||
    !navigator.mediaDevices?.getUserMedia
  ) {
    throw new VoiceJoinMediaPreflightError(
      'Video needs a browser that supports camera access.',
    );
  }

  const videoConstraints: MediaTrackConstraints =
    preferredDeviceId &&
    preferredDeviceId.trim() &&
    preferredDeviceId !== 'default'
      ? { deviceId: { exact: preferredDeviceId.trim() } }
      : {};

  let stream: MediaStream | null = null;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: Object.keys(videoConstraints).length ? videoConstraints : true,
      audio: false,
    });
  } catch (e) {
    const name =
      e && typeof e === 'object' && 'name' in e
        ? String((e as DOMException).name)
        : '';
    if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
      throw new VoiceJoinMediaPreflightError(
        'Camera access was blocked. Allow the camera for this site in your browser bar, then turn video on again.',
      );
    }
    if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
      throw new VoiceJoinMediaPreflightError(
        'No camera was found. Connect a webcam or use another device, then try again.',
      );
    }
    if (name === 'NotReadableError' || name === 'TrackStartError') {
      throw new VoiceJoinMediaPreflightError(
        'Your camera is in use or unavailable. Close other apps using the camera, pick another camera in Voice settings, then try again.',
      );
    }
    if (name === 'OverconstrainedError') {
      throw new VoiceJoinMediaPreflightError(
        'That camera cannot be used with the current quality settings. Pick another camera or lower video quality, then try again.',
      );
    }
    if (name === 'AbortError') {
      throw new VoiceJoinMediaPreflightError(
        'Camera access was interrupted. Try turning video on again.',
      );
    }
    if (name === 'SecurityError') {
      throw new VoiceJoinMediaPreflightError(
        'Camera access is blocked (secure context required). Use HTTPS or localhost.',
      );
    }
    throw new VoiceJoinMediaPreflightError(
      'Could not use the camera. Check your devices and try again.',
    );
  } finally {
    stopStream(stream);
  }
}
