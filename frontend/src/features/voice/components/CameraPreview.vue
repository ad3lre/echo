<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted, computed } from 'vue';
import type { VideoQualityPreset } from '@/composables/useLiveKitVoiceRoom';

const props = defineProps<{
  selectedDeviceId?: string;
  mirror?: boolean;
  quality?: VideoQualityPreset;
  /** When true the preview starts automatically for the selected device. */
  autoStart?: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:active', active: boolean): void;
}>();

const videoRef = ref<HTMLVideoElement | null>(null);
const previewStream = ref<MediaStream | null>(null);
const hasPermission = ref(false);
const errorMessage = ref('');

const QUALITY_IDEAL: Record<
  VideoQualityPreset,
  { width: number; height: number }
> = {
  '720p': { width: 1280, height: 720 },
  '480p': { width: 854, height: 480 },
  '360p': { width: 640, height: 360 },
  '180p': { width: 320, height: 180 },
};

const selectedDevice = computed(() => props.selectedDeviceId || 'default');

async function startPreview(deviceId?: string) {
  stopPreview();
  errorMessage.value = '';
  const id = deviceId ?? selectedDevice.value;
  const q = props.quality ?? '480p';
  const ideal = QUALITY_IDEAL[q] ?? QUALITY_IDEAL['480p'];
  try {
    const constraints: MediaStreamConstraints = {
      video: {
        deviceId: id !== 'default' ? { exact: id } : undefined,
        width: { ideal: ideal.width },
        height: { ideal: ideal.height },
      },
      audio: false,
    };
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    previewStream.value = stream;
    hasPermission.value = true;
    emit('update:active', true);
    if (videoRef.value) {
      videoRef.value.srcObject = stream;
    }
  } catch (e) {
    const err = e as Error;
    if (err.name === 'NotAllowedError') {
      errorMessage.value = 'Camera access denied. Check browser permissions.';
    } else if (err.name === 'NotFoundError') {
      errorMessage.value = 'No camera found.';
    } else {
      errorMessage.value = `Camera error: ${err.message}`;
    }
  }
}

function stopPreview() {
  if (previewStream.value) {
    previewStream.value.getTracks().forEach((t) => t.stop());
    previewStream.value = null;
    emit('update:active', false);
  }
  if (videoRef.value) {
    videoRef.value.srcObject = null;
  }
}

defineExpose({ startPreview, stopPreview });

watch(
  () => props.selectedDeviceId,
  () => {
    if (hasPermission.value) void startPreview();
  },
);

watch(
  () => props.quality,
  () => {
    if (hasPermission.value) void startPreview();
  },
);

onMounted(() => {
  if (props.autoStart) void startPreview();
});

onUnmounted(() => {
  stopPreview();
});
</script>

<template>
  <div class="camera-preview">
    <div class="camera-preview-viewport">
      <video
        v-show="previewStream && !errorMessage"
        ref="videoRef"
        autoplay
        playsinline
        muted
        class="camera-preview-video"
        :class="{ 'camera-preview-video--mirrored': mirror !== false }"
      />
      <div
        v-if="errorMessage"
        class="camera-preview-overlay camera-preview-overlay--error"
      >
        <svg
          class="camera-preview-icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
        >
          <path
            d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
          <line x1="3" y1="3" x2="21" y2="21" stroke-linecap="round" />
        </svg>
        <span>{{ errorMessage }}</span>
      </div>
      <div
        v-else-if="!previewStream"
        class="camera-preview-overlay camera-preview-overlay--idle"
      >
        <svg
          class="camera-preview-icon camera-preview-icon--lg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
        >
          <path
            d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
        <span>Choose a camera to start preview</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.camera-preview {
  width: 100%;
}

.camera-preview-viewport {
  position: relative;
  border-radius: 0.75rem;
  overflow: hidden;
  background: color-mix(in srgb, black 60%, transparent);
  aspect-ratio: 16 / 9;
}

.camera-preview-video {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.camera-preview-video--mirrored {
  transform: scaleX(-1);
}

.camera-preview-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 1rem;
  text-align: center;
  font-size: 0.8rem;
  line-height: 1.4;
}

.camera-preview-overlay--idle {
  color: color-mix(in srgb, white 35%, transparent);
}

.camera-preview-overlay--error {
  color: color-mix(in srgb, white 55%, transparent);
}

.camera-preview-icon {
  width: 1.5rem;
  height: 1.5rem;
  opacity: 0.7;
}

.camera-preview-icon--lg {
  width: 2.25rem;
  height: 2.25rem;
  opacity: 0.4;
}
</style>
