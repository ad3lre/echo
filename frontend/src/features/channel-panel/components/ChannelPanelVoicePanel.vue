<script setup lang="ts">
import { computed, inject, ref } from 'vue';
import { icons } from '@/assets/icons';
import { LAYOUT_CHAT_SURFACE_KEY } from '@/features/layout/layoutInjectionKeys';

const props = defineProps<{
  currentVoiceChannelId: string | null;
  currentVoiceChannelName: string;
  vcNetworkGood: boolean;
  vcConnectionStatus?: 'idle' | 'connecting' | 'connected' | 'error';
  isVcSettingsOpen: boolean;
  vcOutputListOpen: boolean;
  vcInputListOpen: boolean;
  vcCameraListOpen?: boolean;
  currentOutputLabel: string;
  currentInputLabel: string;
  currentCameraLabel?: string;
  vcOutputDeviceOptions: Array<{ value: string; label: string }>;
  vcInputDeviceOptions: Array<{ value: string; label: string }>;
  vcCameraDeviceOptions?: Array<{ value: string; label: string }>;
  vcOutputDeviceId: string;
  vcInputDeviceId: string;
  vcCameraDeviceId?: string;
  vcOutputVolume: number;
  vcInputVolume: number;
  vcOutputDisplayPercent?: number;
  vcInputDisplayPercent?: number;
  /** Live mic level for compact activity bar (omit to hide the bar). */
  vcMicInputLevel?: number | null;
  /** Range max (100 or 200 when max boost is on). */
  voiceSliderMax?: number;
  vcVideo: boolean;
  canUseVideo?: boolean;
  vcScreenshare: boolean;
  isVcMicOff: () => boolean;
  isVcHeadphonesOff: () => boolean;
  /** Current user: moderator server mute / deafen (Echo or mock). */
  vcSelfServerMuted?: boolean;
  vcSelfServerDeafened?: boolean;
  onLeaveVoice: () => void;
  openOutputList: () => void;
  openInputList: () => void;
  openCameraList?: () => void;
  selectOutputDevice: (id: string) => void;
  selectInputDevice: (id: string) => void;
  selectCameraDevice?: (id: string) => void;
  setOutputVolume: (value: number) => void;
  setInputVolume: (value: number) => void;
  toggleVcVideo: () => void;
  toggleVcScreenshare: () => void;
  toggleVcMute: () => void;
  toggleVcDeafen: () => void;
  toggleVcSettings: () => void;
  /** Opens user Settings on Voice & Video. */
  onOpenVoiceAudioSettings: () => void;
  /** Jump to owning guild and highlight this VC in the channel list. */
  focusGuildVoiceChannelInSidebar?: () => void;
  vcNetworkStats?: {
    latencyMs: number;
    jitterMs: number;
    packetLossPct: number;
    bitrateKbps: number;
    codec: string;
    serverRegion?: string;
  } | null;
}>();

const emit = defineEmits<{
  (e: 'toggle-network-popup'): void;
}>();

const voiceSliderMax = computed(() => props.voiceSliderMax ?? 100);
const vcOutputDisplayPercent = computed(
  () => props.vcOutputDisplayPercent ?? props.vcOutputVolume,
);
const vcInputDisplayPercent = computed(
  () => props.vcInputDisplayPercent ?? props.vcInputVolume,
);

const showMicActivityMeter = computed(
  () => props.vcMicInputLevel != null && !Number.isNaN(props.vcMicInputLevel),
);

const micActivityFillPercent = computed(() => {
  const raw = props.vcMicInputLevel;
  if (raw == null || Number.isNaN(raw)) return '0%';
  const muted = props.isVcMicOff();
  const v = muted ? 0 : Math.max(0, Math.min(100, raw * 100));
  return `${v}%`;
});

const serverModActive = computed(
  () => !!(props.vcSelfServerMuted || props.vcSelfServerDeafened),
);

function sliderFillPercent(vol: number): string {
  const m = voiceSliderMax.value;
  if (m <= 0) return '0%';
  return `${(vol / m) * 100}%`;
}

const isNetworkPopupOpen = ref(false);

const layoutChat = inject(LAYOUT_CHAT_SURFACE_KEY, null);

function openVoiceActivities() {
  const host = layoutChat as { openVcActivityPicker?: () => void } | null;
  host?.openVcActivityPicker?.();
}

function toggleNetworkPopup() {
  isNetworkPopupOpen.value = !isNetworkPopupOpen.value;
  emit('toggle-network-popup');
}

const statusLabel = computed(() => {
  switch (props.vcConnectionStatus) {
    case 'connecting':
      return 'Connecting…';
    case 'error':
      return 'Connection Failed';
    case 'connected':
      return 'Voice Connected';
    case 'idle':
      return 'Voice';
    default:
      return 'Voice';
  }
});

const statusColor = computed(() => {
  switch (props.vcConnectionStatus) {
    case 'connecting':
      return 'text-amber-400';
    case 'error':
      return 'text-red-400';
    default:
      return props.vcNetworkGood ? 'text-emerald-400' : 'text-amber-400';
  }
});

const networkIconClass = computed(() => {
  switch (props.vcConnectionStatus) {
    case 'connecting':
      return 'vc-network-warn';
    case 'error':
      return 'vc-network-error';
    default:
      return props.vcNetworkGood ? 'vc-network-good' : 'vc-network-warn';
  }
});

function formatLatency(ms: number): string {
  return `${Math.round(ms)} ms`;
}
function formatLoss(pct: number): string {
  return `${pct.toFixed(1)}%`;
}
function formatBitrate(kbps: number): string {
  return kbps >= 1000
    ? `${(kbps / 1000).toFixed(1)} Mbps`
    : `${Math.round(kbps)} kbps`;
}
</script>

<template>
  <div>
    <Transition name="vc-panel">
      <div v-if="currentVoiceChannelId" class="vc-panel shrink-0">
        <div
          class="vc-panel-header flex items-start justify-between gap-2 pl-3 pt-3.5 pb-2 vc-panel-header--align-leave"
        >
          <div class="vc-panel-status-block min-w-0 pl-1 relative">
            <button
              type="button"
              class="vc-voice-status-trigger group min-w-0 max-w-full"
              title="Connection info"
              @click.stop="toggleNetworkPopup"
            >
              <img
                :src="icons.stream"
                alt=""
                class="vc-icon vc-icon-network h-4 w-4 shrink-0"
                :class="[
                  networkIconClass,
                  { 'vc-icon-pulse': vcConnectionStatus === 'connecting' },
                ]"
              />
              <span
                class="vc-voice-status-label min-w-0 truncate text-left text-[13px] font-semibold leading-tight transition-[filter] duration-150 group-hover:brightness-110"
                :class="statusColor"
              >
                {{ statusLabel }}
              </span>
            </button>
            <button
              v-if="focusGuildVoiceChannelInSidebar"
              type="button"
              class="mt-0.5 block w-full max-w-full truncate pl-7 text-left text-[12px] text-fg-subtle transition hover:text-fg cursor-pointer rounded-sm border-0 bg-transparent p-0"
              title="Go to voice channel"
              @click="focusGuildVoiceChannelInSidebar()"
            >
              {{ currentVoiceChannelName || 'Voice Channel' }}
            </button>
            <span
              v-else
              class="mt-0.5 block truncate pl-7 text-[12px] text-fg-subtle"
            >
              {{ currentVoiceChannelName || 'Voice Channel' }}
            </span>

            <Transition name="vc-network-popup">
              <div
                v-if="isNetworkPopupOpen && vcConnectionStatus === 'connected'"
                class="vc-network-popup"
              >
                <div class="vc-network-popup-header">
                  <span class="vc-network-popup-title">Voice Connection</span>
                  <span
                    class="vc-network-popup-badge"
                    :class="vcNetworkGood ? 'vc-badge-good' : 'vc-badge-warn'"
                  >
                    {{ vcNetworkGood ? 'Good' : 'Unstable' }}
                  </span>
                </div>

                <div class="vc-network-popup-stats">
                  <div class="vc-stat-row">
                    <span class="vc-stat-label">Latency</span>
                    <span
                      class="vc-stat-value"
                      :class="
                        (vcNetworkStats?.latencyMs ?? 0) > 150
                          ? 'vc-stat-warn'
                          : 'vc-stat-ok'
                      "
                    >
                      {{
                        vcNetworkStats
                          ? formatLatency(vcNetworkStats.latencyMs)
                          : '—'
                      }}
                    </span>
                  </div>
                  <div class="vc-stat-row">
                    <span class="vc-stat-label">Packet Loss</span>
                    <span
                      class="vc-stat-value"
                      :class="
                        (vcNetworkStats?.packetLossPct ?? 0) > 2
                          ? 'vc-stat-warn'
                          : 'vc-stat-ok'
                      "
                    >
                      {{
                        vcNetworkStats
                          ? formatLoss(vcNetworkStats.packetLossPct)
                          : '—'
                      }}
                    </span>
                  </div>
                  <div class="vc-stat-row">
                    <span class="vc-stat-label">Jitter</span>
                    <span
                      class="vc-stat-value"
                      :class="
                        (vcNetworkStats?.jitterMs ?? 0) > 30
                          ? 'vc-stat-warn'
                          : 'vc-stat-ok'
                      "
                    >
                      {{
                        vcNetworkStats
                          ? formatLatency(vcNetworkStats.jitterMs)
                          : '—'
                      }}
                    </span>
                  </div>
                  <div class="vc-stat-row">
                    <span class="vc-stat-label">Bitrate</span>
                    <span class="vc-stat-value vc-stat-ok">
                      {{
                        vcNetworkStats
                          ? formatBitrate(vcNetworkStats.bitrateKbps)
                          : '—'
                      }}
                    </span>
                  </div>
                  <div v-if="vcScreenshare" class="vc-stat-row">
                    <span class="vc-stat-label">Screen Share</span>
                    <span class="vc-stat-value vc-stat-ok">Active</span>
                  </div>
                  <div class="vc-stat-row">
                    <span class="vc-stat-label">Codec</span>
                    <span
                      class="vc-stat-value vc-stat-ok min-w-0 max-w-[10rem] truncate text-right"
                    >
                      {{ vcNetworkStats?.codec || '—' }}
                    </span>
                  </div>
                  <div class="vc-stat-row">
                    <span class="vc-stat-label">Server</span>
                    <span class="vc-stat-value vc-stat-ok">
                      {{ vcNetworkStats?.serverRegion || '—' }}
                    </span>
                  </div>
                </div>
              </div>
            </Transition>
          </div>
          <div
            class="vc-panel-header-actions flex shrink-0 items-start gap-0.5"
          >
            <button
              type="button"
              class="vc-activities-btn shrink-0"
              title="Activities"
              aria-label="Voice activities"
              @click="openVoiceActivities"
            >
              <img
                :src="icons.puzzle"
                alt=""
                class="vc-icon vc-icon-activities w-[20px] h-[20px]"
              />
            </button>
            <button
              type="button"
              class="vc-leave-btn shrink-0"
              title="Leave"
              aria-label="Leave voice channel"
              @click="onLeaveVoice"
            >
              <img
                :src="icons.logOut"
                alt=""
                class="vc-icon vc-icon-disconnect w-[20px] h-[20px]"
              />
            </button>
          </div>
        </div>

        <div class="h-px mx-3 bg-glass-1"></div>

        <div
          v-if="serverModActive"
          class="vc-server-mod-banner mx-3 mt-2 mb-1 rounded-lg border border-red-500/35 bg-red-950/55 px-3 py-2 text-[12px] leading-snug text-red-100/95"
          role="status"
        >
          <span v-if="vcSelfServerDeafened" class="font-medium"
            >Server deafened</span
          >
          <span v-else class="font-medium">Server muted</span>
          <span class="mt-0.5 block text-[11px] text-red-200/80">
            A moderator applied this. Only they can remove it.
          </span>
        </div>

        <Transition name="vc-settings-slide">
          <div
            v-if="isVcSettingsOpen"
            class="vc-settings-panel bg-[color-mix(in_srgb,var(--echo-channel-panel-bg)_98%,transparent)] px-3 py-3"
          >
            <div class="flex flex-col gap-4">
              <div class="vc-device-block">
                <button
                  type="button"
                  class="vc-device-name"
                  :class="{ 'vc-device-name--open': vcOutputListOpen }"
                  @click="openOutputList"
                >
                  <img
                    :src="icons.headphones"
                    alt=""
                    class="vc-device-name-icon"
                    aria-hidden="true"
                  />
                  <span>{{ currentOutputLabel }}</span>
                  <svg
                    class="vc-device-name-chevron"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2.5"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      d="M19 9l-7 7-7-7"
                    />
                  </svg>
                </button>
                <Transition name="vc-device-list">
                  <div v-if="vcOutputListOpen" class="vc-device-list">
                    <button
                      v-for="opt in vcOutputDeviceOptions"
                      :key="opt.value"
                      type="button"
                      class="vc-device-option"
                      :class="{
                        'vc-device-option--selected':
                          vcOutputDeviceId === opt.value,
                      }"
                      @click="selectOutputDevice(opt.value)"
                    >
                      {{ opt.label }}
                    </button>
                  </div>
                </Transition>
                <div
                  v-show="!vcOutputListOpen"
                  class="vc-device-volume vc-device-volume--stacked"
                >
                  <div class="vc-volume-label-row">
                    <span class="vc-volume-label">Output</span>
                    <span class="vc-settings-value"
                      >{{ vcOutputDisplayPercent }}%</span
                    >
                  </div>
                  <div class="vc-device-volume-slider-row">
                    <input
                      :value="vcOutputVolume"
                      type="range"
                      min="0"
                      :max="voiceSliderMax"
                      class="vc-settings-slider"
                      :style="{ '--value': sliderFillPercent(vcOutputVolume) }"
                      :aria-label="'Output ' + vcOutputDisplayPercent + '%'"
                      @input="
                        setOutputVolume(
                          Number(($event.target as HTMLInputElement).value),
                        )
                      "
                    />
                  </div>
                </div>
              </div>

              <div class="vc-device-block">
                <button
                  type="button"
                  class="vc-device-name"
                  :class="{ 'vc-device-name--open': vcInputListOpen }"
                  @click="openInputList"
                >
                  <img
                    :src="icons.mic"
                    alt=""
                    class="vc-device-name-icon"
                    aria-hidden="true"
                  />
                  <span>{{ currentInputLabel }}</span>
                  <svg
                    class="vc-device-name-chevron"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2.5"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      d="M19 9l-7 7-7-7"
                    />
                  </svg>
                </button>
                <Transition name="vc-device-list">
                  <div v-if="vcInputListOpen" class="vc-device-list">
                    <button
                      v-for="opt in vcInputDeviceOptions"
                      :key="opt.value"
                      type="button"
                      class="vc-device-option"
                      :class="{
                        'vc-device-option--selected':
                          vcInputDeviceId === opt.value,
                      }"
                      @click="selectInputDevice(opt.value)"
                    >
                      {{ opt.label }}
                    </button>
                  </div>
                </Transition>
                <div
                  v-show="!vcInputListOpen"
                  class="vc-device-volume vc-device-volume--stacked"
                >
                  <div class="vc-volume-label-row">
                    <span class="vc-volume-label">Input</span>
                    <span class="vc-settings-value"
                      >{{ vcInputDisplayPercent }}%</span
                    >
                  </div>
                  <div
                    v-if="showMicActivityMeter"
                    class="vc-discord-meter"
                    aria-hidden="true"
                  >
                    <div class="vc-discord-meter-track">
                      <div
                        class="vc-discord-meter-fill"
                        :style="{ width: micActivityFillPercent }"
                      />
                    </div>
                  </div>
                  <div class="vc-device-volume-slider-row">
                    <input
                      :value="vcInputVolume"
                      type="range"
                      min="0"
                      :max="voiceSliderMax"
                      class="vc-settings-slider vc-settings-slider--input-gain"
                      :style="{ '--value': sliderFillPercent(vcInputVolume) }"
                      :aria-label="'Input ' + vcInputDisplayPercent + '%'"
                      @input="
                        setInputVolume(
                          Number(($event.target as HTMLInputElement).value),
                        )
                      "
                    />
                  </div>
                </div>
              </div>

              <!-- Camera device picker: choosing a device requests camera access (not when opening VC settings). -->
              <div
                v-if="
                  canUseVideo !== false &&
                  vcCameraDeviceOptions &&
                  vcCameraDeviceOptions.length > 0
                "
                class="vc-device-block"
              >
                <button
                  type="button"
                  class="vc-device-name"
                  :class="{ 'vc-device-name--open': vcCameraListOpen }"
                  @click="openCameraList?.()"
                >
                  <img
                    :src="icons.cameraOn"
                    alt=""
                    class="vc-device-name-icon"
                    aria-hidden="true"
                  />
                  <span>{{ currentCameraLabel || 'Camera' }}</span>
                  <svg
                    class="vc-device-name-chevron"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2.5"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      d="M19 9l-7 7-7-7"
                    />
                  </svg>
                </button>
                <Transition name="vc-device-list">
                  <div v-if="vcCameraListOpen" class="vc-device-list">
                    <button
                      v-for="opt in vcCameraDeviceOptions"
                      :key="opt.value"
                      type="button"
                      class="vc-device-option"
                      :class="{
                        'vc-device-option--selected':
                          vcCameraDeviceId === opt.value,
                      }"
                      @click="selectCameraDevice?.(opt.value)"
                    >
                      {{ opt.label }}
                    </button>
                  </div>
                </Transition>
              </div>

              <button
                type="button"
                class="vc-device-name vc-device-name--link"
                aria-label="Open voice and video settings"
                @click="onOpenVoiceAudioSettings"
              >
                <img
                  :src="icons.settings"
                  alt=""
                  class="vc-device-name-icon"
                  aria-hidden="true"
                />
                <span>Voice & video</span>
                <svg
                  class="vc-device-name-chevron vc-device-name-chevron--forward"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2.5"
                  aria-hidden="true"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    d="M9 5l7 7-7 7"
                  />
                </svg>
              </button>
            </div>
          </div>
        </Transition>

        <div
          class="vc-panel-controls vc-panel-controls--below-settings flex items-center justify-evenly gap-2 px-3 py-3"
        >
          <button
            type="button"
            class="vc-ctrl-btn"
            :class="{
              'vc-ctrl-btn--active': vcVideo,
              'vc-ctrl-btn--video-on': vcVideo,
            }"
            :title="
              canUseVideo === false
                ? 'Video not allowed for this role'
                : vcVideo
                  ? 'Stop video'
                  : 'Start video'
            "
            :disabled="canUseVideo === false"
            @click="toggleVcVideo"
          >
            <img
              :src="icons.cameraOn"
              alt="Video"
              class="vc-icon w-[20px] h-[20px]"
            />
          </button>
          <button
            type="button"
            class="vc-ctrl-btn"
            :class="{
              'vc-ctrl-btn--active': vcScreenshare,
              'vc-ctrl-btn--screenshare-on': vcScreenshare,
            }"
            :title="vcScreenshare ? 'Stop share' : 'Share screen'"
            @click="toggleVcScreenshare"
          >
            <img
              :src="icons.desktop"
              alt="Screen share"
              class="vc-icon w-[20px] h-[20px]"
            />
          </button>
          <button
            type="button"
            class="vc-ctrl-btn"
            :class="{ 'vc-ctrl-btn--server-mod': serverModActive }"
            :title="isVcMicOff() ? 'Unmute' : 'Mute'"
            @click="toggleVcMute"
          >
            <span
              class="vc-icon-wrap relative inline-flex items-center justify-center"
            >
              <img
                :src="icons.mic"
                :alt="isVcMicOff() ? 'Unmute' : 'Mute'"
                class="vc-icon vc-icon-mic w-[17px] h-[17px]"
                :class="{
                  'vc-icon--off': isVcMicOff(),
                  'vc-icon--server-mod': serverModActive,
                }"
              />
              <Transition name="strike">
                <span
                  v-if="isVcMicOff()"
                  class="vc-icon-strike"
                  :class="{ 'vc-icon-strike--server': serverModActive }"
                  aria-hidden="true"
                />
              </Transition>
            </span>
          </button>
          <button
            type="button"
            class="vc-ctrl-btn"
            :class="{ 'vc-ctrl-btn--server-mod': vcSelfServerDeafened }"
            :title="isVcHeadphonesOff() ? 'Undeafen' : 'Deafen'"
            @click="toggleVcDeafen"
          >
            <span
              class="vc-icon-wrap relative inline-flex items-center justify-center"
            >
              <img
                :src="icons.headphones"
                :alt="isVcHeadphonesOff() ? 'Undeafen' : 'Deafen'"
                class="vc-icon w-[20px] h-[20px]"
                :class="{
                  'vc-icon--off': isVcHeadphonesOff(),
                  'vc-icon--server-mod': vcSelfServerDeafened,
                }"
              />
              <Transition name="strike">
                <span
                  v-if="isVcHeadphonesOff()"
                  class="vc-icon-strike"
                  :class="{ 'vc-icon-strike--server': vcSelfServerDeafened }"
                  aria-hidden="true"
                />
              </Transition>
            </span>
          </button>
          <button
            type="button"
            class="vc-ctrl-btn"
            :class="{ 'vc-ctrl-btn--active': isVcSettingsOpen }"
            title="Voice settings"
            aria-label="Voice settings"
            @click="toggleVcSettings"
          >
            <img
              :src="icons.settings"
              alt=""
              class="vc-icon w-[20px] h-[20px]"
            />
          </button>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped lang="scss">
@use '@/features/channel-panel/styles/channelPanel.scss';
</style>
