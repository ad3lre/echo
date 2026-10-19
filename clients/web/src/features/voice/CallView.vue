<script setup lang="ts">
import { echoT } from '@/i18n';
import { icons } from '@/assets/icons';
import PausedGifAvatar from '@/components/PausedGifAvatar.vue';
import StreamVideoTile from '@/features/voice/components/StreamVideoTile.vue';
import type { StreamVideoTileTrack } from '@/features/voice/composables/streamVideoTileTrack';
import VcActivityPresenceBadges from '@/features/voice/VcActivityPresenceBadges.vue';
import VcActivityKingCrown from '@/features/voice/VcActivityKingCrown.vue';
import { voiceMuteDeafenHoverTitle } from '@/features/voice/voiceIndicatorHints';
import VoiceChannelUserLimitBadge from '@/features/voice/VoiceChannelUserLimitBadge.vue';
import {
  useCallViewState,
  type CallViewProps,
} from '@/features/voice/composables/useCallViewState';

export type { VcModerateAction } from '@/features/voice/composables/useCallViewState';

const props = withDefaults(defineProps<CallViewProps>(), {
  showHeader: true,
  compactLayout: false,
  videoPrimaryDmLayout: false,
});

const {
  STREAM_QUALITY_LABELS,
  STREAM_QUALITY_ORDER,
  callMenuHasVolumeControl,
  callMenuStreamQuality,
  cameraVideoTiles,
  canQuickMentionFromCallMenu,
  dmCallPresenceLabel,
  emitVcModerate,
  focusedStreamParticipantId,
  handleOpenProfile,
  handleRequestFullscreen,
  handleStreamTileAutoQuality,
  handleStreamTileManualQuality,
  mentionParticipantFromCallMenu,
  onCallMenuVolumeInput,
  onParticipantAvatarDblClick,
  onRemoteStreamVolume,
  onRemoteVideoPlaybackWired,
  onTileContextMenu,
  remoteStreamVolumeEnabled,
  remoteStreamVolumePercent,
  screenShareTiles,
  selectCallMenuStreamQuality,
  sideRailVisualTiles,
  stagePrimaryTile,
  tileAvatar,
  useMeetStageLayout,
  vcMenuPos,
  vcMenuRef,
  vcMenuVolumeDraft,
  vcModAllowed,
  vcModSectionVisible,
  vcModerationTarget,
  voiceChannelLimitUi,
} = useCallViewState(props);
</script>

<template>
  <div
    class="call-view isolate flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-[var(--bg)]"
  >
    <!-- Header bar -->
    <div
      v-if="showHeader"
      class="call-header flex h-11 min-h-11 w-full min-w-0 shrink-0 items-center border-b border-border"
      :class="compactLayout ? 'gap-2 px-3' : 'gap-3 px-5'"
    >
      <div
        class="call-header-dot shrink-0"
        :class="participants.length > 0 ? 'bg-emerald-500' : 'bg-glass-active'"
      />
      <button
        v-if="onGoToVoiceChannelInSidebar"
        type="button"
        class="min-w-0 flex-1 truncate border-0 bg-transparent p-0 text-left text-[15px] font-semibold text-foreground transition hover:underline"
        :title="`${channelName} — ${echoT('b27.call.goToChannel')}`"
        @click="onGoToVoiceChannelInSidebar()"
      >
        {{ channelName }}
      </button>
      <span
        v-else
        class="min-w-0 flex-1 truncate text-[15px] font-semibold text-foreground"
        >{{ channelName }}</span
      >
      <span
        class="ml-auto flex shrink-0 items-center gap-2 text-xs tabular-nums"
      >
        <VoiceChannelUserLimitBadge
          v-if="voiceChannelLimitUi"
          :label="voiceChannelLimitUi.label"
          :tone="voiceChannelLimitUi.tone"
          size="md"
          :title="
            echoT('b27.call.usersInVoice', {
              count: voiceChannelLimitUi.count,
              limit: voiceChannelLimitUi.limit,
            })
          "
        />
        <span v-else class="text-fg-subtle">
          {{ participants.length }}
          {{
            participants.length === 1
              ? echoT('b27.call.person')
              : echoT('b27.call.people')
          }}
        </span>
      </span>
    </div>

    <!-- Main content area -->
    <div
      class="flex-1 min-h-0 overflow-auto flex flex-col"
      :class="
        compactLayout
          ? 'px-2 pb-2 pt-1'
          : useMeetStageLayout
            ? 'px-2 pb-2 pt-1 md:px-3 md:pb-3'
            : 'px-4 pb-4 pt-2'
      "
    >
      <!-- Empty state -->
      <div
        v-if="participants.length === 0"
        class="flex flex-1 flex-col items-center justify-center gap-3 text-fg-subtle"
      >
        <svg
          class="w-12 h-12 opacity-40"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
        <p class="text-sm">{{ echoT('b27.call.noOne') }}</p>
        <p class="text-xs text-fg-subtle">{{ echoT('b27.call.inviteHint') }}</p>
      </div>

      <div
        v-else
        class="call-participants-shell flex-1 min-h-0 min-w-0 flex flex-col"
        :class="{
          'call-participants-shell--meet-stage min-h-0 gap-2 md:gap-3':
            useMeetStageLayout,
        }"
      >
        <div
          v-if="useMeetStageLayout"
          class="call-meet-stage-wrap flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
        >
          <div
            v-if="stagePrimaryTile"
            class="call-meet-stage flex min-h-0 min-w-0 flex-1 flex-col"
          >
            <StreamVideoTile
              :key="stagePrimaryTile.tileId"
              class="call-meet-stage-tile max-h-none min-h-[14rem] w-full flex-1 md:min-h-[24rem]"
              :track="stagePrimaryTile.track ?? null"
              :participant-name="stagePrimaryTile.name"
              :participant-pfp="stagePrimaryTile.pfp"
              :participant-id="stagePrimaryTile.id"
              :is-local="stagePrimaryTile.isLocal"
              :is-screen-share="stagePrimaryTile.mediaKind === 'screen'"
              :is-focused="focusedStreamParticipantId === stagePrimaryTile.id"
              :mirror-video="
                stagePrimaryTile.mediaKind !== 'screen' &&
                stagePrimaryTile.isLocal &&
                props.mirrorLocalCamera !== false
              "
              :remote-stream-volume-control="
                remoteStreamVolumeEnabled(stagePrimaryTile.id)
              "
              :remote-stream-volume-percent="
                remoteStreamVolumePercent(stagePrimaryTile.id)
              "
              @request-focus="focusedStreamParticipantId = stagePrimaryTile.id"
              @request-fullscreen="handleRequestFullscreen(stagePrimaryTile.id)"
              @remote-stream-volume-change="
                (v) => onRemoteStreamVolume(stagePrimaryTile.id, v)
              "
              @remote-video-playback-wired="onRemoteVideoPlaybackWired"
              @auto-stream-layer-quality="handleStreamTileAutoQuality"
              @manual-stream-layer-quality="handleStreamTileManualQuality"
            />
          </div>
        </div>
        <div
          class="call-audio-only-gallery flex min-h-0 min-w-0 flex-wrap items-center overflow-auto"
          :class="
            useMeetStageLayout
              ? [
                  'call-participant-rail flex w-full min-h-0 !flex-nowrap items-center gap-2 !overflow-x-auto !overflow-y-hidden overscroll-x-contain touch-pan-x px-2 pb-2 pt-1 custom-scrollbar [scrollbar-gutter:stable]',
                  participants.length >= 5
                    ? 'call-participant-rail--expanded-voice-rail'
                    : '',
                  'max-h-[min(52dvh,48%)] shrink-0 md:max-h-none',
                ]
              : [
                  'call-audio-only-gallery--grid flex-1',
                  participants.length === 1
                    ? 'call-audio-only-gallery--solo'
                    : '',
                  compactLayout
                    ? 'gap-2 px-2 py-3'
                    : 'gap-4 px-4 py-5 sm:gap-5',
                ]
          "
        >
          <div
            v-if="useMeetStageLayout && sideRailVisualTiles.length > 0"
            class="call-participant-rail-media inline-flex shrink-0 flex-nowrap gap-2 pb-1"
          >
            <StreamVideoTile
              v-for="t in sideRailVisualTiles"
              :key="t.tileId"
              :class="[
                'call-participant-rail-media-tile shrink-0 overflow-hidden rounded-xl border-0 bg-black/20',
                participants.length >= 5
                  ? 'aspect-video w-[min(11.25rem,40vw)] min-w-[9.25rem] max-w-[12rem]'
                  : 'aspect-video w-[10rem] min-w-[8.75rem] max-w-[11.5rem]',
              ]"
              :track="(t.track as StreamVideoTileTrack | null) ?? null"
              :participant-name="t.name"
              :participant-pfp="t.pfp"
              :participant-id="t.id"
              :is-local="t.isLocal"
              :is-screen-share="t.mediaKind === 'screen'"
              :is-focused="focusedStreamParticipantId === t.id"
              fit-video="cover"
              hide-participant-bar
              :mirror-video="
                t.mediaKind !== 'screen' &&
                t.isLocal &&
                props.mirrorLocalCamera !== false
              "
              :remote-stream-volume-control="remoteStreamVolumeEnabled(t.id)"
              :remote-stream-volume-percent="remoteStreamVolumePercent(t.id)"
              @request-focus="focusedStreamParticipantId = t.id"
              @request-fullscreen="handleRequestFullscreen(t.id)"
              @remote-stream-volume-change="
                (v) => onRemoteStreamVolume(t.id, v)
              "
              @remote-video-playback-wired="onRemoteVideoPlaybackWired"
              @auto-stream-layer-quality="handleStreamTileAutoQuality"
              @manual-stream-layer-quality="handleStreamTileManualQuality"
            />
          </div>
          <div
            v-for="p in participants"
            :key="p.id"
            class="call-audio-circle call-tile group relative flex flex-col overflow-hidden"
            :class="{
              'call-tile--dm-pending':
                !!p.dmCallPresence && p.dmCallPresence !== 'live',
              'call-audio-circle--self call-tile--self': currentUserId === p.id,
              'call-audio-circle--rail call-tile--rail': useMeetStageLayout,
              'call-tile--speaking': p.speaking,
              'shrink-0': useMeetStageLayout,
            }"
            @contextmenu="onTileContextMenu(p, $event)"
            @dblclick="onParticipantAvatarDblClick(p)"
          >
            <!-- Blurred pfp backdrop -->
            <img
              :src="tileAvatar(p)"
              aria-hidden="true"
              class="call-tile-backdrop"
            />
            <div
              v-if="dmCallPresenceLabel(p.dmCallPresence)"
              class="call-tile-dm-pill"
              :title="dmCallPresenceLabel(p.dmCallPresence)"
            >
              {{ dmCallPresenceLabel(p.dmCallPresence) }}
            </div>
            <div
              v-if="p.isVcActivityKing || p.activityPresence?.length"
              class="call-tile-activity-badges flex items-center gap-0.5"
            >
              <VcActivityKingCrown
                v-if="p.isVcActivityKing"
                :icon-class="useMeetStageLayout ? 'h-3 w-3' : 'h-3.5 w-3.5'"
              />
              <VcActivityPresenceBadges
                v-if="p.activityPresence?.length"
                :kinds="p.activityPresence"
                :size="useMeetStageLayout ? 'sm' : 'md'"
              />
            </div>
            <div class="call-tile-avatar-area">
              <div class="call-avatar-ring-host rounded-full">
                <button
                  v-if="onOpenProfile"
                  type="button"
                  class="call-audio-circle-avatar-btn border-0 bg-transparent p-0 focus:outline-none focus:ring-2 focus:ring-white/40 rounded-full"
                  :aria-label="echoT('b27.call.openProfile')"
                  @click="handleOpenProfile(p.id, $event)"
                  @contextmenu.stop.prevent="onTileContextMenu(p, $event)"
                >
                  <PausedGifAvatar
                    :src="tileAvatar(p)"
                    :alt="p.name"
                    :session-key="p.id"
                    img-class="call-audio-circle-avatar rounded-full object-cover"
                  />
                </button>
                <template v-else>
                  <div
                    class="call-audio-circle-avatar-wrap"
                    @contextmenu.stop.prevent="onTileContextMenu(p, $event)"
                  >
                    <PausedGifAvatar
                      :src="tileAvatar(p)"
                      :alt="p.name"
                      :session-key="p.id"
                      img-class="call-audio-circle-avatar rounded-full object-cover"
                    />
                  </div>
                </template>
                <!-- Deafen overlay — sits inside ring-host so inset:0 aligns with the avatar circle -->
                <div
                  v-if="p.deafened"
                  class="call-avatar-badge pointer-events-none"
                  :class="{ 'call-avatar-badge--server': p.serverDeafened }"
                  :title="
                    voiceMuteDeafenHoverTitle({
                      deafened: p.deafened,
                      serverDeafened: p.serverDeafened,
                    })
                  "
                >
                  <div class="call-avatar-badge-bg" />
                  <img
                    :src="icons.headphones"
                    alt=""
                    class="call-avatar-badge-icon"
                  />
                </div>
              </div>
            </div>
            <div class="call-tile-bottom">
              <span class="call-tile-name" :title="p.name">{{ p.name }}</span>
              <div
                class="call-tile-indicators flex items-center gap-1 text-xs text-fg-soft"
              >
                <template v-if="p.serverDeafened">
                  <span
                    class="call-indicator-icon-wrap call-indicator-icon-wrap--server"
                    :title="echoT('voiceChrome.serverDeafened')"
                  >
                    <img
                      :src="icons.mic"
                      alt=""
                      class="call-indicator-icon !h-2.5 !w-2.5"
                    />
                    <span class="call-indicator-strike" aria-hidden="true" />
                  </span>
                  <span
                    class="call-indicator-icon-wrap call-indicator-icon-wrap--server"
                    :title="echoT('voiceChrome.serverDeafened')"
                  >
                    <img
                      :src="icons.headphones"
                      alt=""
                      class="call-indicator-icon !h-2.5 !w-2.5"
                    />
                    <span class="call-indicator-strike" aria-hidden="true" />
                  </span>
                </template>
                <template v-else-if="p.deafened">
                  <span
                    class="call-indicator-icon-wrap"
                    :class="{
                      'call-indicator-icon-wrap--server': p.serverMuted,
                    }"
                    :title="
                      p.serverMuted
                        ? echoT('voiceChrome.serverMuted')
                        : echoT('voiceChrome.muted')
                    "
                  >
                    <img
                      :src="icons.mic"
                      alt=""
                      class="call-indicator-icon !h-2.5 !w-2.5"
                    />
                    <span class="call-indicator-strike" aria-hidden="true" />
                  </span>
                  <span
                    class="call-indicator-icon-wrap"
                    :title="echoT('voiceChrome.deafened')"
                  >
                    <img
                      :src="icons.headphones"
                      alt=""
                      class="call-indicator-icon !h-2.5 !w-2.5"
                    />
                    <span class="call-indicator-strike" aria-hidden="true" />
                  </span>
                </template>
                <span
                  v-else-if="p.serverMuted"
                  class="call-indicator-icon-wrap call-indicator-icon-wrap--server"
                  :title="echoT('voiceChrome.serverMuted')"
                >
                  <img
                    :src="icons.mic"
                    alt=""
                    class="call-indicator-icon !h-2.5 !w-2.5"
                  />
                  <span class="call-indicator-strike" aria-hidden="true" />
                </span>
                <span
                  v-else-if="p.muted"
                  class="call-indicator-icon-wrap"
                  :title="echoT('voiceChrome.muted')"
                >
                  <img
                    :src="icons.mic"
                    alt=""
                    class="call-indicator-icon !h-2.5 !w-2.5"
                  />
                  <span class="call-indicator-strike" aria-hidden="true" />
                </span>
              </div>
            </div>
          </div>
        </div>
        <div v-if="!useMeetStageLayout" class="contents">
          <div
            v-if="screenShareTiles.length > 0"
            class="call-stream-stage mb-3 shrink-0 min-h-0"
          >
            <div
              class="call-stream-stage-row flex min-h-0 min-w-0 gap-2 overflow-x-auto overflow-y-hidden overscroll-x-contain touch-pan-x custom-scrollbar pb-1 [scrollbar-gutter:stable]"
            >
              <StreamVideoTile
                v-for="t in screenShareTiles"
                :key="`screen-${t.id}`"
                class="h-40 max-h-[36dvh] min-h-[10rem] w-[min(18rem,calc(100vw-2.5rem))] min-w-[14rem] max-w-[20rem] shrink-0"
                :track="(t.track as StreamVideoTileTrack | null) ?? null"
                :participant-name="t.name"
                :participant-pfp="t.pfp"
                :participant-id="t.id"
                :is-local="t.isLocal"
                is-screen-share
                :is-focused="focusedStreamParticipantId === t.id"
                :remote-stream-volume-control="remoteStreamVolumeEnabled(t.id)"
                :remote-stream-volume-percent="remoteStreamVolumePercent(t.id)"
                @request-focus="focusedStreamParticipantId = t.id"
                @request-fullscreen="handleRequestFullscreen(t.id)"
                @remote-stream-volume-change="
                  (v) => onRemoteStreamVolume(t.id, v)
                "
                @remote-video-playback-wired="onRemoteVideoPlaybackWired"
                @auto-stream-layer-quality="handleStreamTileAutoQuality"
                @manual-stream-layer-quality="handleStreamTileManualQuality"
              />
            </div>
          </div>
          <div
            v-if="cameraVideoTiles.length > 0"
            class="call-camera-stage mb-3 shrink-0 min-h-0"
          >
            <div
              class="call-camera-stage-row flex min-h-0 min-w-0 gap-2 overflow-x-auto overflow-y-hidden overscroll-x-contain touch-pan-x custom-scrollbar pb-1 [scrollbar-gutter:stable]"
            >
              <StreamVideoTile
                v-for="t in cameraVideoTiles"
                :key="`cam-${t.id}`"
                class="h-36 max-h-[32dvh] min-h-[9rem] w-[min(14rem,calc(100vw-2.5rem))] min-w-[11rem] max-w-[16rem] shrink-0"
                :track="(t.track as StreamVideoTileTrack | null) ?? null"
                :participant-name="t.name"
                :participant-pfp="t.pfp"
                :participant-id="t.id"
                :is-local="t.isLocal"
                :is-focused="focusedStreamParticipantId === t.id"
                :mirror-video="t.isLocal && props.mirrorLocalCamera !== false"
                :remote-stream-volume-control="remoteStreamVolumeEnabled(t.id)"
                :remote-stream-volume-percent="remoteStreamVolumePercent(t.id)"
                @request-focus="focusedStreamParticipantId = t.id"
                @request-fullscreen="handleRequestFullscreen(t.id)"
                @remote-stream-volume-change="
                  (v) => onRemoteStreamVolume(t.id, v)
                "
                @remote-video-playback-wired="onRemoteVideoPlaybackWired"
                @auto-stream-layer-quality="handleStreamTileAutoQuality"
                @manual-stream-layer-quality="handleStreamTileManualQuality"
              />
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Context menu -->
    <Teleport to="body">
      <div
        v-if="vcModerationTarget && vcModerationTarget.id !== currentUserId"
        ref="vcMenuRef"
        class="call-vc-menu fixed z-[300] min-w-[200px] rounded-lg border border-border bg-[var(--echo-menu-bg)] py-1 shadow-xl"
        :style="{ left: `${vcMenuPos.left}px`, top: `${vcMenuPos.top}px` }"
        role="menu"
        @click.stop
        @mousedown.stop
      >
        <div
          v-if="canQuickMentionFromCallMenu"
          class="border-b border-border px-2 py-1"
        >
          <button
            type="button"
            class="flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left text-sm text-foreground transition-colors hover:bg-indigo-500/15"
            role="menuitem"
            :title="
              echoT('b27.call.insertMention', {
                name: vcModerationTarget?.name ?? '',
              })
            "
            @click="mentionParticipantFromCallMenu"
          >
            <span
              class="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-indigo-500/20 text-[13px] font-bold text-indigo-200"
              aria-hidden="true"
              >@</span
            >
            <span class="flex min-w-0 flex-col gap-0.5">
              <span class="font-semibold leading-tight">{{
                echoT('b27.call.quickMention')
              }}</span>
              <span class="text-[11px] leading-snug text-fg-subtle">{{
                echoT('b27.call.quickMentionDesc')
              }}</span>
            </span>
          </button>
        </div>
        <div
          v-if="callMenuHasVolumeControl()"
          class="border-b border-border px-3 py-2"
          :class="{ 'border-t border-border': canQuickMentionFromCallMenu }"
          @pointerdown.stop
        >
          <div
            class="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-fg-subtle"
          >
            <img
              :src="icons.volumeUp"
              alt=""
              class="app-inline-icon h-3.5 w-3.5 opacity-80"
            />
            {{ echoT('b27.call.theirVolume') }}
          </div>
          <div class="mt-2 flex items-center gap-2">
            <input
              type="range"
              class="call-vc-menu-volume-range h-1.5 min-w-0 flex-1 cursor-pointer accent-violet-400"
              min="0"
              max="200"
              :value="vcMenuVolumeDraft"
              :aria-label="echoT('voiceChrome.participantVolume')"
              @input="onCallMenuVolumeInput"
            />
            <span
              class="w-9 shrink-0 text-right text-[11px] tabular-nums text-fg-soft"
              >{{ Math.round(vcMenuVolumeDraft) }}%</span
            >
          </div>
        </div>
        <template
          v-if="
            vcModerationTarget &&
            (vcModerationTarget.video || vcModerationTarget.streaming)
          "
        >
          <div
            class="border-b border-border px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-fg-subtle"
          >
            {{ echoT('b27.call.streamQuality') }}
          </div>
          <button
            v-for="sq in STREAM_QUALITY_ORDER"
            :key="sq"
            type="button"
            class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors"
            :class="
              callMenuStreamQuality === sq
                ? 'bg-indigo-500/10 text-indigo-300'
                : 'text-gray-200 hover:bg-glass-hover'
            "
            role="menuitem"
            @click="selectCallMenuStreamQuality(sq)"
          >
            <span
              class="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border"
              :class="
                callMenuStreamQuality === sq
                  ? 'border-indigo-400 bg-indigo-500'
                  : 'border-border bg-transparent'
              "
            >
              <span
                v-if="callMenuStreamQuality === sq"
                class="block h-1.5 w-1.5 rounded-full bg-white"
              />
            </span>
            {{ STREAM_QUALITY_LABELS[sq] }}
          </button>
        </template>
        <template v-if="vcModSectionVisible(vcModerationTarget.id)">
          <div
            v-if="
              canQuickMentionFromCallMenu ||
              callMenuHasVolumeControl() ||
              !!(vcModerationTarget.video || vcModerationTarget.streaming)
            "
            class="my-1 h-px bg-glass-2"
            role="separator"
          />
          <div
            class="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-red-300/90"
          >
            {{ echoT('b27.call.moderation') }}
          </div>
          <button
            v-if="vcModAllowed(vcModerationTarget.id, 'serverMute')"
            type="button"
            class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-200 hover:bg-red-500/15"
            role="menuitem"
            @click="emitVcModerate('serverMute', vcModerationTarget.id)"
          >
            <img
              :src="icons.mic"
              alt=""
              class="app-inline-icon h-4 w-4 opacity-80"
            />
            {{
              vcModerationTarget.serverMuted
                ? echoT('b27.call.unmuteMember')
                : echoT('b27.call.muteMember')
            }}
          </button>
          <button
            v-if="vcModAllowed(vcModerationTarget.id, 'serverDeafen')"
            type="button"
            class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-200 hover:bg-red-500/15"
            role="menuitem"
            @click="emitVcModerate('serverDeafen', vcModerationTarget.id)"
          >
            <img
              :src="icons.headphones"
              alt=""
              class="app-inline-icon h-4 w-4 opacity-80"
            />
            {{
              vcModerationTarget.serverDeafened
                ? echoT('b27.call.undeafenMember')
                : echoT('b27.call.deafenMember')
            }}
          </button>
          <button
            v-if="
              vcModerationTarget.video &&
              vcModAllowed(vcModerationTarget.id, 'stopCamera')
            "
            type="button"
            class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-200 hover:bg-red-500/15"
            role="menuitem"
            @click="emitVcModerate('stopCamera', vcModerationTarget.id)"
          >
            <img
              :src="icons.cameraOn"
              alt=""
              class="app-inline-icon h-4 w-4 opacity-80"
            />
            {{ echoT('b27.call.turnOffCamera') }}
          </button>
          <button
            v-if="
              vcModerationTarget.streaming &&
              vcModAllowed(vcModerationTarget.id, 'stopScreenShare')
            "
            type="button"
            class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-200 hover:bg-red-500/15"
            role="menuitem"
            @click="emitVcModerate('stopScreenShare', vcModerationTarget.id)"
          >
            <img
              :src="icons.desktop"
              alt=""
              class="app-inline-icon h-4 w-4 opacity-80"
            />
            {{ echoT('b27.call.stopScreenShare') }}
          </button>
          <button
            v-if="vcModAllowed(vcModerationTarget.id, 'disconnect')"
            type="button"
            class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-200 hover:bg-red-500/15"
            role="menuitem"
            @click="emitVcModerate('disconnect', vcModerationTarget.id)"
          >
            <svg
              class="h-4 w-4 shrink-0"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"
              />
            </svg>
            {{ echoT('voiceChrome.disconnect') }}
          </button>
        </template>
      </div>
    </Teleport>
  </div>
</template>

<style scoped lang="scss" src="./styles/CallView.scss"></style>
