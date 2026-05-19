/**
 * Local mic monitoring: route the test MediaStream to the chosen output device
 * (e.g. headphones). Prefers Web Audio + AudioContext.setSinkId; falls back to
 * HTMLAudioElement + setSinkId when the AudioContext API is unavailable.
 */
import {
  applyOutputSink,
  applyOutputSinkToAudioContext,
} from '@/audio/applyOutputSink';
import { supportsAudioContextOutputSelection } from '@/platform/browserCompatibility';

export function useMicTestMonitor() {
  let ctx: AudioContext | null = null;
  let source: MediaStreamAudioSourceNode | null = null;
  let gain: GainNode | null = null;
  let htmlAudio: HTMLAudioElement | null = null;

  /** `volumePct` 0–600 → linear gain 0–6 (matches max boost output multiplier). */
  function setGain(volumePct: number) {
    const v = Math.max(0, Math.min(6, volumePct / 100));
    if (gain) gain.gain.value = v;
    if (htmlAudio) htmlAudio.volume = Math.min(1, v);
  }

  async function applySink(sinkId: string) {
    const id = !sinkId || sinkId === 'default' ? '' : sinkId;
    if (ctx) {
      await applyOutputSinkToAudioContext(ctx, id);
    } else if (htmlAudio) {
      await applyOutputSink(htmlAudio, id);
    }
  }

  async function start(stream: MediaStream, sinkId: string, volumePct: number) {
    stop();
    const vol = Math.max(0, Math.min(6, volumePct / 100));
    const ctxCanSink = supportsAudioContextOutputSelection();
    const needWebAudio = ctxCanSink || vol > 1;

    if (needWebAudio) {
      const audioCtx = new AudioContext();
      ctx = audioCtx;
      source = audioCtx.createMediaStreamSource(stream);
      gain = audioCtx.createGain();
      gain.gain.value = vol;
      source.connect(gain);
      gain.connect(audioCtx.destination);
      await applySink(sinkId);
      if (audioCtx.state === 'suspended') {
        await audioCtx.resume().catch(() => {});
      }
      return;
    }

    const el = new Audio();
    el.srcObject = stream;
    el.volume = Math.min(1, vol);
    htmlAudio = el;
    await applySink(sinkId);
    await el.play().catch(() => {});
  }

  function stop() {
    if (source) {
      try {
        source.disconnect();
      } catch {
        /* ignore */
      }
      source = null;
    }
    gain = null;
    if (ctx) {
      void ctx.close().catch(() => {});
      ctx = null;
    }
    if (htmlAudio) {
      htmlAudio.pause();
      htmlAudio.srcObject = null;
      htmlAudio = null;
    }
  }

  return { start, stop, setGain, applySink };
}
