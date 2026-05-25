export type OutboundGateMode = 'none' | 'soft' | 'hard';

/** Gate RMS range mapped from the Settings voice-activation slider (0–100%). */
export const GATE_RMS_MIN = 0.005;
export const GATE_RMS_MAX = 0.06;

/** UI speaking ring turns on below the outbound gate so quiet speech still shows activity. */
export const SPEAKING_INDICATOR_GATE_RMS_RATIO = 0.5;
export const SPEAKING_INDICATOR_RMS_FLOOR = 0.004;
/** Hold speaking ring briefly after level drops to avoid flicker (local + remote). */
export const SPEAKING_INDICATOR_SILENCE_HOLD_MS = 150;
/** Poll remote LiveKit participant-family` levels when events lag. */
export const SPEAKING_INDICATOR_REMOTE_POLL_MS = 80;

export function thresholdPercentToRms(percent: number): number {
  const clamped = Math.max(0, Math.min(100, percent));
  return GATE_RMS_MIN + (clamped / 100) * (GATE_RMS_MAX - GATE_RMS_MIN);
}

/** RMS threshold for the green speaking ring — more sensitive than the outbound gate. */
export function indicatorRmsFromGatePercent(percent: number): number {
  return indicatorRmsFromGateRms(thresholdPercentToRms(percent));
}

export function indicatorRmsFromGateRms(gateRms: number): number {
  return Math.max(
    SPEAKING_INDICATOR_RMS_FLOOR,
    gateRms * SPEAKING_INDICATOR_GATE_RMS_RATIO,
  );
}

/** Lower release threshold (Schmitt) so the ring does not chatter at the edge. */
export function indicatorReleaseRmsFromOn(onRms: number): number {
  return Math.max(SPEAKING_INDICATOR_RMS_FLOOR * 0.75, onRms * 0.65);
}

type RemoteSpeakingEntry = {
  speaking: boolean;
  silenceDeadline: number | null;
};

export type RemoteSpeakingTracker = {
  speakingFor: (
    participantId: string,
    level: number,
    isSpeakingHint: boolean,
    indicatorOn: number,
    indicatorOff: number,
    now?: number,
  ) => boolean;
  remove: (participantId: string) => void;
  clear: () => void;
};

/** Per-participant hysteresis + hold for LiveKit remote speaking rings. */
export function createRemoteSpeakingTracker(): RemoteSpeakingTracker {
  const entries = new Map<string, RemoteSpeakingEntry>();

  function speakingFor(
    participantId: string,
    level: number,
    isSpeakingHint: boolean,
    indicatorOn: number,
    indicatorOff: number,
    now = Date.now(),
  ): boolean {
    let entry = entries.get(participantId);
    if (!entry) {
      entry = { speaking: false, silenceDeadline: null };
      entries.set(participantId, entry);
    }

    const activeSignal = isSpeakingHint || level >= indicatorOn;
    const belowRelease = level < indicatorOff && !isSpeakingHint;

    if (activeSignal) {
      entry.silenceDeadline = null;
      entry.speaking = true;
    } else if (entry.speaking) {
      if (belowRelease) {
        if (entry.silenceDeadline == null) {
          entry.silenceDeadline = now + SPEAKING_INDICATOR_SILENCE_HOLD_MS;
        } else if (now >= entry.silenceDeadline) {
          entry.speaking = false;
          entry.silenceDeadline = null;
        }
      } else {
        entry.silenceDeadline = null;
      }
    }

    return entry.speaking;
  }

  return {
    speakingFor,
    remove(participantId: string) {
      entries.delete(participantId);
    },
    clear() {
      entries.clear();
    },
  };
}

function participantAudioLevelsEqual(
  a: Record<string, { level: number; speaking: boolean }>,
  b: Record<string, { level: number; speaking: boolean }>,
): boolean {
  const aKeys = Object.keys(a);
  if (aKeys.length !== Object.keys(b).length) return false;
  for (const id of aKeys) {
    const av = a[id];
    const bv = b[id];
    if (!av || !bv) return false;
    if (av.speaking !== bv.speaking) return false;
    if (Math.abs(av.level - bv.level) > 0.015) return false;
  }
  return true;
}

export function mergeSpeakingMapIfChanged<
  T extends Record<string, { level: number; speaking: boolean }>,
>(current: T, next: T): T {
  return participantAudioLevelsEqual(current, next) ? current : next;
}

export function rmsToDbfs(rms: number): number {
  if (rms <= 1e-7) return -100;
  return Math.max(-100, Math.min(0, 20 * Math.log10(rms)));
}

export function gateMultiplierForDbfs(
  dbfs: number,
  thresholdPercent: number,
  mode: OutboundGateMode,
): number {
  const thresholdDbfs = rmsToDbfs(thresholdPercentToRms(thresholdPercent));
  if (mode === 'none') return 1;
  if (dbfs >= thresholdDbfs) return 1;
  if (mode === 'hard') return 0;
  const delta = thresholdDbfs - dbfs;
  const attenuationDb = Math.max(0, Math.min(36, delta * 1.2));
  return Math.pow(10, -attenuationDb / 20);
}
