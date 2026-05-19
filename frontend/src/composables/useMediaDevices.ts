import { ref, onMounted, onUnmounted, computed } from 'vue';
import { useUiAudioDevicesStore } from '@/stores/uiAudioDevices';
import { dispatchAppToastDetail } from '@/utils/controllerMissingAction';
import { supportsAudioOutputSelection } from '@/platform/browserCompatibility';

export interface MediaDeviceOption {
  label: string;
  value: string;
}

type DeviceKind = 'audioinput' | 'audiooutput' | 'videoinput';

const FRIENDLY_DEFAULT: Record<DeviceKind, string> = {
  audioinput: 'Default Microphone',
  audiooutput: 'Default Speaker',
  videoinput: 'Default Camera',
};

const NEW_DEVICE_TOAST_MS = 4000;
const DEVICE_CHANGE_DEBOUNCE_MS = 350;

function deviceIdSet(devices: MediaDeviceInfo[]): Set<string> {
  const s = new Set<string>();
  for (const d of devices) {
    const id = d.deviceId?.trim();
    if (id && id !== 'default') s.add(id);
  }
  return s;
}

function notifyNewAudioDevices(
  prevSnap: Set<string>,
  devices: MediaDeviceInfo[],
): void {
  const news = devices.filter(
    (d) =>
      d.deviceId &&
      d.deviceId !== 'default' &&
      !prevSnap.has(d.deviceId) &&
      (d.kind === 'audioinput' || d.kind === 'audiooutput'),
  );
  if (news.length === 0) return;
  const pick =
    news.find((d) => d.kind === 'audioinput') ??
    news.find((d) => d.kind === 'audiooutput');
  if (!pick) return;
  const label =
    pick.label?.trim() ||
    (pick.kind === 'audioinput' ? 'Microphone' : 'Speaker');
  const kindLabel = pick.kind === 'audioinput' ? 'Microphone' : 'Speaker';
  const deviceId = pick.deviceId;
  const kind = pick.kind;
  dispatchAppToastDetail({
    message: `New ${kindLabel} connected`,
    subtitle: label,
    severity: 'info',
    durationMs: NEW_DEVICE_TOAST_MS,
    actions: [
      {
        id: 'switch_to_new_audio_device',
        label: 'Switch',
        kind: 'primary',
        run: () => {
          const store = useUiAudioDevicesStore();
          if (kind === 'audioinput') store.setInputDevice(deviceId);
          else store.setOutputSink(deviceId);
        },
      },
    ],
  });
}

let sharedState: ReturnType<typeof createMediaDevicesState> | null = null;
let refCount = 0;

function createMediaDevicesState() {
  const allDevices = ref<MediaDeviceInfo[]>([]);
  const permissionGranted = ref(false);
  const mediaDevices = navigator.mediaDevices;
  let enumerateBaselineDone = false;
  let deviceChangeDebounce: ReturnType<typeof setTimeout> | null = null;

  function toOptions(kind: DeviceKind): MediaDeviceOption[] {
    if (kind === 'audiooutput' && !supportsAudioOutputSelection()) {
      return [{ label: FRIENDLY_DEFAULT[kind], value: 'default' }];
    }
    const devices = allDevices.value.filter((d) => d.kind === kind);
    if (devices.length === 0) {
      return [{ label: FRIENDLY_DEFAULT[kind], value: 'default' }];
    }
    const opts: MediaDeviceOption[] = [];
    const hasDefault = devices.some((d) => d.deviceId === 'default');
    if (!hasDefault) {
      opts.push({ label: FRIENDLY_DEFAULT[kind], value: 'default' });
    }
    for (const d of devices) {
      const label =
        d.label ||
        (d.deviceId === 'default'
          ? FRIENDLY_DEFAULT[kind]
          : `${kind === 'audioinput' ? 'Microphone' : kind === 'audiooutput' ? 'Speaker' : 'Camera'} (${d.deviceId.slice(0, 8)})`);
      opts.push({ label, value: d.deviceId });
    }
    return opts;
  }

  const inputDevices = computed(() => toOptions('audioinput'));
  const outputDevices = computed(() => toOptions('audiooutput'));
  const cameraDevices = computed(() => toOptions('videoinput'));

  async function enumerate(opts?: { fromDeviceChange?: boolean }) {
    if (!mediaDevices) return;
    try {
      const prevSnap = deviceIdSet(allDevices.value);
      const devices = await mediaDevices.enumerateDevices();
      allDevices.value = devices;
      permissionGranted.value = devices.some((d) => !!d.label);
      if (!enumerateBaselineDone) {
        enumerateBaselineDone = true;
        return;
      }
      if (opts?.fromDeviceChange) {
        notifyNewAudioDevices(prevSnap, devices);
      }
    } catch {
      // Silently keep whatever we have
    }
  }

  async function requestPermissionAndEnumerate() {
    if (permissionGranted.value) return;
    if (!mediaDevices) return;
    try {
      const stream = await mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
      await enumerate();
    } catch {
      await enumerate();
    }
  }

  /** Needed so `videoinput` entries get real labels (browser privacy). */
  async function requestVideoPermissionAndEnumerate() {
    if (!mediaDevices) return;
    try {
      const stream = await mediaDevices.getUserMedia({ video: true });
      stream.getTracks().forEach((t) => t.stop());
      await enumerate();
      permissionGranted.value = allDevices.value.some((d) => !!d.label);
    } catch {
      await enumerate();
    }
  }

  function onDeviceChange() {
    if (deviceChangeDebounce != null) clearTimeout(deviceChangeDebounce);
    deviceChangeDebounce = setTimeout(() => {
      deviceChangeDebounce = null;
      void enumerate({ fromDeviceChange: true });
    }, DEVICE_CHANGE_DEBOUNCE_MS);
  }

  function start() {
    void enumerate();
    if (!mediaDevices?.addEventListener) return;
    mediaDevices.addEventListener('devicechange', onDeviceChange);
  }

  function stop() {
    if (deviceChangeDebounce != null) {
      clearTimeout(deviceChangeDebounce);
      deviceChangeDebounce = null;
    }
    if (!mediaDevices?.removeEventListener) return;
    mediaDevices.removeEventListener('devicechange', onDeviceChange);
  }

  return {
    allDevices,
    permissionGranted,
    inputDevices,
    outputDevices,
    cameraDevices,
    enumerate,
    requestPermissionAndEnumerate,
    requestVideoPermissionAndEnumerate,
    start,
    stop,
  };
}

/**
 * Shared composable that enumerates real audio/video devices via
 * `navigator.mediaDevices.enumerateDevices()` and keeps the list
 * updated when devices are plugged/unplugged.
 *
 * The internal state is a singleton — multiple components share it.
 */
export function useMediaDevices() {
  if (!sharedState) {
    sharedState = createMediaDevicesState();
  }
  const state = sharedState;

  onMounted(() => {
    if (refCount === 0) state.start();
    refCount++;
  });

  onUnmounted(() => {
    refCount--;
    if (refCount <= 0) {
      state.stop();
      refCount = 0;
    }
  });

  return {
    inputDevices: state.inputDevices,
    outputDevices: state.outputDevices,
    cameraDevices: state.cameraDevices,
    permissionGranted: state.permissionGranted,
    requestPermissionAndEnumerate: state.requestPermissionAndEnumerate,
    requestVideoPermissionAndEnumerate:
      state.requestVideoPermissionAndEnumerate,
    enumerate: state.enumerate,
  };
}
