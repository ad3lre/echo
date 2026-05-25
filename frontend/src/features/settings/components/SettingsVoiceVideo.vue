<script setup lang="ts">
import { ref, watch, onUnmounted, inject, computed } from 'vue';
import { storeToRefs } from 'pinia';
import EchoDropdown from '@/components/EchoDropdown.vue';
import CameraPreview from '@/components/CameraPreview.vue';
import { useMediaDevices } from '@/composables/useMediaDevices';
import { useAudioLevelMonitor } from '@/composables/useAudioLevelMonitor';
import { useMicTestMonitor } from '@/composables/useMicTestMonitor';
import { buildMediaTrackConstraintsFromForm } from '@/composables/voiceProcessingPreferences';
import { isKrispNoiseFilterSupportedSafe } from '@/services/livekit/krispNoiseFilter';
import {
  ECHO_VOICE_PROCESSING_KEY,
  type EchoVoiceProcessingApi,
} from '@/composables/voiceProcessingInjection';
import { useUiAudioDevicesStore } from '@/stores/uiAudioDevices';
import { useVoiceLevelsStore } from '@/stores/voiceLevels';
import { useCameraPreferencesStore } from '@/stores/cameraPreferences';
import { useDevSettingsStore } from '@/stores/devSettings';
import type { VideoQualityPreset } from '@/composables/useLiveKitVoiceRoom';
import { echoSyncCapabilities } from '@/platform/syncCapabilities';
import { isIosLikeBrowser } from '@/platform/browserCompatibility';
import { rmsToDbfs, thresholdPercentToRms } from '@/composables/voiceGate';
import type { SettingsForm } from '@/features/settings/composables/useSettingsForm';

const videoQualityOptions: { value: VideoQualityPreset; label: string }[] = [
  { value: '720p', label: '720p (HD)' },
  { value: '480p', label: '480p (SD)' },
  { value: '360p', label: '360p' },
  { value: '180p', label: '180p (Low)' },
];

const krispQualityOptions: {
  value: 'low' | 'medium' | 'high';
  label: string;
}[] = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Balanced' },
  { value: 'high', label: 'High' },
];

const processingModeOptions: {
  value: 'krisp' | 'browser' | 'native';
  label: string;
}[] = [
  { value: 'krisp', label: 'Enhanced (Krisp)' },
  { value: 'browser', label: 'Standard (browser)' },
  { value: 'native', label: 'Minimal (native)' },
];

const echoVoiceApi = inject<EchoVoiceProcessingApi | null>(
  ECHO_VOICE_PROCESSING_KEY,
  null,
);

interface MediaDeviceOption {
  label: string;
  value: string;
}

const props = defineProps<{
  form: SettingsForm;
  inputDeviceOptions?: MediaDeviceOption[];
  outputDeviceOptions?: MediaDeviceOption[];
  cameraDeviceOptions?: MediaDeviceOption[];
}>();

const {
  inputDevices,
  outputDevices,
  cameraDevices,
  permissionGranted,
  requestPermissionAndEnumerate,
} = useMediaDevices();

const {
  dbfs: micDbfs,
  attachStream,
  stop: stopMonitor,
  setSpeakingThreshold,
} = useAudioLevelMonitor();

const micMonitor = useMicTestMonitor();
const uiAudioDevices = useUiAudioDevicesStore();
const voiceLevels = useVoiceLevelsStore();
const {
  outputEffectivePercent,
  inputEffectivePercent,
  outputVolumePercent,
  maxBoostEnabled,
  maxBoostLevel,
} = storeToRefs(voiceLevels);
const cameraPreferences = useCameraPreferencesStore();
const devSettings = useDevSettingsStore();

const cameraPreviewRef = ref<InstanceType<typeof CameraPreview> | null>(null);
const cameraPreviewActive = ref(false);

const micTestActive = ref(false);
const showMaxBoostWarningModal = ref(false);
const micTestBarRef = ref<HTMLElement | null>(null);
const draggingThresholdHandle = ref(false);
let testStream: MediaStream | null = null;
let micTestSessionId = 0;
const audioOutputSelectionSupported = computed(
  () => echoSyncCapabilities.browser.supportsAudioOutputSelection,
);

const iosLikeOutputHint = computed(
  () => !audioOutputSelectionSupported.value && isIosLikeBrowser(),
);

function settingsSliderFillPct(vol: number): string {
  const m = voiceLevels.sliderMax;
  if (m <= 0) return '0%';
  return `${(vol / m) * 100}%`;
}

function dbfsToMeterPct(dbfs: number): number {
  const floor = -60;
  if (dbfs <= floor) return 0;
  if (dbfs >= 0) return 100;
  return ((dbfs - floor) / (0 - floor)) * 100;
}

const effectiveMicDbfs = computed(() => {
  // Apply manual send gain to the measured signal so the meter reflects what
  // your configured input level is doing.
  const gainFactor = Math.max(0, voiceLevels.inputGain);
  const gainDb = gainFactor > 0 ? 20 * Math.log10(gainFactor) : -100;
  const gainedDb = Math.max(-100, Math.min(0, micDbfs.value + gainDb));
  const gateDb = gateThresholdDbfs.value;
  return gainedDb < gateDb ? -100 : gainedDb;
});

const micMeterWidth = computed(
  () => `${dbfsToMeterPct(effectiveMicDbfs.value)}%`,
);
const gateThresholdDbfs = computed(() =>
  rmsToDbfs(thresholdPercentToRms(voiceLevels.voiceActivationThresholdPercent)),
);
const micGateOpen = computed(() => effectiveMicDbfs.value > -99);

async function startMicTest() {
  const sessionId = ++micTestSessionId;
  resetMicTestResources();
  const form = props.form;
  try {
    const krispUnsupported =
      form.voiceProcessingMode === 'krisp' &&
      !(await isKrispNoiseFilterSupportedSafe());
    const base = buildMediaTrackConstraintsFromForm(
      form.voiceProcessingMode,
      {
        echoCancellation: form.voiceSettings.echoCancellation,
        noiseSuppression: form.voiceSettings.noiseSuppression,
        automaticGainControl: form.voiceSettings.automaticGainControl,
      },
      krispUnsupported,
    );
    const audio: MediaTrackConstraints =
      form.inputDevice && form.inputDevice !== 'default'
        ? { ...base, deviceId: { exact: form.inputDevice } }
        : base;
    const localStream = await navigator.mediaDevices.getUserMedia({ audio });
    if (sessionId !== micTestSessionId) {
      localStream.getTracks().forEach((t) => t.stop());
      return;
    }
    const micTrack = localStream.getAudioTracks()[0];
    console.warn('[Echo:MicTest] requested_constraints', audio);
    console.warn(
      '[Echo:MicTest] actual_settings',
      micTrack?.getSettings() ?? 'no track',
    );
    testStream = localStream;
    // Do not route Krisp's `processedTrack` into the mic test graph: it often yields silence
    // with Web Audio (`createMediaStreamSource`) even when voice calls work. Krisp still runs
    // on the published mic in `useLiveKitVoiceRoom`; this test uses the same capture constraints.
    attachStream(localStream);
    await micMonitor.start(
      localStream,
      form.outputDevice ?? 'default',
      voiceLevels.outputEffectivePercent,
      voiceLevels.inputEffectivePercent,
    );
    echoVoiceApi?.setMicTestListenDeafen?.(true);
  } catch {
    if (sessionId !== micTestSessionId) return;
    resetMicTestResources();
    micTestActive.value = false;
  }
}

function resetMicTestResources() {
  echoVoiceApi?.setMicTestListenDeafen?.(false);
  micMonitor.stop();
  stopMonitor();
  if (testStream) {
    testStream.getTracks().forEach((t) => t.stop());
    testStream = null;
  }
}

function stopMicTest() {
  micTestSessionId += 1;
  resetMicTestResources();
}

function toggleMicTest() {
  if (micTestActive.value) {
    stopMicTest();
    micTestActive.value = false;
  } else {
    micTestActive.value = true;
  }
}

const showMicTestManualGainHandle = computed(
  () => !props.form.voiceSettings.automaticGainControl,
);

const gateModeLabel = computed(() => {
  if (voiceLevels.outboundGateMode === 'none') return 'None';
  if (voiceLevels.outboundGateMode === 'hard') return 'Hard';
  return 'Soft';
});

function toggleGateMode() {
  if (props.form.voiceProcessingMode === 'native') {
    if (voiceLevels.outboundGateMode === 'none') {
      voiceLevels.setOutboundGateMode('soft');
    } else if (voiceLevels.outboundGateMode === 'soft') {
      voiceLevels.setOutboundGateMode('hard');
    } else {
      voiceLevels.setOutboundGateMode('none');
    }
    return;
  }
  voiceLevels.setOutboundGateMode(
    voiceLevels.outboundGateMode === 'hard' ? 'soft' : 'hard',
  );
}

const thresholdHandleLeft = computed(
  () => `${voiceLevels.voiceActivationThresholdPercent}%`,
);

function setThresholdFromClientX(clientX: number) {
  const el = micTestBarRef.value;
  if (!el) return;
  const rect = el.getBoundingClientRect();
  if (rect.width <= 0) return;
  const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
  voiceLevels.setVoiceActivationThresholdPercent(Math.round(ratio * 100));
}

function onThresholdHandlePointerDown(e: PointerEvent) {
  if (!showMicTestManualGainHandle.value) return;
  draggingThresholdHandle.value = true;
  setThresholdFromClientX(e.clientX);
  window.addEventListener('pointermove', onWindowPointerMoveForThreshold);
  window.addEventListener('pointerup', onWindowPointerUpForThreshold);
}

function onMicTestBarPointerDown(e: PointerEvent) {
  if (!showMicTestManualGainHandle.value) return;
  setThresholdFromClientX(e.clientX);
  onThresholdHandlePointerDown(e);
}

function onWindowPointerMoveForThreshold(e: PointerEvent) {
  if (!draggingThresholdHandle.value) return;
  setThresholdFromClientX(e.clientX);
}

function onWindowPointerUpForThreshold() {
  draggingThresholdHandle.value = false;
  window.removeEventListener('pointermove', onWindowPointerMoveForThreshold);
  window.removeEventListener('pointerup', onWindowPointerUpForThreshold);
}

function onMaxBoostToggleRequest(next: boolean) {
  if (!next) {
    voiceLevels.setMaxBoostEnabled(false);
    return;
  }
  showMaxBoostWarningModal.value = true;
}

function confirmEnableMaxBoost() {
  voiceLevels.setMaxBoostEnabled(true);
  showMaxBoostWarningModal.value = false;
}

function cancelEnableMaxBoost() {
  showMaxBoostWarningModal.value = false;
}

function onCameraPreviewToggle() {
  if (cameraPreviewActive.value) {
    cameraPreviewRef.value?.stopPreview();
  } else {
    cameraPreviewRef.value?.startPreview();
  }
}

watch(
  () => devSettings.devModeIdsEnabled,
  (enabled) => {
    if (!enabled && voiceLevels.maxBoostEnabled) {
      voiceLevels.setMaxBoostEnabled(false);
    }
  },
  { immediate: true },
);

watch(
  () => permissionGranted.value,
  (granted) => {
    if (!granted) void requestPermissionAndEnumerate();
  },
  { immediate: true },
);

watch(
  () => [
    micTestActive.value,
    props.form.voiceProcessingMode,
    props.form.voiceSettings.echoCancellation,
    props.form.voiceSettings.noiseSuppression,
    props.form.voiceSettings.automaticGainControl,
    props.form.voiceKrispSettings.useBVC,
    props.form.voiceKrispSettings.quality,
    props.form.inputDevice,
    voiceLevels.maxBoostEnabled,
  ],
  () => {
    if (!micTestActive.value) return;
    void startMicTest();
  },
);

watch(
  () => voiceLevels.voiceActivationThresholdPercent,
  (pct) => {
    setSpeakingThreshold(thresholdPercentToRms(pct));
  },
  { immediate: true },
);

watch(
  () => props.form.voiceProcessingMode,
  (mode) => {
    if (mode === 'native' && voiceLevels.outboundGateMode !== 'none') {
      voiceLevels.setOutboundGateMode('none');
    } else if (mode !== 'native' && voiceLevels.outboundGateMode === 'none') {
      voiceLevels.setOutboundGateMode('soft');
    }
  },
  { immediate: true },
);

watch(
  [
    () => props.form.outputDevice,
    outputEffectivePercent,
    outputVolumePercent,
    maxBoostEnabled,
    maxBoostLevel,
  ],
  () => {
    if (!micTestActive.value || !testStream) return;
    void micMonitor.applySink(props.form.outputDevice ?? 'default');
    micMonitor.setOutputGain(outputEffectivePercent.value);
  },
);

watch([inputEffectivePercent, maxBoostEnabled, maxBoostLevel], () => {
  if (!micTestActive.value || !testStream) return;
  micMonitor.setInputGain(inputEffectivePercent.value);
});

watch(
  () => props.form.outputDevice,
  (v) => {
    if (v) uiAudioDevices.setOutputSink(v);
  },
  { immediate: true },
);

watch(
  audioOutputSelectionSupported,
  (supported) => {
    if (!supported) {
      props.form.outputDevice = 'default';
    }
  },
  { immediate: true },
);

watch(
  () => props.form.inputDevice,
  (v) => {
    if (v) uiAudioDevices.setInputDevice(v);
  },
);

onUnmounted(() => {
  stopMicTest();
  onWindowPointerUpForThreshold();
  cameraPreviewRef.value?.stopPreview();
});

watch(
  () => props.form.cameraDevice,
  (v) => {
    if (v) cameraPreferences.setCameraDeviceId(v);
  },
  { immediate: true },
);

watch(
  () => props.form.videoQuality,
  (q) => {
    if (!q) return;
    cameraPreferences.setVcVideoQualityPreset(q);
    echoVoiceApi?.setVcVideoQuality?.(q);
  },
  { flush: 'post', immediate: true },
);
</script>

<template>
  <div class="flex flex-col gap-6">
    <div class="settings-card rounded-2xl p-6">
      <div class="grid gap-6 md:grid-cols-2">
        <EchoDropdown
          v-model="form.inputDevice"
          label="Input Device"
          :options="inputDevices"
        />
        <EchoDropdown
          v-model="form.outputDevice"
          label="Output Device"
          :options="outputDevices"
          :disabled="!audioOutputSelectionSupported"
        />
      </div>
      <p
        v-if="!audioOutputSelectionSupported"
        class="mt-3 text-[11px] leading-snug text-fg-subtle"
      >
        <template v-if="iosLikeOutputHint">
          On iPhone and iPad Safari, audio playback follows the system speaker —
          Echo cannot apply a separate output device here (this is not a bug
          with saving).
        </template>
        <template v-else>
          This browser uses the system default speaker for playback, so Echo
          keeps Output Device on Default.
        </template>
      </p>
      <div class="mt-8 grid gap-8 md:grid-cols-2">
        <div class="flex flex-col gap-4">
          <div class="flex items-center justify-between gap-2">
            <div class="min-w-0">
              <span class="settings-label">Input volume</span>
            </div>
            <span class="text-xs font-bold text-indigo-300 shrink-0"
              >{{ voiceLevels.inputEffectivePercent }}%</span
            >
          </div>
          <input
            class="settings-voice-slider settings-voice-slider--input-gain w-full"
            type="range"
            min="0"
            :max="voiceLevels.sliderMax"
            :value="voiceLevels.inputSensitivityPercent"
            :style="{
              '--value': settingsSliderFillPct(
                voiceLevels.inputSensitivityPercent,
              ),
            }"
            aria-label="Input volume"
            @input="
              voiceLevels.setInputSensitivityPercent(
                Number(($event.target as HTMLInputElement).value),
              )
            "
          />
          <label
            v-if="devSettings.devModeIdsEnabled"
            class="mt-1 inline-flex items-center gap-2 cursor-pointer text-sm text-fg-soft select-none"
          >
            <input
              type="checkbox"
              class="accent-indigo-400 h-4 w-4 rounded border-border"
              :checked="voiceLevels.maxBoostEnabled"
              @change="
                onMaxBoostToggleRequest(
                  ($event.target as HTMLInputElement).checked,
                )
              "
            />
            <span class="font-semibold">Max boost</span>
          </label>
        </div>
        <div class="flex flex-col gap-4">
          <div class="flex items-center justify-between">
            <span class="settings-label">Output volume</span
            ><span class="text-xs font-bold text-indigo-300"
              >{{ voiceLevels.outputEffectivePercent }}%</span
            >
          </div>
          <input
            class="settings-voice-slider w-full accent-indigo-400"
            aria-label="Output volume"
            type="range"
            min="0"
            :max="voiceLevels.sliderMax"
            :value="voiceLevels.outputVolumePercent"
            :style="{
              '--value': settingsSliderFillPct(voiceLevels.outputVolumePercent),
            }"
            @input="
              voiceLevels.setOutputVolumePercent(
                Number(($event.target as HTMLInputElement).value),
              )
            "
          />
          <div
            v-if="devSettings.devModeIdsEnabled && voiceLevels.maxBoostEnabled"
            class="pt-1"
          >
            <div class="flex items-center justify-between">
              <span class="settings-label">Max boost level</span>
              <span class="text-xs font-bold text-amber-300"
                >{{ voiceLevels.maxBoostLevel }}x</span
              >
            </div>
            <input
              class="settings-voice-slider w-full mt-2"
              aria-label="Max boost level"
              type="range"
              min="2"
              max="6"
              step="1"
              :value="voiceLevels.maxBoostLevel"
              :style="{
                '--value': `${((voiceLevels.maxBoostLevel - 2) / 4) * 100}%`,
              }"
              @input="
                voiceLevels.setMaxBoostLevel(
                  Number(($event.target as HTMLInputElement).value),
                )
              "
            />
          </div>
        </div>
      </div>
      <div class="mt-8">
        <div class="flex items-center gap-3 mb-2">
          <span class="settings-label">Mic</span>
          <button
            type="button"
            class="text-xs font-semibold px-3 py-1 rounded-lg transition-colors"
            :class="
              micTestActive
                ? 'bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30'
                : 'bg-glass-1 text-fg-soft hover:bg-glass-hover hover:text-fg-soft'
            "
            @click="toggleMicTest()"
          >
            {{ micTestActive ? 'Stop' : 'Listen' }}
          </button>
          <button
            type="button"
            class="text-xs font-semibold px-3 py-1 rounded-lg transition-colors"
            :class="
              !form.voiceSettings.automaticGainControl
                ? 'bg-indigo-500/20 text-indigo-200 hover:bg-indigo-500/30'
                : 'bg-glass-1 text-fg-soft hover:bg-glass-hover hover:text-fg-soft'
            "
            @click="
              form.voiceSettings.automaticGainControl =
                !form.voiceSettings.automaticGainControl
            "
          >
            Gain:
            {{ form.voiceSettings.automaticGainControl ? 'Auto' : 'Manual' }}
          </button>
          <button
            v-if="!form.voiceSettings.automaticGainControl"
            type="button"
            class="text-xs font-semibold px-3 py-1 rounded-lg transition-colors"
            :class="
              voiceLevels.outboundGateMode === 'none'
                ? 'bg-glass-2 text-fg-soft hover:bg-glass-3'
                : voiceLevels.outboundGateMode === 'hard'
                  ? 'bg-rose-500/20 text-rose-200 hover:bg-rose-500/30'
                  : 'bg-indigo-500/20 text-indigo-200 hover:bg-indigo-500/30'
            "
            @click="toggleGateMode()"
          >
            Gate: {{ gateModeLabel }}
          </button>
          <span
            v-if="showMicTestManualGainHandle"
            class="ml-auto text-xs font-bold text-indigo-300"
            >Threshold {{ voiceLevels.voiceActivationThresholdPercent }}%</span
          >
        </div>
        <div
          ref="micTestBarRef"
          class="mic-test-bar-track h-2 rounded-full bg-scrim-2 overflow-hidden"
          :class="showMicTestManualGainHandle ? 'cursor-pointer' : ''"
          @pointerdown="onMicTestBarPointerDown"
        >
          <div
            class="mic-test-bar-fill h-full rounded-full transition-all duration-75"
            :class="micGateOpen ? 'bg-emerald-400' : 'bg-glass-active'"
            :style="{ width: micMeterWidth }"
          />
          <button
            v-if="showMicTestManualGainHandle"
            type="button"
            class="mic-test-threshold-handle"
            :class="
              draggingThresholdHandle
                ? 'mic-test-threshold-handle--dragging'
                : ''
            "
            :style="{ left: thresholdHandleLeft }"
            aria-label="Voice activity threshold"
            @pointerdown.stop.prevent="onThresholdHandlePointerDown"
          />
        </div>
        <p
          v-if="micTestActive"
          class="mt-2 text-[11px] leading-snug text-fg-subtle"
        >
          Your voice is played through the selected Output Device (use
          headphones to avoid feedback).
        </p>
        <p
          v-if="micTestActive && showMicTestManualGainHandle"
          class="mt-1 text-[11px] leading-snug text-indigo-200/70"
        >
          Manual gain control is active (AGC is off).
        </p>
        <div v-if="micTestActive && showMicTestManualGainHandle" class="mt-3">
          <div class="flex items-center justify-between gap-2 mb-2">
            <span class="settings-label">Manual gain</span>
            <span class="text-xs font-bold text-indigo-300"
              >{{ voiceLevels.inputEffectivePercent }}%</span
            >
          </div>
          <input
            class="settings-voice-slider settings-voice-slider--input-gain w-full"
            type="range"
            min="0"
            :max="voiceLevels.sliderMax"
            :value="voiceLevels.inputSensitivityPercent"
            :style="{
              '--value': settingsSliderFillPct(
                voiceLevels.inputSensitivityPercent,
              ),
            }"
            aria-label="Manual gain"
            @input="
              voiceLevels.setInputSensitivityPercent(
                Number(($event.target as HTMLInputElement).value),
              )
            "
          />
        </div>
      </div>
      <div class="mt-8">
        <div class="mb-2">
          <span class="text-xs font-semibold uppercase tracking-wide text-muted"
            >Voice processing controls</span
          >
        </div>
        <div
          v-if="form.voiceProcessingMode !== 'krisp'"
          :class="[
            'voice-processing-toggle-group mb-3',
            form.voiceProcessingMode === 'browser' &&
              'voice-processing-toggle-group--browser-single-row',
          ]"
        >
          <EchoDropdown
            class="voice-processing-widget voice-processing-dropdown"
            :model-value="form.voiceProcessingMode"
            :options="processingModeOptions"
            @update:model-value="
              form.voiceProcessingMode = $event as
                | 'krisp'
                | 'browser'
                | 'native'
            "
          />
          <button
            v-if="form.voiceProcessingMode === 'browser'"
            type="button"
            class="settings-toggle voice-processing-widget"
            @click="
              form.voiceSettings.echoCancellation =
                !form.voiceSettings.echoCancellation
            "
          >
            <span class="text-left"
              ><span class="block text-sm font-semibold text-foreground"
                >Echo cancellation</span
              ></span
            ><span
              :class="
                form.voiceSettings.echoCancellation
                  ? 'toggle-pill toggle-pill--on'
                  : 'toggle-pill'
              "
            />
          </button>
          <button
            v-if="form.voiceProcessingMode === 'browser'"
            type="button"
            class="settings-toggle voice-processing-widget"
            @click="
              form.voiceSettings.noiseSuppression =
                !form.voiceSettings.noiseSuppression
            "
          >
            <span class="text-left"
              ><span class="block text-sm font-semibold text-foreground"
                >Noise suppression</span
              ></span
            ><span
              :class="
                form.voiceSettings.noiseSuppression
                  ? 'toggle-pill toggle-pill--on'
                  : 'toggle-pill'
              "
            />
          </button>
        </div>
        <div
          v-if="form.voiceProcessingMode === 'krisp'"
          class="mt-1 flex flex-col gap-2"
        >
          <div
            class="voice-processing-toggle-group voice-processing-toggle-group--krisp-single-row"
          >
            <EchoDropdown
              class="voice-processing-widget voice-processing-dropdown"
              :model-value="form.voiceProcessingMode"
              :options="processingModeOptions"
              @update:model-value="
                form.voiceProcessingMode = $event as
                  | 'krisp'
                  | 'browser'
                  | 'native'
              "
            />
            <EchoDropdown
              class="voice-processing-widget voice-processing-dropdown"
              :model-value="form.voiceKrispSettings.quality"
              :options="krispQualityOptions"
              @update:model-value="
                form.voiceKrispSettings.quality = $event as
                  | 'low'
                  | 'medium'
                  | 'high'
              "
            />
            <button
              type="button"
              class="settings-toggle voice-processing-widget"
              @click="
                form.voiceKrispSettings.useBVC = !form.voiceKrispSettings.useBVC
              "
            >
              <span class="text-left"
                ><span class="block text-sm font-semibold text-foreground"
                  >Voice Isolation</span
                ></span
              ><span
                :class="
                  form.voiceKrispSettings.useBVC
                    ? 'toggle-pill toggle-pill--on'
                    : 'toggle-pill'
                "
              />
            </button>
          </div>
        </div>
      </div>
    </div>
    <div
      v-if="showMaxBoostWarningModal"
      class="fixed inset-0 z-[120] flex items-center justify-center bg-overlay-heavy px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="max-boost-warning-title"
    >
      <div
        class="w-full max-w-xl rounded-2xl border border-red-400/30 bg-surface p-6 shadow-2xl"
      >
        <h3
          id="max-boost-warning-title"
          class="text-xl font-bold echo-destructive-text"
        >
          Warning: Max Boost Can Cause Damage
        </h3>
        <p class="mt-3 text-sm leading-relaxed text-fg-soft">
          Max Boost can produce dangerously loud audio levels. This may lead to
          hearing damage and/or speaker damage. It is not recommended.
        </p>
        <p class="mt-2 text-sm leading-relaxed text-fg-soft">
          By continuing, you acknowledge the risk and agree that Echo takes no
          liability for any resulting damage or injury.
        </p>
        <div class="mt-5 flex items-center justify-end gap-3">
          <button
            type="button"
            class="rounded-lg px-4 py-2 text-sm font-semibold bg-glass-2 text-fg-soft hover:bg-glass-3"
            @click="cancelEnableMaxBoost"
          >
            Cancel
          </button>
          <button
            type="button"
            class="rounded-lg px-4 py-2 text-sm font-semibold bg-red-500/80 text-white hover:bg-red-500"
            @click="confirmEnableMaxBoost"
          >
            Enable Max Boost
          </button>
        </div>
      </div>
    </div>
    <div class="grid gap-6">
      <!-- ── Camera ── -->
      <div class="settings-card rounded-2xl p-6">
        <div class="settings-label mb-4">Camera</div>
        <div class="camera-settings-layout">
          <div
            class="camera-settings-preview camera-settings-preview-shell"
            role="button"
            tabindex="0"
            :aria-label="
              cameraPreviewActive
                ? 'Stop camera preview'
                : 'Start camera preview'
            "
            @click="onCameraPreviewToggle"
            @keydown.enter.prevent="onCameraPreviewToggle"
            @keydown.space.prevent="onCameraPreviewToggle"
          >
            <CameraPreview
              ref="cameraPreviewRef"
              :selected-device-id="form.cameraDevice"
              :mirror="cameraPreferences.mirrorLocalVideo"
              :quality="form.videoQuality ?? '720p'"
              @update:active="cameraPreviewActive = $event"
            />
            <div class="camera-settings-preview-status">
              {{
                cameraPreviewActive
                  ? 'Click to stop preview'
                  : 'Click to test camera'
              }}
            </div>
            <button
              type="button"
              class="camera-settings-mirror-btn"
              @click.stop="
                cameraPreferences.setMirrorLocalVideo(
                  !cameraPreferences.mirrorLocalVideo,
                )
              "
            >
              {{
                cameraPreferences.mirrorLocalVideo
                  ? 'Unmirror camera'
                  : 'Mirror camera'
              }}
            </button>
          </div>
          <div class="camera-settings-controls">
            <EchoDropdown
              class="camera-settings-dropdown"
              v-model="form.cameraDevice"
              label="Camera device"
              :options="cameraDevices"
            />
            <EchoDropdown
              class="camera-settings-dropdown"
              :model-value="form.videoQuality ?? '720p'"
              label="Video quality"
              :options="videoQualityOptions"
              @update:model-value="
                form.videoQuality = $event as VideoQualityPreset
              "
            />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
/* Match VC panel slider fill (theme vars from themes.css). */
.settings-voice-slider {
  --value: 0%;
  height: 0.375rem;
  -webkit-appearance: none;
  appearance: none;
  background: linear-gradient(
    to right,
    var(--vc-slider-fill) 0%,
    var(--vc-slider-fill) var(--value),
    var(--vc-slider-track) var(--value),
    var(--vc-slider-track) 100%
  );
  border-radius: 9999px;
  outline: none;
  cursor: pointer;
}
.settings-voice-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--vc-slider-thumb-bg);
  cursor: pointer;
  box-shadow: 0 1px 3px var(--vc-slider-thumb-shadow);
  border: none;
}
.settings-voice-slider::-moz-range-thumb {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--vc-slider-thumb-bg);
  cursor: pointer;
  border: none;
  box-shadow: 0 1px 3px var(--vc-slider-thumb-shadow);
}

.voice-processing-toggle-group {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
}

/** Browser: mode + Echo + Noise on one row (equal-ish columns, shrink on narrow widths). */
.voice-processing-toggle-group--browser-single-row {
  display: grid;
  grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr) minmax(0, 1fr);
  grid-template-rows: auto;
  gap: 0.75rem;
  align-items: stretch;
}

.voice-processing-toggle-group--browser-single-row .voice-processing-dropdown {
  grid-column: 1;
  grid-row: 1;
}

.voice-processing-toggle-group--browser-single-row > button:nth-child(2) {
  grid-column: 2;
  grid-row: 1;
}

.voice-processing-toggle-group--browser-single-row > button:nth-child(3) {
  grid-column: 3;
  grid-row: 1;
}

/** Krisp: mode + quality + Voice isolation on one row. */
.voice-processing-toggle-group--krisp-single-row {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  grid-template-rows: auto;
  gap: 0.75rem;
  align-items: stretch;
}

.voice-processing-toggle-group--krisp-single-row > :nth-child(1) {
  grid-column: 1;
}

.voice-processing-toggle-group--krisp-single-row > :nth-child(2) {
  grid-column: 2;
}

.voice-processing-toggle-group--krisp-single-row > :nth-child(3) {
  grid-column: 3;
}

.voice-processing-widget {
  width: 15.5rem;
  min-width: 15.5rem;
  flex: 0 0 15.5rem;
}

.voice-processing-toggle-group--browser-single-row .voice-processing-widget,
.voice-processing-toggle-group--krisp-single-row .voice-processing-widget {
  width: 100%;
  min-width: 0;
  max-width: none;
  flex: none;
}

.voice-processing-dropdown:deep(.echo-dropdown-trigger) {
  background: var(--set-toggle-bg);
  box-shadow: inset 0 0 0 1px var(--set-toggle-ring);
  min-height: 3.5rem;
  padding: 1rem;
  border-radius: 1rem;
}

.voice-processing-dropdown:deep(.echo-dropdown-trigger:hover) {
  background: var(--set-action-hover-bg);
}

.voice-processing-dropdown:deep(.echo-dropdown-menu) {
  background: var(--surface) !important;
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
  opacity: 1;
}

.voice-processing-dropdown:deep(.echo-dropdown-menu::before) {
  display: none !important;
}

.voice-processing-dropdown {
  background: transparent;
  box-shadow: none;
  padding: 0;
}

.voice-processing-dropdown:deep(.echo-dropdown-container) {
  gap: 0;
}

.voice-processing-dropdown:deep(.echo-dropdown-trigger-text) {
  color: var(--text);
}

/* Prevent long labels from overlapping the toggle knob; narrow viewports stack the row. */
.voice-processing-toggle-group .settings-toggle > .text-left {
  min-width: 0;
  flex: 1 1 auto;
  padding-right: 0.35rem;
}

.voice-processing-toggle-group .settings-toggle span.block {
  overflow-wrap: anywhere;
}

@media (max-width: 640px) {
  .voice-processing-toggle-group--browser-single-row {
    grid-template-columns: minmax(0, 1fr);
  }

  .voice-processing-toggle-group--browser-single-row
    .voice-processing-dropdown {
    grid-column: 1;
    grid-row: auto;
  }

  .voice-processing-toggle-group--browser-single-row > button:nth-child(2),
  .voice-processing-toggle-group--browser-single-row > button:nth-child(3) {
    grid-column: 1;
    grid-row: auto;
  }

  .voice-processing-toggle-group--krisp-single-row {
    grid-template-columns: minmax(0, 1fr);
  }

  .voice-processing-toggle-group--krisp-single-row > :nth-child(1),
  .voice-processing-toggle-group--krisp-single-row > :nth-child(2),
  .voice-processing-toggle-group--krisp-single-row > :nth-child(3) {
    grid-column: 1;
  }

  .camera-settings-controls {
    grid-template-columns: 1fr;
  }
}

.mic-test-bar-track {
  position: relative;
}

.mic-test-threshold-handle {
  position: absolute;
  top: 50%;
  width: 12px;
  height: 12px;
  border-radius: 9999px;
  border: none;
  background: var(--vc-slider-thumb-bg);
  box-shadow: 0 1px 3px var(--vc-slider-thumb-shadow);
  transform: translate(-50%, -50%);
  cursor: grab;
}

.mic-test-threshold-handle--dragging {
  cursor: grabbing;
}

/* ── Camera settings layout ── */
.camera-settings-layout {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.camera-settings-preview {
  display: flex;
  flex-direction: column;
  width: 100%;
}

.camera-settings-controls {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.75rem;
  align-items: start;
}

.camera-settings-preview-shell {
  position: relative;
  cursor: pointer;
  border-radius: 1rem;
  outline: none;
}

.camera-settings-preview-shell:focus-visible {
  box-shadow: 0 0 0 3px var(--set-input-focus-glow);
}

.camera-settings-preview-status {
  position: absolute;
  left: 0.7rem;
  bottom: 0.7rem;
  border-radius: 9999px;
  background: color-mix(in srgb, var(--bg) 82%, transparent);
  box-shadow: inset 0 0 0 1px var(--set-toggle-ring);
  padding: 0.28rem 0.55rem;
  font-size: 0.7rem;
  font-weight: 700;
  color: var(--text);
  pointer-events: none;
}

.camera-settings-mirror-btn {
  position: absolute;
  top: 0.7rem;
  right: 0.7rem;
  border-radius: 0.75rem;
  background: color-mix(in srgb, var(--bg) 88%, transparent);
  box-shadow: inset 0 0 0 1px var(--set-toggle-ring);
  padding: 0.42rem 0.65rem;
  font-size: 0.72rem;
  font-weight: 700;
  color: var(--text);
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.16s ease;
}

.camera-settings-preview-shell:hover .camera-settings-mirror-btn,
.camera-settings-preview-shell:focus-within .camera-settings-mirror-btn {
  opacity: 1;
  pointer-events: auto;
}

.camera-settings-dropdown:deep(.echo-dropdown-trigger) {
  background: var(--set-input-bg);
  box-shadow: inset 0 0 0 1px var(--border);
}

.camera-settings-dropdown:deep(.echo-dropdown-trigger:hover) {
  background: var(--set-input-bg);
  box-shadow: inset 0 0 0 1px var(--set-input-focus-ring);
}

.camera-settings-dropdown:deep(
  .echo-dropdown-trigger.echo-dropdown-trigger--open
) {
  background: var(--set-input-bg);
  box-shadow:
    inset 0 0 0 1px var(--set-input-focus-ring),
    0 0 0 3px var(--set-input-focus-glow);
}

.camera-settings-dropdown:deep(.echo-dropdown-menu) {
  background: var(--set-panel-bg);
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
}
</style>
