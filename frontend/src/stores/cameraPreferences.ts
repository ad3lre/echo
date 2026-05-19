import { defineStore } from 'pinia';
import { ref, watch } from 'vue';
import type { VideoQualityPreset } from '@/composables/useLiveKitVoiceRoom';

const STORAGE_KEY = 'echo-camera-preferences-v1';
const STORAGE_CAMERA_DEVICE = 'echo-ui-camera-input-device';
const STORAGE_VIDEO_QUALITY = 'echo-ui-video-quality-v1';
const DEFAULT_MIRROR_LOCAL_VIDEO = true;

const VIDEO_QUALITY_CHOICES: readonly VideoQualityPreset[] = [
  '720p',
  '480p',
  '360p',
  '180p',
];

function normalizeCameraDeviceId(id: string | null | undefined): string {
  const t = id?.trim();
  return t || 'default';
}

function loadCameraDeviceId(): string {
  if (typeof localStorage === 'undefined') return 'default';
  try {
    const raw = localStorage.getItem(STORAGE_CAMERA_DEVICE);
    if (raw) return normalizeCameraDeviceId(raw);
  } catch {
    /* ignore */
  }
  return 'default';
}

function loadVideoQualityPreset(): VideoQualityPreset {
  if (typeof localStorage === 'undefined') return '720p';
  try {
    const raw = localStorage.getItem(STORAGE_VIDEO_QUALITY)?.trim();
    if (raw && (VIDEO_QUALITY_CHOICES as readonly string[]).includes(raw)) {
      return raw as VideoQualityPreset;
    }
  } catch {
    /* ignore */
  }
  return '720p';
}

function loadMirror(): boolean {
  if (typeof localStorage === 'undefined') return DEFAULT_MIRROR_LOCAL_VIDEO;
  try {
    const raw = localStorage.getItem(STORAGE_KEY)?.trim();
    if (!raw) return DEFAULT_MIRROR_LOCAL_VIDEO;
    if (raw === '1' || raw === 'true') return true;
    if (raw === '0' || raw === 'false') return false;
    // Self-heal unexpected values.
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
  return DEFAULT_MIRROR_LOCAL_VIDEO;
}

/**
 * Camera UI preferences shared by Settings preview and in-call local video (CallView).
 */
export const useCameraPreferencesStore = defineStore(
  'cameraPreferences',
  () => {
    const mirrorLocalVideo = ref(loadMirror());
    const cameraDeviceId = ref(loadCameraDeviceId());
    const vcVideoQualityPreset = ref<VideoQualityPreset>(
      loadVideoQualityPreset(),
    );
    let lastPersistedValue: boolean | null = null;

    function persist() {
      if (typeof localStorage === 'undefined') return;
      if (lastPersistedValue === mirrorLocalVideo.value) return;
      try {
        localStorage.setItem(STORAGE_KEY, mirrorLocalVideo.value ? '1' : '0');
        lastPersistedValue = mirrorLocalVideo.value;
      } catch {
        /* ignore */
      }
    }

    watch(mirrorLocalVideo, persist);

    watch(cameraDeviceId, () => {
      if (typeof localStorage === 'undefined') return;
      try {
        localStorage.setItem(STORAGE_CAMERA_DEVICE, cameraDeviceId.value);
      } catch {
        /* ignore */
      }
    });

    watch(vcVideoQualityPreset, () => {
      if (typeof localStorage === 'undefined') return;
      try {
        localStorage.setItem(STORAGE_VIDEO_QUALITY, vcVideoQualityPreset.value);
      } catch {
        /* ignore */
      }
    });

    function setMirrorLocalVideo(v: boolean) {
      if (mirrorLocalVideo.value === v) return;
      mirrorLocalVideo.value = v;
    }

    function setCameraDeviceId(id: string) {
      cameraDeviceId.value = normalizeCameraDeviceId(id);
    }

    function setVcVideoQualityPreset(q: VideoQualityPreset) {
      if (!VIDEO_QUALITY_CHOICES.includes(q)) return;
      vcVideoQualityPreset.value = q;
    }

    return {
      mirrorLocalVideo,
      cameraDeviceId,
      vcVideoQualityPreset,
      setMirrorLocalVideo,
      setCameraDeviceId,
      setVcVideoQualityPreset,
    };
  },
);
