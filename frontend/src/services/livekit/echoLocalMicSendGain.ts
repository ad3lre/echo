/**
 * Outgoing mic gain for LiveKit publish path.
 * `LocalAudioTrack.setVolume` / HTMLMediaElement.volume do not change what remote
 * participants hear; a `TrackProcessor` with a GainNode does.
 */
import type { LocalAudioTrack } from 'livekit-client';
import { Track } from 'livekit-client';
import type {
  AudioProcessorOptions,
  Room,
  TrackProcessor,
} from 'livekit-client';
import type { EchoKrispNoiseFilterOptions } from '@/services/livekit/echoKrispTypes';
import { voiceClientDiag } from '@/observability/voiceClientTrace';

export const ECHO_MIC_SEND_PROCESSOR_NAME = 'echo-mic-send-gain';
const KRISP_PROCESSOR_NAME = 'livekit-noise-filter';

/** Matches `gainFromVolumePercent` in useLiveKitVoiceRoom (0–600% UI → 0–6 linear). */
export const ECHO_MIC_SEND_LINEAR_GAIN_MAX = 6;

type KrispProcessorLike = {
  name?: string;
  processedTrack?: MediaStreamTrack;
  setEnabled: (enable: boolean) => Promise<boolean | undefined>;
  isEnabled: () => boolean;
  init: (opts: AudioProcessorOptions) => Promise<void>;
  restart: (opts: AudioProcessorOptions) => Promise<void>;
  destroy: () => Promise<void>;
  onPublish?: (room: Room) => Promise<void>;
};

function clampLinearGain(gain: number): number {
  return Number.isFinite(gain)
    ? Math.max(0, Math.min(ECHO_MIC_SEND_LINEAR_GAIN_MAX, gain))
    : 1;
}

function asKrispProcessorLike(value: unknown): KrispProcessorLike | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<KrispProcessorLike>;
  if (candidate.name !== KRISP_PROCESSOR_NAME) return null;
  if (
    typeof candidate.init !== 'function' ||
    typeof candidate.restart !== 'function' ||
    typeof candidate.destroy !== 'function' ||
    typeof candidate.setEnabled !== 'function' ||
    typeof candidate.isEnabled !== 'function'
  ) {
    return null;
  }
  return candidate as KrispProcessorLike;
}

/** Gain-only stage: raw mic → GainNode → processedTrack. */
export class EchoMicSendGainStage {
  private source?: MediaStreamAudioSourceNode;
  private gainNode?: GainNode;
  private destination?: MediaStreamAudioDestinationNode;
  private audioContext?: AudioContext;
  private sourceTrack?: MediaStreamTrack;
  processedTrack?: MediaStreamTrack;

  getSourceTrack(): MediaStreamTrack | undefined {
    return this.sourceTrack;
  }

  async ensureAudioContextRunning(): Promise<boolean> {
    const ctx = this.audioContext;
    if (!ctx || ctx.state === 'closed') return false;
    if (ctx.state === 'suspended') {
      try {
        await ctx.resume();
      } catch {
        voiceClientDiag(
          'warn',
          'voice.client:mic_send_gain_ctx_resume_failed',
          {},
        );
        return false;
      }
    }
    return ctx.state === 'running';
  }

  async init(opts: AudioProcessorOptions): Promise<void> {
    await this.destroy();
    const { track, audioContext } = opts;
    this.sourceTrack = track;
    this.audioContext = audioContext;
    // Safari/iOS routinely hand us a *suspended* AudioContext here. A suspended context
    // makes the MediaStreamAudioDestinationNode emit silence, so remote participants hear
    // nothing even though the local mic track is "live" — the classic "my mic does not work
    // in Safari" report. Resume before wiring the graph. Harmless on other browsers: it only
    // resumes when actually suspended, and a failure still attaches the graph for a later
    // gesture-driven resume.
    await this.ensureAudioContextRunning();
    this.source = audioContext.createMediaStreamSource(
      new MediaStream([track]),
    );
    this.gainNode = audioContext.createGain();
    this.gainNode.gain.value = 1;
    this.destination = audioContext.createMediaStreamDestination();
    this.source.connect(this.gainNode);
    this.gainNode.connect(this.destination);
    this.processedTrack = this.destination.stream.getAudioTracks()[0];
  }

  async destroy(): Promise<void> {
    try {
      this.source?.disconnect();
      this.gainNode?.disconnect();
      this.destination?.disconnect();
    } catch {
      /* ignore */
    }
    this.source = undefined;
    this.gainNode = undefined;
    this.destination = undefined;
    this.audioContext = undefined;
    this.sourceTrack = undefined;
    this.processedTrack = undefined;
  }

  setLinearGain(gain: number): void {
    if (!this.gainNode) return;
    this.gainNode.gain.value = clampLinearGain(gain);
  }
}

/**
 * Optional Krisp after manual send gain: mic → gain → Krisp → SFU.
 * LiveKit allows only one processor per track.
 */
export class EchoMicSendProcessor implements TrackProcessor<
  Track.Kind.Audio,
  AudioProcessorOptions
> {
  readonly name = ECHO_MIC_SEND_PROCESSOR_NAME;
  processedTrack?: MediaStreamTrack;

  private gainStage = new EchoMicSendGainStage();
  private krisp?: KrispProcessorLike;
  private pendingLinearGain = 1;
  private useKrisp = false;
  private krispOptions?: EchoKrispNoiseFilterOptions;

  configure(options: {
    useKrisp: boolean;
    krispOptions?: EchoKrispNoiseFilterOptions;
  }): void {
    this.useKrisp = options.useKrisp;
    this.krispOptions = options.krispOptions;
  }

  async init(opts: AudioProcessorOptions): Promise<void> {
    await this.rebuild(opts);
  }

  async restart(opts: AudioProcessorOptions): Promise<void> {
    await this.destroy();
    await this.init(opts);
  }

  async destroy(): Promise<void> {
    if (this.krisp) {
      try {
        await this.krisp.destroy();
      } catch {
        /* ignore */
      }
      this.krisp = undefined;
    }
    await this.gainStage.destroy();
    this.processedTrack = undefined;
  }

  async onPublish(room: Room): Promise<void> {
    await this.krisp?.onPublish?.(room);
  }

  setLinearGain(gain: number): void {
    this.pendingLinearGain = clampLinearGain(gain);
    this.gainStage.setLinearGain(this.pendingLinearGain);
  }

  getKrispProcessor(): KrispProcessorLike | undefined {
    return this.krisp;
  }

  getSourceTrack(): MediaStreamTrack | undefined {
    return this.gainStage.getSourceTrack();
  }

  async ensureSendAudioContextRunning(): Promise<boolean> {
    return this.gainStage.ensureAudioContextRunning();
  }

  private async rebuild(opts: AudioProcessorOptions): Promise<void> {
    const useKrisp = this.useKrisp;
    const krispOpts = this.krispOptions;

    await this.gainStage.init(opts);
    this.gainStage.setLinearGain(this.pendingLinearGain);

    if (useKrisp && krispOpts != null) {
      const gainedTrack = this.gainStage.processedTrack;
      if (!gainedTrack) {
        this.processedTrack = undefined;
        return;
      }
      const mod = await import('@livekit/krisp-noise-filter');
      if (!mod.isKrispNoiseFilterSupported()) {
        this.processedTrack = gainedTrack;
        return;
      }
      const krisp = mod.KrispNoiseFilter(
        krispOpts as Parameters<typeof mod.KrispNoiseFilter>[0],
      ) as KrispProcessorLike;
      await krisp.init({ ...opts, track: gainedTrack });
      await krisp.setEnabled(true);
      this.krisp = krisp;
      this.processedTrack = krisp.processedTrack ?? gainedTrack;
      return;
    }

    this.krisp = undefined;
    this.processedTrack = this.gainStage.processedTrack;
  }
}

export function isEchoMicSendProcessor(
  processor: unknown,
): processor is EchoMicSendProcessor {
  return (
    !!processor &&
    typeof processor === 'object' &&
    (processor as { name?: string }).name === ECHO_MIC_SEND_PROCESSOR_NAME
  );
}

export function getEchoMicSendProcessor(
  localAudio: LocalAudioTrack,
): EchoMicSendProcessor | null {
  const p = localAudio.getProcessor();
  return isEchoMicSendProcessor(p) ? p : null;
}

export async function ensureEchoMicSendProcessor(
  localAudio: LocalAudioTrack,
  options: {
    useKrisp: boolean;
    krispOptions?: EchoKrispNoiseFilterOptions;
  },
): Promise<EchoMicSendProcessor> {
  let processor = getEchoMicSendProcessor(localAudio);
  if (!processor) {
    processor = new EchoMicSendProcessor();
    processor.configure({
      useKrisp: options.useKrisp,
      krispOptions: options.krispOptions,
    });
    await localAudio.setProcessor(processor);
    voiceClientDiag('info', 'voice.client:mic_send_processor_attached', {
      useKrisp: options.useKrisp,
    });
    return processor;
  }

  const currentKrisp = processor.getKrispProcessor();
  if (options.useKrisp && currentKrisp && !currentKrisp.isEnabled()) {
    await currentKrisp.setEnabled(true);
  }
  return processor;
}

export async function stopEchoMicSendProcessor(
  localAudio: LocalAudioTrack,
): Promise<void> {
  const p = localAudio.getProcessor();
  if (!isEchoMicSendProcessor(p) && !asKrispProcessorLike(p)) return;
  try {
    await localAudio.stopProcessor();
  } catch {
    /* ignore */
  }
}

export function setEchoMicSendLinearGain(
  localAudio: LocalAudioTrack,
  linearGain: number,
): boolean {
  const processor = getEchoMicSendProcessor(localAudio);
  if (!processor) return false;
  processor.setLinearGain(linearGain);
  return true;
}

export function getEchoMicSendProcessorSourceTrack(
  localAudio: LocalAudioTrack,
): MediaStreamTrack | undefined {
  return getEchoMicSendProcessor(localAudio)?.getSourceTrack();
}

export async function ensureEchoMicSendProcessorAudioContextRunning(
  localAudio: LocalAudioTrack,
): Promise<boolean> {
  const processor = getEchoMicSendProcessor(localAudio);
  if (!processor) return true;
  return processor.ensureSendAudioContextRunning();
}

/** Legacy Krisp-only processor from older sessions — tear down before attaching send gain. */
export function isLegacyKrispOnlyProcessor(processor: unknown): boolean {
  return asKrispProcessorLike(processor) != null;
}
