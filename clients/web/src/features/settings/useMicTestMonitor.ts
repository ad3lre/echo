/**
 * Local mic monitoring: route the test MediaStream to the chosen output device
 * (e.g. headphones). Prefers Web Audio + AudioContext.setSinkId; falls back to
 * HTMLAudioElement + setSinkId when the AudioContext API is unavailable.
 */
import {
  applyOutputSink,
  applyOutputSinkToAudioContext,
} from '@/audio/applyOutputSink';
import { primeEchoAudioPlayback } from '@/features/layout/useEchoSounds';
import { supportsAudioContextOutputSelection } from '@/platform/browserCompatibility';

function linearGainFromVolumePct(volumePct: number): number {
  return Math.max(0, Math.min(6, volumePct / 100));
}

export function useMicTestMonitor() {
  let ctx: AudioContext | null = null;
  let source: MediaStreamAudioSourceNode | null = null;
  let inputGainNode: GainNode | null = null;
  let outputGainNode: GainNode | null = null;
  let htmlAudio: HTMLAudioElement | null = null;
  let htmlInputLinearGain = 1;
  let htmlOutputLinearGain = 1;

  function setInputGain(volumePct: number) {
    const v = linearGainFromVolumePct(volumePct);
    htmlInputLinearGain = v;
    if (inputGainNode) inputGainNode.gain.value = v;
    syncHtmlAudioVolume();
  }

  /** `volumePct` 0–600 → linear gain 0–6 (matches max boost output multiplier). */
  function setOutputGain(volumePct: number) {
    const v = linearGainFromVolumePct(volumePct);
    htmlOutputLinearGain = v;
    if (outputGainNode) outputGainNode.gain.value = v;
    syncHtmlAudioVolume();
  }

  /** @deprecated Use {@link setOutputGain}. */
  function setGain(volumePct: number) {
    setOutputGain(volumePct);
  }

  function syncHtmlAudioVolume() {
    if (!htmlAudio) return;
    htmlAudio.volume = Math.min(1, htmlInputLinearGain * htmlOutputLinearGain);
  }

  async function applySink(sinkId: string) {
    const id = !sinkId || sinkId === 'default' ? '' : sinkId;
    if (ctx) {
      await applyOutputSinkToAudioContext(ctx, id);
    } else if (htmlAudio) {
      await applyOutputSink(htmlAudio, id);
    }
  }

  async function start(
    stream: MediaStream,
    sinkId: string,
    outputVolumePct: number,
    inputVolumePct = 100,
  ) {
    stop();
    primeEchoAudioPlayback();
    const outputVol = linearGainFromVolumePct(outputVolumePct);
    const inputVol = linearGainFromVolumePct(inputVolumePct);
    htmlInputLinearGain = inputVol;
    htmlOutputLinearGain = outputVol;
    const ctxCanSink = supportsAudioContextOutputSelection();
    const needWebAudio = ctxCanSink || outputVol > 1 || inputVol > 1;

    if (needWebAudio) {
      const audioCtx = new AudioContext();
      ctx = audioCtx;
      source = audioCtx.createMediaStreamSource(stream);
      inputGainNode = audioCtx.createGain();
      inputGainNode.gain.value = inputVol;
      outputGainNode = audioCtx.createGain();
      outputGainNode.gain.value = outputVol;
      source.connect(inputGainNode);
      inputGainNode.connect(outputGainNode);
      outputGainNode.connect(audioCtx.destination);
      await applySink(sinkId);
      if (audioCtx.state === 'suspended') {
        await audioCtx.resume().catch(() => {});
      }
      return;
    }

    const el = new Audio();
    el.srcObject = stream;
    htmlAudio = el;
    syncHtmlAudioVolume();
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
    inputGainNode = null;
    outputGainNode = null;
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

  return { start, stop, setGain, setInputGain, setOutputGain, applySink };
}
