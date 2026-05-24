<script setup lang="ts">
import { computed, inject, ref, unref, watch } from 'vue';
import { useEchoWorkspace } from '@/composables/useEchoWorkspace';
import { dispatchAppToast } from '@/utils/controllerMissingAction';
import { playEchoSound } from '@/composables/useEchoSounds';
import { isDesktop } from '@/platform/desktopBridge';
import { liveKitRemoteIdentities } from '@/services/livekit/liveKitRoomParticipants';
import {
  useChannelPanelVoiceSettings,
  CHANNEL_PANEL_VOICE_SETTINGS_INJECTION_KEY,
} from '@/features/channel-panel/composables/useChannelPanelVoiceSettings';
import ChannelPanelVoicePanel from '@/features/channel-panel/components/ChannelPanelVoicePanel.vue';
import VcCameraSetupModal from '@/features/channel-panel/components/VcCameraSetupModal.vue';
import {
  useChannelPanelVoiceState,
  type ChannelCategory,
  type ChannelWithParticipants,
} from '@/features/channel-panel/composables/useChannelPanelVoiceState';
import {
  getVoiceChannelUserLimitUi,
  voiceChannelParticipantCount,
} from '@/features/voice/domain/voiceChannelUserLimit';
import { useAuthSessionStore } from '@/stores/authSession';
import { requestEchoStageSpeak } from '@/services/voice/requestStageSpeak';
import { isEchoGraphId } from '@/utils/echoIds';
import { canPublishStageMedia } from '@/features/voice/stage/stagePublishMedia';

const workspace = useEchoWorkspace();
const authSession = useAuthSessionStore();

const injectedVoiceSettings = inject(
  CHANNEL_PANEL_VOICE_SETTINGS_INJECTION_KEY,
  null,
);
const voiceSettings = injectedVoiceSettings ?? useChannelPanelVoiceSettings();

const {
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
} = voiceSettings;

const cameraSetupModalOpen = ref(false);

const props = defineProps<{
  categories:
    | ChannelCategory[]
    | ReadonlyArray<ChannelCategory>
    | import('vue').Ref<ChannelCategory[] | ReadonlyArray<ChannelCategory>>;
  users: { id: string; name: string; pfp: string }[];
  currentUserId?: string;
  currentVoiceChannelId?: string | null;
  currentVoiceChannelName?: string;
  /** Guild id for stage request-to-speak API. */
  echoServerId?: string | null;
  vcMuted?: boolean;
  vcDeafened?: boolean;
  vcVideo?: boolean;
  vcScreenshare?: boolean;
  canUseVideo?: boolean;
  liveKitState?: 'idle' | 'connecting' | 'connected' | 'error';
  liveKitNetworkStats?: {
    latencyMs: number;
    jitterMs: number;
    packetLossPct: number;
    bitrateKbps: number;
    codec: string;
    serverRegion?: string;
  } | null;
  liveKitRoom?: unknown;
  voiceSessionParticipants?: Array<{
    id: string;
    muted: boolean;
    deafened: boolean;
    streaming: boolean;
    video: boolean;
    serverMuted: boolean;
    serverDeafened: boolean;
    speaking?: boolean;
    audioLevel?: number;
  }>;
  vcMicInputLevel?: number;
  onSwitchCamera?: (deviceId: string) => void;
  /** Jump to owning guild and highlight this VC in the channel list. */
  focusGuildVoiceChannelInSidebar?: () => void;
}>();

const emit = defineEmits<{
  'update:vcMuted': [value: boolean];
  'update:vcDeafened': [value: boolean];
  'update:vcVideo': [value: boolean];
  'update:vcScreenshare': [value: boolean];
  'leave-voice': [];
  'open-voice-audio-settings': [];
}>();

function findVoiceChannelRowInProps(
  channelId: string,
): ChannelWithParticipants | null {
  const cats = unref(props.categories) as ChannelCategory[];
  if (!cats?.length) return null;
  for (const cat of cats) {
    const ch = cat.channels.find((c) => c.id === channelId);
    if (ch) return ch as ChannelWithParticipants;
  }
  return null;
}

function getServerVoiceModerationForUser(userId: string) {
  const vcId = props.currentVoiceChannelId;
  if (!vcId) return { serverMuted: false, serverDeafened: false };
  const row = findVoiceChannelRowInProps(vcId);
  const echoMute = row?.voiceServerMuteByUserId?.[userId];
  const echoDeaf = row?.voiceServerDeafenByUserId?.[userId];
  const mockMute = workspace.vcServerMuteByChannel.value[vcId]?.[userId];
  const mockDeaf = workspace.vcServerDeafenByChannel.value[vcId]?.[userId];
  return {
    serverMuted: !!echoMute || !!mockMute,
    serverDeafened: !!echoDeaf || !!mockDeaf,
  };
}

const { isVcMicOff, isVcHeadphonesOff, effectiveCategories } =
  useChannelPanelVoiceState({
    categories: computed(() => unref(props.categories) as ChannelCategory[]),
    getCurrentVoiceChannelId: () => props.currentVoiceChannelId,
    getCurrentUserId: () => props.currentUserId,
    users: computed(() => props.users),
    getVcMuted: () => props.vcMuted,
    getVcDeafened: () => props.vcDeafened,
    getVcVideo: () => props.vcVideo,
    getVcScreenshare: () => props.vcScreenshare,
    getLiveVoiceParticipants: () => props.voiceSessionParticipants ?? null,
    getServerVoiceModerationForUser,
    getLiveKitVoiceFilter: () => {
      if (props.liveKitState !== 'connected') return null;
      const vid = props.currentVoiceChannelId;
      const uid = props.currentUserId;
      if (!vid?.trim() || !uid) return null;
      const room = props.liveKitRoom as
        | import('livekit-client').Room
        | undefined;
      const keys = room?.remoteParticipants?.size
        ? liveKitRemoteIdentities(room)
        : [];
      return { channelId: vid, remoteIdentities: keys, currentUserId: uid };
    },
  });

function findVoiceChannelById(
  channelId: string,
): ChannelWithParticipants | null {
  for (const cat of effectiveCategories.value) {
    const ch = cat.channels.find((c) => c.id === channelId);
    if (ch) return ch as ChannelWithParticipants;
  }
  return null;
}

const vcSelfServerModeration = computed(() => {
  const vcId = props.currentVoiceChannelId;
  const uid = props.currentUserId;
  if (!vcId || !uid) return { serverMuted: false, serverDeafened: false };
  const row = findVoiceChannelById(vcId);
  const echoMute = row?.voiceServerMuteByUserId?.[uid];
  const echoDeaf = row?.voiceServerDeafenByUserId?.[uid];
  const mockMute = workspace.vcServerMuteByChannel.value[vcId]?.[uid];
  const mockDeaf = workspace.vcServerDeafenByChannel.value[vcId]?.[uid];
  return {
    serverMuted: !!echoMute || !!mockMute,
    serverDeafened: !!echoDeaf || !!mockDeaf,
  };
});

watch(
  () => props.currentVoiceChannelId,
  () => {
    closeVcSettings();
  },
);

function openVoiceAudioSettingsFromVc() {
  closeVcSettings();
  emit('open-voice-audio-settings');
}

const vcConnectionStatus = computed<
  'connecting' | 'connected' | 'error' | 'idle'
>(() => {
  return props.liveKitState ?? 'idle';
});

const vcNetworkStats = computed(() => props.liveKitNetworkStats ?? null);

const vcNetworkGood = computed(() => {
  if (vcConnectionStatus.value !== 'connected') return false;
  const s = vcNetworkStats.value;
  if (!s) return true;
  return s.latencyMs < 200 && s.packetLossPct < 5;
});

function isVcMicOffForPanel() {
  const s = vcSelfServerModeration.value;
  return isVcMicOff() || s.serverMuted || s.serverDeafened;
}

function isVcHeadphonesOffForPanel() {
  const s = vcSelfServerModeration.value;
  return isVcHeadphonesOff() || s.serverDeafened;
}

async function toggleVcMute() {
  if (props.vcDeafened) return;
  const s = vcSelfServerModeration.value;
  if (s.serverMuted || s.serverDeafened) {
    dispatchAppToast(
      s.serverDeafened
        ? 'You are server deafened. A moderator must undeafen you.'
        : 'You are server muted. A moderator must unmute you.',
      'warning',
    );
    return;
  }
  const vcId = props.currentVoiceChannelId?.trim();
  const uid = props.currentUserId?.trim();
  const row = vcId ? findVoiceChannelById(vcId) : null;
  if (row?.type === 'stage' && uid && !row.voiceStageSpeakerByUserId?.[uid]) {
    const sid = props.echoServerId?.trim();
    const token = authSession.accessToken;
    if (sid && token && isEchoGraphId(sid)) {
      try {
        await requestEchoStageSpeak(token, sid, row.id);
        dispatchAppToast(
          'Request to speak sent. A moderator can invite you to the stage.',
          'success',
        );
      } catch (e) {
        const msg =
          e instanceof Error ? e.message : "Something didn't work. Try again.";
        dispatchAppToast(`Could not request to speak: ${msg}`, 'warning');
      }
    }
    return;
  }
  const next = !(props.vcMuted ?? false);
  emit('update:vcMuted', next);
  playEchoSound(next ? 'vcMute' : 'vcUnmute');
}

function toggleVcDeafen() {
  const s = vcSelfServerModeration.value;
  if (s.serverDeafened) {
    dispatchAppToast(
      'You are server deafened. A moderator must undeafen you.',
      'warning',
    );
    return;
  }
  const next = !(props.vcDeafened ?? false);
  emit('update:vcDeafened', next);
  playEchoSound(next ? 'vcDeafen' : 'vcUndeafen');
}

async function handleSelectCameraDevice(id: string) {
  selectCameraDevice(id);
  await requestVideoPermissionAndEnumerate();
  props.onSwitchCamera?.(id === 'default' ? '' : id);
}

function toggleVcVideo() {
  if (props.canUseVideo === false) return;
  if (!canPublishStageMediaForSelf.value) {
    stageAudienceMediaToast();
    return;
  }
  if (props.vcVideo) {
    emit('update:vcVideo', false);
    return;
  }
  if (isDesktop()) {
    emit('update:vcVideo', true);
    return;
  }
  cameraSetupModalOpen.value = true;
}

function confirmCameraSetup() {
  props.onSwitchCamera?.(
    vcCameraDeviceId.value === 'default' ? '' : vcCameraDeviceId.value,
  );
  cameraSetupModalOpen.value = false;
  emit('update:vcVideo', true);
}

function toggleVcScreenshare() {
  if (!canPublishStageMediaForSelf.value) {
    stageAudienceMediaToast();
    return;
  }
  emit('update:vcScreenshare', !(props.vcScreenshare ?? false));
}

const currentVoiceChannelLimitUi = computed(() => {
  const vcId = props.currentVoiceChannelId?.trim();
  if (!vcId) return null;
  const row = findVoiceChannelById(vcId);
  if (!row) return null;
  const count = voiceChannelParticipantCount(row.voiceParticipantIds);
  return getVoiceChannelUserLimitUi(count, row.userLimit);
});

const currentVoiceChannelRow = computed(() => {
  const vcId = props.currentVoiceChannelId?.trim();
  return vcId ? findVoiceChannelById(vcId) : null;
});

const canPublishStageMediaForSelf = computed(() =>
  canPublishStageMedia(currentVoiceChannelRow.value, props.currentUserId),
);

function stageAudienceMediaToast() {
  dispatchAppToast(
    'Only speakers on stage can use camera or screen share. Request to speak first.',
    'info',
  );
}
</script>

<template>
  <div class="guild-voice-connection-strip shrink-0 border-t border-border">
    <VcCameraSetupModal
      :open="cameraSetupModalOpen"
      :selected-device-id="vcCameraDeviceId"
      @update:open="cameraSetupModalOpen = $event"
      @update:selected-device-id="
        (id) => {
          selectCameraDevice(id);
        }
      "
      @confirm="confirmCameraSetup"
    />

    <ChannelPanelVoicePanel
      :current-voice-channel-id="currentVoiceChannelId ?? null"
      :current-voice-channel-name="currentVoiceChannelName ?? ''"
      :current-voice-channel-limit-ui="currentVoiceChannelLimitUi"
      :vc-network-good="vcNetworkGood"
      :vc-connection-status="vcConnectionStatus"
      :vc-network-stats="vcNetworkStats"
      :is-vc-settings-open="isVcSettingsOpen"
      :vc-output-list-open="vcOutputListOpen"
      :vc-input-list-open="vcInputListOpen"
      :vc-camera-list-open="vcCameraListOpen"
      :current-output-label="currentOutputLabel"
      :current-input-label="currentInputLabel"
      :current-camera-label="currentCameraLabel"
      :vc-output-device-options="vcOutputDeviceOptions"
      :vc-input-device-options="vcInputDeviceOptions"
      :vc-camera-device-options="vcCameraDeviceOptions"
      :vc-output-device-id="vcOutputDeviceId"
      :vc-input-device-id="vcInputDeviceId"
      :vc-camera-device-id="vcCameraDeviceId"
      :vc-output-volume="vcOutputVolume"
      :vc-input-volume="vcInputVolume"
      :vc-output-display-percent="vcOutputDisplayPercent"
      :vc-input-display-percent="vcInputDisplayPercent"
      :vc-mic-input-level="vcMicInputLevel"
      :voice-slider-max="vcVoiceSliderMax"
      :vc-video="vcVideo ?? false"
      :can-use-video="canUseVideo !== false && canPublishStageMediaForSelf"
      :vc-screenshare="vcScreenshare ?? false"
      :is-vc-mic-off="isVcMicOffForPanel"
      :is-vc-headphones-off="isVcHeadphonesOffForPanel"
      :vc-self-server-muted="vcSelfServerModeration.serverMuted"
      :vc-self-server-deafened="vcSelfServerModeration.serverDeafened"
      :on-leave-voice="() => emit('leave-voice')"
      :open-output-list="openOutputList"
      :open-input-list="openInputList"
      :open-camera-list="openCameraList"
      :select-output-device="selectOutputDevice"
      :select-input-device="selectInputDevice"
      :select-camera-device="handleSelectCameraDevice"
      :set-output-volume="onVcOutputSliderInput"
      :set-input-volume="onVcInputSliderInput"
      :toggle-vc-video="toggleVcVideo"
      :toggle-vc-screenshare="toggleVcScreenshare"
      :toggle-vc-mute="toggleVcMute"
      :toggle-vc-deafen="toggleVcDeafen"
      :toggle-vc-settings="toggleVcSettings"
      :on-open-voice-audio-settings="openVoiceAudioSettingsFromVc"
      :focus-guild-voice-channel-in-sidebar="focusGuildVoiceChannelInSidebar"
    />
  </div>
</template>
