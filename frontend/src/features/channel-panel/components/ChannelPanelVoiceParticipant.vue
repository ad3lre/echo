<script setup lang="ts">
import { icons } from '@/assets/icons';
import { resolveCallTileAvatarUrl } from '@/utils/avatarDisplay';
import PausedGifAvatar from '@/components/PausedGifAvatar.vue';
import ServerOwnerCrownIcon from '@/components/ServerOwnerCrownIcon.vue';
import VcActivityKingCrown from '@/features/voice/components/VcActivityKingCrown.vue';
import VcActivityPresenceBadges from '@/features/voice/components/VcActivityPresenceBadges.vue';
import {
  VOICE_CAMERA_ON_HOVER_TITLE,
  VOICE_STREAMING_HOVER_TITLE,
  voiceMuteDeafenHoverTitle,
} from '@/features/voice/voiceIndicatorHints';
import type { VcActivityPresenceKind } from '@/features/voice/vcActivityTypes';

defineProps<{
  userId: string;
  name?: string;
  pfp?: string;
  /** Moderator drag-move between voice channels (MOVE_MEMBERS). */
  draggable?: boolean;
  /** While dragging this row (visual feedback). */
  isDragSource?: boolean;
  /** Guild owner — small crown beside display name. */
  isServerOwner?: boolean;
  vc: {
    muted: boolean;
    deafened: boolean;
    serverMuted: boolean;
    serverDeafened: boolean;
    streaming: boolean;
    video: boolean;
    speaking?: boolean;
    audioLevel?: number;
  };
  isActive: boolean;
  /** YouTube / activities — same source as CallView. */
  activityPresence?: VcActivityPresenceKind[];
  /** Crown: this user is driving synced VC activity for the room. */
  isVcActivityKing?: boolean;
}>();

const emit = defineEmits<{
  click: [event: MouseEvent | HTMLElement];
  contextmenu: [event: MouseEvent];
  dragstart: [event: DragEvent];
  dragend: [event: DragEvent];
}>();
</script>

<template>
  <div
    :data-vc-user-id="userId"
    class="vc-participant-row flex items-center gap-2 py-0.5 px-1 rounded-md cursor-pointer"
    :class="[
      isActive ? 'bg-glass-2' : 'hover:bg-glass-1',
      {
        'vc-participant-row--draggable': draggable,
        'vc-participant-row--drag-source': isDragSource,
      },
    ]"
    :draggable="draggable"
    :title="draggable ? 'Drag to move to another voice channel' : undefined"
    @click.stop="emit('click', $event)"
    @contextmenu.stop.prevent="emit('contextmenu', $event)"
    @dragstart.stop="emit('dragstart', $event)"
    @dragend.stop="emit('dragend', $event)"
  >
    <div
      class="vc-participant-avatar-wrap relative h-6 w-6 flex-shrink-0 rounded-full"
      :class="{ 'vc-speaking-ring': vc.speaking }"
      :style="
        vc.speaking
          ? ({
              '--speak-strength': Math.min(1, (vc.audioLevel ?? 0) * 3 + 0.5),
            } as any)
          : undefined
      "
    >
      <PausedGifAvatar
        :src="resolveCallTileAvatarUrl(pfp, userId)"
        :alt="name ?? ''"
        :session-key="userId"
        img-class="vc-participant-avatar rounded-full object-cover"
      />
      <div
        v-if="vc.deafened"
        class="vc-avatar-badge"
        :class="{ 'vc-avatar-badge--server': vc.serverDeafened }"
        :title="
          voiceMuteDeafenHoverTitle({
            deafened: vc.deafened,
            serverDeafened: vc.serverDeafened,
          })
        "
      >
        <div class="vc-avatar-badge-bg" />
        <img
          :src="icons.headphones"
          :alt="vc.serverDeafened ? 'Server deafened' : 'Deafened'"
          class="vc-avatar-badge-icon"
        />
      </div>
    </div>
    <span
      class="vc-participant-name text-[11px] truncate flex-1 min-w-0 inline-flex items-center gap-0.5"
      :class="vc.deafened || vc.muted ? 'vc-participant-name--dim' : ''"
    >
      <span class="min-w-0 truncate">{{ name ?? 'Unknown' }}</span>
      <VcActivityKingCrown v-if="isVcActivityKing" icon-class="h-3 w-3" />
      <ServerOwnerCrownIcon v-if="isServerOwner" icon-class="h-3 w-3" />
    </span>
    <div
      class="vc-participant-indicators ml-auto flex items-center gap-0.5 text-[10px] text-fg-soft"
    >
      <span
        v-if="vc.streaming"
        class="vc-indicator-badge vc-indicator-badge--stream"
        :title="VOICE_STREAMING_HOVER_TITLE"
      >
        <img :src="icons.stream" alt="" class="vc-indicator-icon" />
      </span>
      <span
        v-if="vc.video"
        class="vc-indicator-pill"
        :title="VOICE_CAMERA_ON_HOVER_TITLE"
      >
        <img :src="icons.cameraOn" alt="" class="vc-indicator-icon" />
      </span>
      <VcActivityPresenceBadges
        v-if="activityPresence?.length"
        :kinds="activityPresence"
        size="sm"
        class="flex-shrink-0"
      />
      <template v-if="vc.serverDeafened">
        <span
          class="vc-indicator-icon-wrap vc-indicator-icon-wrap--server"
          title="Server deafened"
        >
          <img :src="icons.mic" alt="" class="vc-indicator-icon" />
          <span class="vc-indicator-strike" aria-hidden="true" />
        </span>
        <span
          class="vc-indicator-icon-wrap vc-indicator-icon-wrap--server"
          title="Server deafened"
        >
          <img :src="icons.headphones" alt="" class="vc-indicator-icon" />
          <span class="vc-indicator-strike" aria-hidden="true" />
        </span>
      </template>
      <template v-else-if="vc.deafened">
        <span
          class="vc-indicator-icon-wrap"
          :class="{ 'vc-indicator-icon-wrap--server': vc.serverMuted }"
          :title="vc.serverMuted ? 'Server muted' : 'Muted'"
        >
          <img :src="icons.mic" alt="" class="vc-indicator-icon" />
          <span class="vc-indicator-strike" aria-hidden="true" />
        </span>
        <span class="vc-indicator-icon-wrap" title="Deafened">
          <img :src="icons.headphones" alt="" class="vc-indicator-icon" />
          <span class="vc-indicator-strike" aria-hidden="true" />
        </span>
      </template>
      <span
        v-else-if="vc.serverMuted"
        class="vc-indicator-icon-wrap vc-indicator-icon-wrap--server"
        title="Server muted"
      >
        <img :src="icons.mic" alt="" class="vc-indicator-icon" />
        <span class="vc-indicator-strike" aria-hidden="true" />
      </span>
      <span
        v-else-if="vc.muted"
        class="vc-indicator-icon-wrap"
        :title="
          voiceMuteDeafenHoverTitle({
            muted: vc.muted,
            serverMuted: vc.serverMuted,
          })
        "
      >
        <img :src="icons.mic" alt="" class="vc-indicator-icon" />
        <span class="vc-indicator-strike" aria-hidden="true" />
      </span>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '@/features/channel-panel/styles/channelPanelListParticipant.scss';
</style>
