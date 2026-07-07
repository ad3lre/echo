import { computed, ref, type InjectionKey } from 'vue';
import { storeToRefs } from 'pinia';
import { useMediaDevices } from '@/composables/useMediaDevices';
import { useUiAudioDevicesStore } from '@/stores/uiAudioDevices';
import { useVoiceLevelsStore } from '@/stores/voiceLevels';
import { useCameraPreferencesStore } from '@/stores/cameraPreferences';
import { audioOutputDeviceLimitedReason } from '@/platform/browserCompatibility';

export type ChannelPanelVoiceSettingsHandle = ReturnType<
  typeof useChannelPanelVoiceSettings
>;

/**
 * When `GuildVoiceConnectionStrip` is rendered under `ChannelPanel`, the parent
 * provides this so device/settings popovers share one reactive surface.
 */
export const CHANNEL_PANEL_VOICE_SETTINGS_INJECTION_KEY: InjectionKey<ChannelPanelVoiceSettingsHandle> =
  Symbol('channelPanelVoiceSettings');

export function useChannelPanelVoiceSettings() {
  const uiAudio = useUiAudioDevicesStore();
  const cameraPreferences = useCameraPreferencesStore();
  const voiceLevels = useVoiceLevelsStore();
  const { outputSinkId: vcOutputDeviceId, inputDeviceId: vcInputDeviceId } =
    storeToRefs(uiAudio);
  const { cameraDeviceId: vcCameraDeviceId } = storeToRefs(cameraPreferences);
  const { sliderMax: vcVoiceSliderMax } = storeToRefs(voiceLevels);

  const isVcSettingsOpen = ref(false);
  const vcOutputVolume = computed({
    get: () => voiceLevels.outputVolumePercent,
    set: (v: number) => voiceLevels.setOutputVolumePercent(v),
  });
  const vcOutputDisplayPercent = computed(
    () => voiceLevels.outputEffectivePercent,
  );
  const vcInputVolume = computed({
    get: () => voiceLevels.inputSensitivityPercent,
    set: (v: number) => voiceLevels.setInputSensitivityPercent(v),
  });
  const vcInputDisplayPercent = computed(
    () => voiceLevels.inputEffectivePercent,
  );
  const vcOutputListOpen = ref(false);
  const vcInputListOpen = ref(false);
  const vcCameraListOpen = ref(false);

  const audioOutputSelectionLimited = computed(() =>
    audioOutputDeviceLimitedReason(),
  );

  const {
    inputDevices,
    outputDevices,
    cameraDevices,
    requestVideoPermissionAndEnumerate,
  } = useMediaDevices();

  const vcOutputDeviceOptions = computed(() =>
    outputDevices.value.map((d) => ({ value: d.value, label: d.label })),
  );
  const vcInputDeviceOptions = computed(() =>
    inputDevices.value.map((d) => ({ value: d.value, label: d.label })),
  );
  const vcCameraDeviceOptions = computed(() =>
    cameraDevices.value.map((d) => ({ value: d.value, label: d.label })),
  );

  const currentOutputLabel = computed(
    () =>
      vcOutputDeviceOptions.value.find(
        (o) => o.value === vcOutputDeviceId.value,
      )?.label ?? vcOutputDeviceId.value,
  );
  const currentInputLabel = computed(
    () =>
      vcInputDeviceOptions.value.find((o) => o.value === vcInputDeviceId.value)
        ?.label ?? vcInputDeviceId.value,
  );
  const currentCameraLabel = computed(
    () =>
      vcCameraDeviceOptions.value.find(
        (o) => o.value === vcCameraDeviceId.value,
      )?.label ?? vcCameraDeviceId.value,
  );

  function openOutputList() {
    vcInputListOpen.value = false;
    vcCameraListOpen.value = false;
    vcOutputListOpen.value = !vcOutputListOpen.value;
  }

  function openInputList() {
    vcOutputListOpen.value = false;
    vcCameraListOpen.value = false;
    vcInputListOpen.value = !vcInputListOpen.value;
  }

  function openCameraList() {
    vcOutputListOpen.value = false;
    vcInputListOpen.value = false;
    vcCameraListOpen.value = !vcCameraListOpen.value;
  }

  function selectOutputDevice(value: string) {
    uiAudio.setOutputSink(value);
    vcOutputListOpen.value = false;
  }

  function selectInputDevice(value: string) {
    uiAudio.setInputDevice(value);
    vcInputListOpen.value = false;
  }

  function selectCameraDevice(value: string) {
    cameraPreferences.setCameraDeviceId(value);
    vcCameraListOpen.value = false;
  }

  function toggleVcSettings() {
    isVcSettingsOpen.value = !isVcSettingsOpen.value;
  }

  function closeVcSettings() {
    isVcSettingsOpen.value = false;
    vcOutputListOpen.value = false;
    vcInputListOpen.value = false;
    vcCameraListOpen.value = false;
  }

  /** Call store setters explicitly — template `(vcOutputVolume = v)` cannot update a writable computed (`const` binding). */
  function onVcOutputSliderInput(v: number) {
    voiceLevels.setOutputVolumePercent(v);
  }
  function onVcInputSliderInput(v: number) {
    voiceLevels.setInputSensitivityPercent(v);
  }

  return {
    isVcSettingsOpen,
    vcOutputVolume,
    vcOutputDisplayPercent,
    vcInputVolume,
    vcInputDisplayPercent,
    vcVoiceSliderMax,
    vcOutputDeviceId,
    vcInputDeviceId,
    vcCameraDeviceId,
    vcOutputListOpen,
    vcInputListOpen,
    vcCameraListOpen,
    audioOutputSelectionLimited,
    vcOutputDeviceOptions,
    vcInputDeviceOptions,
    vcCameraDeviceOptions,
    currentOutputLabel,
    currentInputLabel,
    currentCameraLabel,
    openOutputList,
    openInputList,
    openCameraList,
    selectOutputDevice,
    selectInputDevice,
    selectCameraDevice,
    toggleVcSettings,
    closeVcSettings,
    requestVideoPermissionAndEnumerate,
    onVcOutputSliderInput,
    onVcInputSliderInput,
  };
}
