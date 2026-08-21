<script setup lang="ts">
import { ref } from 'vue';
import CameraPreview from '@/features/voice/CameraPreview.vue';
import EchoDropdown from '@/components/EchoDropdown.vue';
import { useMediaDevices } from '@/features/voice/useMediaDevices';

defineProps<{
  open: boolean;
  selectedDeviceId: string;
}>();

const emit = defineEmits<{
  (e: 'update:open', v: boolean): void;
  (e: 'update:selectedDeviceId', v: string): void;
  (e: 'confirm'): void;
}>();

const { cameraDevices } = useMediaDevices();
const previewRef = ref<InstanceType<typeof CameraPreview> | null>(null);

function selectDevice(id: string) {
  emit('update:selectedDeviceId', id);
  previewRef.value?.startPreview(id);
}

function close() {
  emit('update:open', false);
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="fixed inset-0 z-[200] flex items-center justify-center bg-overlay-heavy p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="vc-camera-setup-title"
      @click.self="close"
    >
      <div
        class="max-h-[min(90vh,720px)] w-full max-w-md overflow-y-auto rounded-xl border border-border bg-[var(--echo-channel-panel-bg)] p-4 shadow-xl"
        @click.stop
      >
        <h2
          id="vc-camera-setup-title"
          class="mb-1 text-sm font-semibold text-fg"
        >
          Camera setup
        </h2>
        <p class="mb-3 text-xs leading-relaxed text-fg-subtle">
          Pick a camera from the list to preview and grant access. Video quality
          is configured in Settings &rarr; Voice &amp; Video.
        </p>
        <EchoDropdown
          :model-value="selectedDeviceId || 'default'"
          label="Camera"
          :options="cameraDevices"
          class="mb-3"
          @update:model-value="selectDevice($event)"
        />
        <CameraPreview
          ref="previewRef"
          :selected-device-id="selectedDeviceId"
          :quality="'480p'"
        />
        <div class="mt-4 flex justify-end gap-2">
          <button
            type="button"
            class="rounded-lg px-3 py-1.5 text-sm text-fg-soft transition-colors hover:bg-glass-hover"
            @click="close"
          >
            Cancel
          </button>
          <button
            type="button"
            class="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-indigo-500"
            @click="emit('confirm')"
          >
            Start video
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
