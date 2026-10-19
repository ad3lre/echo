<script setup lang="ts">
import { echoT } from '@/i18n';
import {
  computed,
  inject,
  onMounted,
  onUnmounted,
  ref,
  unref,
  watch,
} from 'vue';
import {
  LAYOUT_CHAT_SURFACE_KEY,
  type LayoutChatSurfaceContext,
} from '@/features/layout/layoutInjectionKeys';
import { useSpeakingState } from '@/features/layout/composables/voice/useSpeakingState';
import PausedGifAvatar from '@/components/PausedGifAvatar.vue';
import { icons } from '@/assets/icons';
import { resolveCallTileAvatarUrl } from '@/features/layout/display/avatarDisplay';

type SpeakerPerson = { id: string; name: string; pfp: string };

const layout = inject(
  LAYOUT_CHAT_SURFACE_KEY,
  null,
) as LayoutChatSurfaceContext | null;
const { speakingMap, localSpeaking, localUserId } = useSpeakingState();

const narrowViewport = ref(
  typeof window !== 'undefined' ? window.innerWidth < 768 : false,
);
const expanded = ref(false);
/** Stick on the last person who spoke so the bar doesn’t thrash name/width. */
const lastSpeaker = ref<SpeakerPerson | null>(null);

function syncNarrowViewport() {
  if (typeof window === 'undefined') return;
  narrowViewport.value = window.innerWidth < 768;
}

onMounted(() => {
  syncNarrowViewport();
  if (typeof window !== 'undefined') {
    window.addEventListener('resize', syncNarrowViewport);
  }
});

onUnmounted(() => {
  if (typeof window !== 'undefined') {
    window.removeEventListener('resize', syncNarrowViewport);
  }
});

const voiceChannelId = computed(() =>
  String(unref(layout?.currentVoiceChannelId) ?? '').trim(),
);

const visible = computed(() => {
  if (!narrowViewport.value) return false;
  if (!layout) return false;
  if (!voiceChannelId.value) return false;
  if (unref(layout.isViewingVoiceChannel)) return false;
  return true;
});

watch(voiceChannelId, (id, prev) => {
  if (id !== prev) {
    lastSpeaker.value = null;
    expanded.value = false;
  }
});

watch(visible, (v) => {
  if (!v) expanded.value = false;
});

const liveDominant = computed((): SpeakerPerson | null => {
  if (!layout) return null;
  const participants = (unref(layout.activeVoiceChannelParticipants) ??
    []) as SpeakerPerson[];
  const selfId = String(unref(localUserId) ?? '').trim();
  const sm = { ...unref(speakingMap) };
  let bestId: string | null = null;
  let bestLevel = -1;
  for (const [id, v] of Object.entries(sm)) {
    if (v?.speaking) {
      const lv = v.level ?? 0;
      if (lv > bestLevel) {
        bestLevel = lv;
        bestId = id;
      }
    }
  }
  if (selfId && unref(localSpeaking)) {
    const lv = sm[selfId]?.level ?? 0.05;
    if (bestLevel < 0.02 || lv >= bestLevel) bestId = selfId;
  }
  if (!bestId) return null;
  const p = participants.find((x) => x.id === bestId);
  return p ?? { id: bestId, name: echoT('b30.speakerPill.someone'), pfp: '' };
});

watch(
  liveDominant,
  (d) => {
    if (!d) return;
    const prev = lastSpeaker.value;
    if (
      prev &&
      prev.id === d.id &&
      prev.name === d.name &&
      prev.pfp === d.pfp
    ) {
      return;
    }
    lastSpeaker.value = { id: d.id, name: d.name, pfp: d.pfp };
  },
  { immediate: true },
);

const displayPerson = computed(() => liveDominant.value ?? lastSpeaker.value);

const isSpeaking = computed(() => !!liveDominant.value);

const voiceChannelName = computed(() => {
  const getName = unref(layout?.getChannelDisplayName) as
    | ((name?: string) => string)
    | undefined;
  const voiceId = voiceChannelId.value;
  const channels = (unref(layout?.allChannels) ?? []) as Array<{
    id?: string;
    name?: string;
  }>;
  if (voiceId) {
    const match = channels.find((c) => c.id === voiceId);
    if (match?.name) return getName?.(match.name) ?? match.name;
  }
  return echoT('b30.speakerPill.voice');
});

const primaryLabel = computed(
  () => displayPerson.value?.name?.trim() || voiceChannelName.value,
);

const muted = computed(() => Boolean(unref(layout?.vcMuted)));
const deafened = computed(() => Boolean(unref(layout?.vcDeafened)));

function toggleExpanded() {
  expanded.value = !expanded.value;
}

function collapseIfExpanded() {
  expanded.value = false;
}

function goToVoiceChannel() {
  collapseIfExpanded();
  if (!layout) return;
  const vid = voiceChannelId.value;
  if (!vid) return;
  const openServerSurfaceForChannel = unref(
    (layout as { openServerSurfaceForChannel?: unknown })
      .openServerSurfaceForChannel,
  ) as ((channelId: string) => void) | undefined;
  const go = unref(layout.handleGoToChannel) as
    | ((id: string) => void)
    | undefined;
  const expand = unref(layout.expandVoiceSideChat) as (() => void) | undefined;
  if (openServerSurfaceForChannel) {
    openServerSurfaceForChannel(vid);
  } else {
    go?.(vid);
  }
  expand?.();
}

function toggleMute() {
  if (!layout) return;
  const setMuted = unref(layout.onGuildChannelVcMuted) as
    | ((next: boolean) => void)
    | undefined;
  setMuted?.(!muted.value);
}

function toggleDeafen() {
  if (!layout) return;
  const setDeafened = unref(layout.onGuildChannelVcDeafened) as
    | ((next: boolean) => void)
    | undefined;
  setDeafened?.(!deafened.value);
}

function leaveVoice() {
  collapseIfExpanded();
  if (!layout) return;
  const leave = unref(layout.handleChannelVoicePanelLeave) as
    | (() => void | Promise<void>)
    | undefined;
  void leave?.();
}
</script>

<template>
  <div
    v-if="visible"
    class="guild-vc-speaker-bar-host shrink-0"
    :class="{
      'guild-vc-speaker-bar-host--expanded': expanded,
      'guild-vc-speaker-bar-host--speaking': isSpeaking,
    }"
  >
    <button
      v-if="expanded"
      type="button"
      class="guild-vc-speaker-bar__backdrop"
      :aria-label="echoT('b30.speakerPill.closeControls')"
      @click="collapseIfExpanded"
    />

    <div class="guild-vc-speaker-bar">
      <button
        type="button"
        class="guild-vc-speaker-bar__main"
        :aria-expanded="expanded"
        :aria-label="echoT('b30.speakerPill.sessionIndicator')"
        @click="toggleExpanded"
      >
        <div class="guild-vc-speaker-bar__avatar-wrap">
          <template v-if="displayPerson">
            <PausedGifAvatar
              :src="
                resolveCallTileAvatarUrl(displayPerson.pfp, displayPerson.id)
              "
              :alt="displayPerson.name"
              :session-key="displayPerson.id"
              img-class="h-full w-full rounded-full object-cover"
            />
            <span
              v-if="isSpeaking"
              class="guild-vc-speaker-bar__speak-ring"
              aria-hidden="true"
            />
          </template>
          <div v-else class="guild-vc-speaker-bar__glyph-fallback">
            <img
              :src="icons.mic"
              alt=""
              class="guild-vc-speaker-bar__glyph h-4 w-4"
            />
          </div>
        </div>

        <div class="guild-vc-speaker-bar__copy min-w-0">
          <span class="guild-vc-speaker-bar__name truncate">
            {{ primaryLabel }}
          </span>
          <span
            class="guild-vc-speaker-bar__status truncate"
            :class="{ 'guild-vc-speaker-bar__status--live': isSpeaking }"
          >
            {{
              isSpeaking
                ? echoT('b30.speakerPill.speaking')
                : echoT('b30.speakerPill.inVoice')
            }}
            <template v-if="displayPerson"> · {{ voiceChannelName }} </template>
          </span>
        </div>

        <span class="guild-vc-speaker-bar__chevron" aria-hidden="true">
          <svg
            class="h-4 w-4"
            :class="{ 'guild-vc-speaker-bar__chevron-icon--open': expanded }"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2.2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </span>
      </button>

      <Transition name="speaker-controls">
        <div
          v-if="expanded"
          class="guild-vc-speaker-bar__controls"
          role="toolbar"
          :aria-label="echoT('b30.speakerPill.controls')"
        >
          <button
            type="button"
            class="guild-vc-speaker-bar__ctrl"
            :class="{ 'guild-vc-speaker-bar__ctrl--on': muted }"
            :title="
              muted
                ? echoT('b30.speakerPill.unmute')
                : echoT('b30.speakerPill.mute')
            "
            :aria-label="
              muted
                ? echoT('b30.speakerPill.unmute')
                : echoT('b30.speakerPill.mute')
            "
            @click.stop="toggleMute"
          >
            <img
              :src="icons.mic"
              alt=""
              class="guild-vc-speaker-bar__glyph h-5 w-5"
            />
            <span class="guild-vc-speaker-bar__ctrl-label">{{
              muted
                ? echoT('b30.speakerPill.unmute')
                : echoT('b30.speakerPill.mute')
            }}</span>
          </button>
          <button
            type="button"
            class="guild-vc-speaker-bar__ctrl"
            :class="{ 'guild-vc-speaker-bar__ctrl--on': deafened }"
            :title="
              deafened
                ? echoT('b30.speakerPill.undeafen')
                : echoT('b30.speakerPill.deafen')
            "
            :aria-label="
              deafened
                ? echoT('b30.speakerPill.undeafen')
                : echoT('b30.speakerPill.deafen')
            "
            @click.stop="toggleDeafen"
          >
            <img
              :src="icons.headphones"
              alt=""
              class="guild-vc-speaker-bar__glyph h-5 w-5"
            />
            <span class="guild-vc-speaker-bar__ctrl-label">{{
              deafened
                ? echoT('b30.speakerPill.undeafen')
                : echoT('b30.speakerPill.deafen')
            }}</span>
          </button>
          <button
            type="button"
            class="guild-vc-speaker-bar__ctrl guild-vc-speaker-bar__ctrl--accent"
            :title="echoT('b30.speakerPill.openChannel')"
            :aria-label="echoT('b30.speakerPill.openChannel')"
            @click.stop="goToVoiceChannel"
          >
            <svg
              class="h-5 w-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
              <polyline points="10 17 15 12 10 7" />
              <line x1="15" y1="12" x2="3" y2="12" />
            </svg>
            <span class="guild-vc-speaker-bar__ctrl-label">{{
              echoT('b30.speakerPill.open')
            }}</span>
          </button>
          <button
            type="button"
            class="guild-vc-speaker-bar__ctrl guild-vc-speaker-bar__ctrl--danger"
            :title="echoT('b30.speakerPill.leaveVoice')"
            :aria-label="echoT('b30.speakerPill.leaveVoice')"
            @click.stop="leaveVoice"
          >
            <img
              :src="icons.logOut"
              alt=""
              class="guild-vc-speaker-bar__glyph h-5 w-5"
            />
            <span class="guild-vc-speaker-bar__ctrl-label">{{
              echoT('b30.speakerPill.leave')
            }}</span>
          </button>
        </div>
      </Transition>
    </div>
  </div>
</template>

<style
  scoped
  lang="scss"
  src="./styles/GuildVoiceFloatingSpeakerPill.scss"
></style>
