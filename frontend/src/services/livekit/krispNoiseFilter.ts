import type { LocalAudioTrack } from 'livekit-client';
import type { EchoKrispNoiseFilterOptions } from '@/services/livekit/echoKrispTypes';

type KrispProcessorLike = {
  name?: string;
  processedTrack?: MediaStreamTrack;
  setEnabled: (enable: boolean) => Promise<boolean | undefined>;
  isEnabled: () => boolean;
};

export type EnsureKrispEnabledResult = {
  status: 'enabled' | 'unsupported';
  reused: boolean;
  processor?: KrispProcessorLike;
};

function asKrispProcessorLike(value: unknown): KrispProcessorLike | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<KrispProcessorLike>;
  if (candidate.name !== 'livekit-noise-filter') return null;
  if (
    typeof candidate.setEnabled !== 'function' ||
    typeof candidate.isEnabled !== 'function'
  ) {
    return null;
  }
  return candidate as KrispProcessorLike;
}

export async function isKrispNoiseFilterSupportedSafe(): Promise<boolean> {
  try {
    const { isKrispNoiseFilterSupported } =
      await import('@livekit/krisp-noise-filter');
    return isKrispNoiseFilterSupported();
  } catch {
    return false;
  }
}

export async function ensureKrispNoiseFilterEnabled(
  localAudio: LocalAudioTrack,
  options?: EchoKrispNoiseFilterOptions,
): Promise<EnsureKrispEnabledResult> {
  const current = asKrispProcessorLike(localAudio.getProcessor());
  if (current) {
    if (!current.isEnabled()) {
      await current.setEnabled(true);
    }
    return {
      status: 'enabled',
      reused: true,
      processor: current,
    };
  }

  const mod = await import('@livekit/krisp-noise-filter');
  const { KrispNoiseFilter, isKrispNoiseFilterSupported } = mod;
  if (!isKrispNoiseFilterSupported()) {
    return { status: 'unsupported', reused: false };
  }

  const processor = KrispNoiseFilter(
    options as Parameters<typeof mod.KrispNoiseFilter>[0],
  );
  await localAudio.setProcessor(processor);
  await processor.setEnabled(true);
  return {
    status: 'enabled',
    reused: false,
    processor,
  };
}
