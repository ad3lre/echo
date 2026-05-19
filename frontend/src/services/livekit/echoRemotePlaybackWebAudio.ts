/**
 * Remote voice playback gain above HTMLMediaElement.volume's [0, 1] cap.
 * Wires attached <audio> elements through a GainNode so master/per-user boosts
 * (up to 6× × 2×) apply without IndexSizeError.
 */

import { vcDebugLog } from '@/utils/vcDebugLog';

type TrackLike = {
  attachedElements?: HTMLMediaElement[];
};

/** Matches max from `gainFromVolumePercent` (6) × per-user multiplier (2). */
export const ECHO_REMOTE_PLAYBACK_LINEAR_GAIN_MAX = 12;

type ElementWiring = {
  source: MediaElementAudioSourceNode;
  gain: GainNode;
};

const elementWiring = new WeakMap<HTMLMediaElement, ElementWiring>();
const trackPlaybackElements = new WeakMap<object, Set<HTMLMediaElement>>();

let sharedContext: AudioContext | null = null;

function getAudioContextConstructor(): typeof AudioContext | null {
  const g = globalThis as unknown as {
    AudioContext?: typeof AudioContext;
    webkitAudioContext?: typeof AudioContext;
  };
  return g.AudioContext ?? g.webkitAudioContext ?? null;
}

function getSharedPlaybackAudioContext(): AudioContext {
  const Ctx = getAudioContextConstructor();
  if (!Ctx) {
    throw new Error('Web Audio API unavailable');
  }
  if (!sharedContext || sharedContext.state === 'closed') {
    sharedContext = new Ctx();
  }
  return sharedContext;
}

export function echoPlaybackEnsureAudioContextRunning(): Promise<void> {
  try {
    const ctx = getSharedPlaybackAudioContext();
    if (ctx.state === 'suspended') {
      return ctx.resume().catch(() => undefined);
    }
  } catch {
    /* ignore */
  }
  return Promise.resolve();
}

function trackElementSet(track: object): Set<HTMLMediaElement> {
  let s = trackPlaybackElements.get(track);
  if (!s) {
    s = new Set();
    trackPlaybackElements.set(track, s);
  }
  return s;
}

/**
 * Call after `track.attach()` for remote audio: routes element audio through a GainNode.
 */
function kickPlaybackForAutoplayPolicies(element: HTMLMediaElement): void {
  void element.play().catch(() => undefined);
}

export function echoPlaybackRegisterTrackElement(
  track: object,
  element: HTMLMediaElement,
): boolean {
  const ctx = getSharedPlaybackAudioContext();
  void ctx.resume().catch(() => undefined);

  const trackSid = (track as { sid?: string }).sid ?? 'unknown';

  if (elementWiring.has(element)) {
    trackElementSet(track).add(element);
    element.volume = 1;
    kickPlaybackForAutoplayPolicies(element);
    vcDebugLog(
      '[Echo:VC:Volume] echoPlaybackRegisterTrackElement reused existing wiring',
      {
        trackSid,
        elementId: element.id || 'no-id',
      },
    );
    return true;
  }

  try {
    const source = ctx.createMediaElementSource(element);
    const gain = ctx.createGain();
    gain.gain.value = 1;
    source.connect(gain).connect(ctx.destination);
    element.volume = 1;
    elementWiring.set(element, { source, gain });
    trackElementSet(track).add(element);
    kickPlaybackForAutoplayPolicies(element);
    vcDebugLog(
      '[Echo:VC:Volume] echoPlaybackRegisterTrackElement SUCCESS - wired element',
      {
        trackSid,
        elementId: element.id || 'no-id',
        ctxState: ctx.state,
      },
    );
    return true;
  } catch (e) {
    vcDebugLog('[Echo:VC:Volume] echoPlaybackRegisterTrackElement FAILED', {
      trackSid,
      elementId: element.id || 'no-id',
      error: e instanceof Error ? e.message : String(e),
    });
    return false;
  }
}

export function echoPlaybackHasWiredElement(
  element: HTMLMediaElement,
): boolean {
  return elementWiring.has(element);
}

export function echoPlaybackGetTrackMediaElements(
  track: object,
): HTMLMediaElement[] {
  const trackSid = (track as { sid?: string }).sid ?? 'unknown';
  const fromReg = trackPlaybackElements.get(track);
  if (fromReg?.size) {
    vcDebugLog(
      '[Echo:VC:Volume] echoPlaybackGetTrackMediaElements found in WeakMap',
      {
        trackSid,
        count: fromReg.size,
      },
    );
    return [...fromReg];
  }
  const t = track as TrackLike;
  if (Array.isArray(t.attachedElements)) {
    const filtered = t.attachedElements.filter(
      (el): el is HTMLMediaElement => el instanceof HTMLMediaElement,
    );
    vcDebugLog(
      '[Echo:VC:Volume] echoPlaybackGetTrackMediaElements using attachedElements fallback',
      {
        trackSid,
        attachedCount: t.attachedElements.length,
        filteredCount: filtered.length,
      },
    );
    return filtered;
  }
  vcDebugLog(
    '[Echo:VC:Volume] echoPlaybackGetTrackMediaElements found NOTHING',
    {
      trackSid,
      hasAttachedElements: 'attachedElements' in t,
    },
  );
  return [];
}

/**
 * Retries {@link echoPlaybackRegisterTrackElement} for every element LiveKit attached
 * to this track. Call after playback unlock / reconnect / before applying gain &gt; 1.
 */
export function echoPlaybackEnsureTrackElementsWired(track: object): boolean {
  const elements = echoPlaybackGetTrackMediaElements(track);
  if (!elements.length) return false;
  void echoPlaybackEnsureAudioContextRunning();
  let ok = false;
  for (const el of elements) {
    if (echoPlaybackRegisterTrackElement(track, el)) ok = true;
  }
  return ok;
}

export function echoPlaybackSetLinearGainOnElement(
  element: HTMLMediaElement,
  linearGain: number,
): void {
  const w = elementWiring.get(element);
  if (!w) {
    vcDebugLog(
      '[Echo:VC:Volume] echoPlaybackSetLinearGainOnElement - NO WIRING for element',
      {
        elementId: element.id || 'no-id',
        linearGain,
      },
    );
    return;
  }
  const g = Number.isFinite(linearGain)
    ? Math.max(0, Math.min(ECHO_REMOTE_PLAYBACK_LINEAR_GAIN_MAX, linearGain))
    : 1;
  const oldGain = w.gain.gain.value;
  w.gain.gain.value = g;
  /*
   * element.volume is owned by the caller (setAudioTrackVolumeIfSupported), which
   * mirrors the clamped gain onto every attached element so playback still tracks
   * the slider if the GainNode is not actually routing audio (suspended context,
   * recycled element). Do not pin it to 1 here or that safety net is defeated.
   */
  vcDebugLog('[Echo:VC:Volume] echoPlaybackSetLinearGainOnElement - SET GAIN', {
    elementId: element.id || 'no-id',
    linearGain,
    clampedGain: g,
    oldGain,
    newGain: w.gain.gain.value,
    elementVolume: element.volume,
  });
}

/**
 * Read the linear gain applied to this element after {@link echoPlaybackRegisterTrackElement}
 * (for diagnostics and tests). Returns null if the element is not wired.
 */
export function echoPlaybackPeekLinearGainForElement(
  element: HTMLMediaElement,
): number | null {
  const w = elementWiring.get(element);
  if (!w) return null;
  return w.gain.gain.value;
}

export function echoPlaybackDisposeElement(element: HTMLMediaElement): void {
  const w = elementWiring.get(element);
  if (!w) return;
  try {
    w.source.disconnect();
    w.gain.disconnect();
  } catch {
    /* ignore */
  }
  elementWiring.delete(element);
}

/**
 * After `track.detach()`: tear down Web Audio for detached media elements and drop registry.
 */
export function echoPlaybackCleanupForRemoteTrack(
  track: object,
  detached: HTMLElement[],
): void {
  for (const el of detached) {
    if (el instanceof HTMLMediaElement) {
      echoPlaybackDisposeElement(el);
    }
  }
  trackPlaybackElements.delete(track);
}
