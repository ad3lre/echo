<script setup lang="ts">
import { computed, inject, ref, unref, watch } from 'vue';
import {
  LAYOUT_CHAT_SURFACE_KEY,
  type LayoutChatSurfaceContext,
} from '@/features/layout/layoutInjectionKeys';
import { icons } from '@/assets/icons';
/** Matches `features/voice` `VcModerateAction` without importing voice internals. */
type VcModerateAction =
  | 'serverMute'
  | 'serverDeafen'
  | 'disconnect'
  | 'move'
  | 'stopCamera'
  | 'stopScreenShare';

const props = defineProps<{
  targetUserId: string;
  currentUserId?: string;
}>();

const layout = inject(
  LAYOUT_CHAT_SURFACE_KEY,
  null,
) as LayoutChatSurfaceContext | null;

const volumeDraft = ref(100);

const voiceChannelId = computed(() =>
  String(unref(layout?.currentVoiceChannelId) ?? '').trim(),
);

const participant = computed(() => {
  const id = props.targetUserId.trim();
  if (!id || !voiceChannelId.value) return null;
  const list = (unref(layout?.activeVoiceChannelParticipants) ?? []) as Array<{
    id: string;
    name: string;
    muted?: boolean;
    deafened?: boolean;
    video?: boolean;
    streaming?: boolean;
    serverMuted?: boolean;
    serverDeafened?: boolean;
  }>;
  return list.find((p) => p.id === id) ?? null;
});

const visible = computed(() => {
  if (!layout) return false;
  if (!voiceChannelId.value) return false;
  if (!props.targetUserId.trim()) return false;
  if (props.targetUserId === props.currentUserId) return false;
  return !!participant.value;
});

watch(
  () => [visible.value, props.targetUserId] as const,
  ([v]) => {
    if (!v) return;
    const getVol = unref(layout?.getRemoteParticipantVolume) as
      | ((id: string) => number)
      | undefined;
    volumeDraft.value = getVol?.(props.targetUserId) ?? 100;
  },
  { immediate: true },
);

function canMod(action: VcModerateAction): boolean {
  const fn = unref(layout?.canVcModerateParticipantAction) as
    | ((userId: string, action: VcModerateAction) => boolean)
    | undefined;
  if (fn) return fn(props.targetUserId, action);
  const legacy = unref(layout?.canModerateVcParticipant) as
    | ((userId: string) => boolean)
    | undefined;
  return legacy?.(props.targetUserId) ?? false;
}

const showModeration = computed(() => {
  const p = participant.value;
  if (!p) return false;
  return (
    canMod('serverMute') ||
    canMod('serverDeafen') ||
    canMod('disconnect') ||
    (p.video && canMod('stopCamera')) ||
    (p.streaming && canMod('stopScreenShare'))
  );
});

const hasVolumeControl = computed(
  () => typeof unref(layout?.setRemoteParticipantVolume) === 'function',
);

function emitModerate(action: VcModerateAction) {
  const fn = unref(layout?.handleVcModerate) as
    | ((payload: {
        action: VcModerateAction;
        targetUserId: string;
        contextVoiceChannelId?: string;
      }) => void)
    | undefined;
  fn?.({
    action,
    targetUserId: props.targetUserId,
    contextVoiceChannelId: voiceChannelId.value || undefined,
  });
}

function onVolumeInput(e: Event) {
  const setVol = unref(layout?.setRemoteParticipantVolume) as
    | ((id: string, v: number) => void)
    | undefined;
  if (!setVol) return;
  const v = Number((e.target as HTMLInputElement).value);
  if (!Number.isFinite(v)) return;
  volumeDraft.value = v;
  setVol(props.targetUserId, v);
}
</script>

<template>
  <section
    v-if="visible && participant"
    class="member-profile-voice-actions border-t border-border px-4 py-3"
    aria-label="Voice chat actions"
  >
    <div
      class="mb-2.5 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-fg-subtle"
    >
      <img
        :src="icons.mic"
        alt=""
        class="member-profile-voice-actions__glyph h-3.5 w-3.5 opacity-80"
      />
      In voice with you
    </div>

    <div
      v-if="hasVolumeControl"
      class="member-profile-voice-actions__volume mb-3 rounded-xl bg-glass-1 px-3 py-2.5"
      @pointerdown.stop
    >
      <div
        class="flex items-center justify-between gap-2 text-[11px] font-medium text-fg-soft"
      >
        <span class="flex items-center gap-1.5">
          <img
            :src="icons.volumeUp"
            alt=""
            class="member-profile-voice-actions__glyph h-3.5 w-3.5 opacity-80"
          />
          Their volume
        </span>
        <span class="tabular-nums">{{ Math.round(volumeDraft) }}%</span>
      </div>
      <input
        type="range"
        class="member-profile-voice-actions__range mt-2 h-1.5 w-full cursor-pointer accent-violet-400"
        min="0"
        max="200"
        :value="volumeDraft"
        aria-label="Participant volume"
        @input="onVolumeInput"
      />
    </div>

    <div
      v-if="showModeration"
      class="flex flex-wrap gap-2"
      role="group"
      aria-label="Voice moderation"
    >
      <button
        v-if="canMod('serverMute')"
        type="button"
        class="member-profile-voice-actions__btn"
        @click="emitModerate('serverMute')"
      >
        <img
          :src="icons.mic"
          alt=""
          class="member-profile-voice-actions__glyph h-3.5 w-3.5"
        />
        {{ participant.serverMuted ? 'Unmute' : 'Mute' }}
      </button>
      <button
        v-if="canMod('serverDeafen')"
        type="button"
        class="member-profile-voice-actions__btn"
        @click="emitModerate('serverDeafen')"
      >
        <img
          :src="icons.headphones"
          alt=""
          class="member-profile-voice-actions__glyph h-3.5 w-3.5"
        />
        {{ participant.serverDeafened ? 'Undeafen' : 'Deafen' }}
      </button>
      <button
        v-if="participant.video && canMod('stopCamera')"
        type="button"
        class="member-profile-voice-actions__btn"
        @click="emitModerate('stopCamera')"
      >
        <img
          :src="icons.cameraOn"
          alt=""
          class="member-profile-voice-actions__glyph h-3.5 w-3.5"
        />
        Stop camera
      </button>
      <button
        v-if="participant.streaming && canMod('stopScreenShare')"
        type="button"
        class="member-profile-voice-actions__btn"
        @click="emitModerate('stopScreenShare')"
      >
        <img
          :src="icons.desktop"
          alt=""
          class="member-profile-voice-actions__glyph h-3.5 w-3.5"
        />
        Stop share
      </button>
      <button
        v-if="canMod('disconnect')"
        type="button"
        class="member-profile-voice-actions__btn member-profile-voice-actions__btn--danger"
        @click="emitModerate('disconnect')"
      >
        <img
          :src="icons.logOut"
          alt=""
          class="member-profile-voice-actions__glyph h-3.5 w-3.5"
        />
        Disconnect
      </button>
    </div>
  </section>
</template>

<style scoped lang="scss">
.member-profile-voice-actions__btn {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.375rem 0.625rem;
  border: 1px solid color-mix(in srgb, var(--border) 88%, transparent);
  border-radius: 0.625rem;
  background: color-mix(in srgb, var(--ui-glass-1) 80%, transparent);
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--text);
  transition:
    background-color 0.15s ease,
    border-color 0.15s ease;

  &:hover {
    background: var(--ui-glass-2);
    border-color: color-mix(in srgb, var(--border) 100%, transparent);
  }
  &:active {
    opacity: 0.88;
  }
}

.member-profile-voice-actions__btn--danger {
  color: rgb(251 113 133);
  border-color: color-mix(in srgb, rgb(244 63 94) 35%, var(--border));

  &:hover {
    background: rgba(244, 63, 94, 0.12);
  }
}

[data-theme='light'] .member-profile-voice-actions__btn--danger {
  color: rgb(190 18 60);

  &:hover {
    background: rgba(225, 29, 72, 0.1);
  }
}

.member-profile-voice-actions__glyph {
  opacity: 0.9;
}

[data-theme='dark'] .member-profile-voice-actions__glyph {
  filter: invert(1);
}
</style>
