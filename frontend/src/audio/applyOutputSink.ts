import { useUiAudioDevicesStore } from '@/stores/uiAudioDevices';
import { normalizeAudioOutputDeviceId } from '@/platform/browserCompatibility';

type MediaWithSink = HTMLMediaElement & {
  setSinkId?: (id: string) => Promise<void>;
};

type AudioContextWithSink = AudioContext & {
  setSinkId?: (id: string) => Promise<void>;
};

function resolveOutputSinkId(sinkIdRaw?: string | null): string {
  if (sinkIdRaw !== undefined) {
    return normalizeAudioOutputDeviceId(sinkIdRaw);
  }
  const store = useUiAudioDevicesStore();
  return normalizeAudioOutputDeviceId(store.outputSinkId);
}

export async function applyOutputSink(
  el: HTMLMediaElement,
  sinkIdRaw?: string | null,
): Promise<void> {
  const id = resolveOutputSinkId(sinkIdRaw);
  if (!id || id === 'default') return;
  const withSink = el as MediaWithSink;
  if (typeof withSink.setSinkId !== 'function') return;
  try {
    await withSink.setSinkId(id);
  } catch {
    /* unsupported or permission */
  }
}

export async function applyOutputSinkToAudioContext(
  ctx: AudioContext,
  sinkIdRaw?: string | null,
): Promise<void> {
  const id = resolveOutputSinkId(sinkIdRaw);
  if (!id || id === 'default') return;
  const withSink = ctx as AudioContextWithSink;
  if (typeof withSink.setSinkId !== 'function') return;
  try {
    await withSink.setSinkId(id);
  } catch {
    /* unsupported or permission */
  }
}
