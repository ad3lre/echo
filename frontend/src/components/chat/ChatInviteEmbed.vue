<script setup lang="ts">
import { computed, inject, onUnmounted, ref } from 'vue';
import { iconEchoRounded } from '@/assets/branding';
import { useEchoInvitePreview } from '@/features/chat/composables/useEchoInvitePreview';
import {
  extractInviteTokenFromUserInput,
  extractVoiceChannelIdFromInviteUserInput,
} from '@/utils/inviteLinkParse';
import { safeImageUrl } from '@/utils/safeImageUrl';
import { serverGuildIconDisplayUrl } from '@/utils/serverGuildIconDisplayUrl';

type JoinEchoInviteFn = (
  raw: string,
) => Promise<
  | { ok: true; serverId: string; alreadyMember: boolean }
  | { ok: false; error: string; needsAuth?: boolean }
>;

const props = defineProps<{
  href: string;
}>();

const joinEchoServerWithInvite = inject<JoinEchoInviteFn | undefined>(
  'joinEchoServerWithInvite',
  undefined,
);

const token = computed(() => extractInviteTokenFromUserInput(props.href));

const voiceChannelIdForPreview = computed(() =>
  extractVoiceChannelIdFromInviteUserInput(props.href),
);

const joinBusy = ref(false);
const joinHint = ref<{
  kind: 'ok' | 'redundant' | 'error';
  text: string;
} | null>(null);
let joinHintTimer: ReturnType<typeof setTimeout> | null = null;

function clearJoinHintTimer() {
  if (joinHintTimer != null) {
    clearTimeout(joinHintTimer);
    joinHintTimer = null;
  }
}

onUnmounted(() => clearJoinHintTimer());

async function onJoinClick() {
  joinHint.value = null;
  clearJoinHintTimer();

  if (!joinEchoServerWithInvite) {
    joinHint.value = {
      kind: 'error',
      text: 'In-app join is unavailable in this view.',
    };
    joinHintTimer = setTimeout(() => {
      joinHint.value = null;
      joinHintTimer = null;
    }, 5000);
    return;
  }

  joinBusy.value = true;
  try {
    const r = await joinEchoServerWithInvite(props.href);
    if (!r.ok) {
      joinHint.value = { kind: 'error', text: r.error };
      return;
    }
    if (r.alreadyMember) {
      joinHint.value = {
        kind: 'redundant',
        text: 'Redundant join — you’re already a member of this server. Opened it for you.',
      };
    } else {
      joinHint.value = { kind: 'ok', text: 'Joined the server.' };
    }
    joinHintTimer = setTimeout(() => {
      joinHint.value = null;
      joinHintTimer = null;
    }, 6000);
  } finally {
    joinBusy.value = false;
  }
}

const { preview, loading: previewLoading } = useEchoInvitePreview(
  token,
  voiceChannelIdForPreview,
);

const isVoiceInvite = computed(
  () => !!voiceChannelIdForPreview.value || !!preview.value?.voiceChannel?.id,
);

const voiceChannelLabel = computed(() => {
  const n = preview.value?.voiceChannel?.name?.trim();
  if (n) return n;
  return 'Voice channel';
});

const serverName = computed(() => preview.value?.name?.trim() ?? '');

const displayName = computed(() => serverName.value || 'Server');

const iconSrc = computed(() =>
  safeImageUrl(serverGuildIconDisplayUrl(preview.value?.iconUrl)),
);

/** Full-width top banner: server banner, else icon as fill (Explore-style). */
const bannerImageUrl = computed(() => {
  const b = preview.value?.bannerUrl?.trim();
  if (b) return safeImageUrl(b);
  const displayIcon = serverGuildIconDisplayUrl(preview.value?.iconUrl);
  if (displayIcon !== iconEchoRounded) return safeImageUrl(displayIcon);
  return '';
});

const memberLine = computed(() => {
  const n = preview.value?.memberCount;
  if (n == null || n < 1) return '';
  return `${n.toLocaleString()} member${n === 1 ? '' : 's'}`;
});

/** Second line under server name (compact “in …” / stats). */
const infoSubline = computed(() => {
  if (isVoiceInvite.value) {
    const bits = [voiceChannelLabel.value];
    if (memberLine.value) bits.push(memberLine.value);
    bits.push('Echo');
    return bits.join(' · ');
  }
  if (memberLine.value) return `${memberLine.value} · Echo`;
  const d = preview.value?.description?.trim();
  if (d) return d.length > 72 ? `${d.slice(0, 69)}…` : d;
  return 'Echo';
});
</script>

<template>
  <article
    class="invite-embed"
    :class="{ 'invite-embed--loading': previewLoading }"
    :aria-busy="previewLoading"
    aria-label="Server invite"
  >
    <!-- compact: wide image header -->
    <div class="invite-embed__banner">
      <div
        v-if="bannerImageUrl"
        class="invite-embed__banner-media"
        :style="{ backgroundImage: `url(${bannerImageUrl})` }"
      />
      <div v-else class="invite-embed__banner-fallback" aria-hidden="true">
        <img
          :src="iconEchoRounded"
          alt=""
          class="invite-embed__banner-fallback-icon"
        />
      </div>
      <!-- Light wash from banner into the lower panel -->
      <div class="invite-embed__banner-bleed" aria-hidden="true" />
    </div>

    <div class="invite-embed__lower">
      <div class="invite-embed__lower-seam" aria-hidden="true" />

      <p class="invite-embed__subtitle">
        {{
          isVoiceInvite
            ? 'You’re invited to join a voice channel'
            : 'You’re invited to join a server'
        }}
      </p>

      <div class="invite-embed__widget">
        <img
          :src="iconSrc"
          :alt="`${displayName} icon`"
          class="invite-embed__guild-icon"
        />
        <div class="invite-embed__info">
          <div class="invite-embed__guild-name">
            {{ displayName }}
          </div>
          <div class="invite-embed__guild-meta">
            {{ infoSubline }}
          </div>
        </div>
        <button
          type="button"
          class="invite-embed__join"
          :disabled="joinBusy"
          :title="joinEchoServerWithInvite ? 'Join this server in Echo' : href"
          @click="onJoinClick"
        >
          <span class="invite-embed__join-label">{{
            joinBusy ? 'Joining…' : 'Join Server'
          }}</span>
        </button>
      </div>
    </div>

    <span v-if="token" class="sr-only">Invite: {{ token }}</span>
  </article>
</template>

<style scoped lang="scss">
.invite-embed {
  max-width: min(100%, 432px);
  overflow: hidden;
  border-radius: 14px;
  border: none;
  background: transparent;
  box-shadow: 0 18px 48px var(--vue-auto-065);
}

.invite-embed--loading {
  opacity: 0.9;
}

.invite-embed__banner {
  position: relative;
  height: 7.5rem;
  overflow: hidden;
  background: var(--vue-auto-066);
}

.invite-embed__banner-media {
  height: 100%;
  width: 100%;
  background-size: cover;
  background-position: center;
  transition: transform 0.35s ease;
}

.invite-embed:hover .invite-embed__banner-media {
  transform: scale(1.02);
}

.invite-embed__banner-fallback {
  display: flex;
  height: 100%;
  width: 100%;
  align-items: center;
  justify-content: center;
  background:
    radial-gradient(
      ellipse 80% 80% at 50% 20%,
      var(--vue-auto-106),
      transparent 55%
    ),
    linear-gradient(180deg, var(--vue-auto-107) 0%, var(--vue-auto-066) 100%);
}

.invite-embed__banner-fallback-icon {
  height: 4rem;
  width: 4rem;
  object-fit: contain;
  opacity: 0.35;
}

/* Soft light spill from banner imagery into the panel below */
.invite-embed__banner-bleed {
  pointer-events: none;
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 3.25rem;
  background: linear-gradient(
    180deg,
    var(--vue-auto-021) 0%,
    var(--vue-auto-008) 55%,
    var(--vue-auto-014) 100%
  );
  mix-blend-mode: soft-light;
  opacity: 0.85;
}

.invite-embed__lower {
  position: relative;
  padding-bottom: 0.25rem;
  border-radius: 0 0 14px 14px;
  background:
    radial-gradient(
      ellipse 95% 70% at 50% -30%,
      var(--vue-auto-108),
      transparent 55%
    ),
    radial-gradient(
      ellipse 80% 50% at 100% 100%,
      var(--vue-auto-109),
      transparent 45%
    ),
    linear-gradient(
      168deg,
      var(--vue-auto-110) 0%,
      var(--vue-auto-111) 48%,
      var(--vue-auto-112) 100%
    );
  backdrop-filter: blur(22px);
  -webkit-backdrop-filter: blur(22px);
  box-shadow:
    inset 0 1px 0 var(--vue-auto-002),
    inset 0 -1px 0 var(--vue-auto-018);
}

/* Thin luminous seam: banner light easing into the liquid block */
.invite-embed__lower-seam {
  pointer-events: none;
  position: absolute;
  left: 0;
  right: 0;
  top: 0;
  height: 1px;
  background: linear-gradient(
    90deg,
    transparent 0%,
    var(--vue-auto-032) 22%,
    var(--vue-auto-067) 50%,
    var(--vue-auto-032) 78%,
    transparent 100%
  );
  opacity: 0.9;
}

.invite-embed__lower-seam::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  top: 1px;
  height: 2.25rem;
  background: linear-gradient(180deg, var(--vue-auto-003) 0%, transparent 100%);
  opacity: 0.35;
}

.invite-embed__subtitle {
  position: relative;
  z-index: 1;
  margin: 0;
  padding: 0.7rem 1rem 0.45rem;
  font-size: 0.875rem;
  line-height: 1.35;
  font-weight: 500;
  color: var(--vue-auto-113);
}

.invite-embed__widget {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0 1rem 1rem;
  min-width: 0;
}

.invite-embed__guild-icon {
  flex-shrink: 0;
  width: auto;
  height: 3rem;
  max-width: 5.5rem;
  border-radius: 10px;
  object-fit: contain;
  background: var(--vue-auto-018);
  box-shadow: 0 6px 16px var(--vue-auto-018);
}

.invite-embed__info {
  flex: 1;
  min-width: 0;
}

.invite-embed__guild-name {
  font-size: 1rem;
  font-weight: 600;
  line-height: 1.25;
  color: var(--vue-auto-114);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.invite-embed__guild-meta {
  margin-top: 0.125rem;
  font-size: 0.75rem;
  line-height: 1.35;
  font-weight: 500;
  color: var(--vue-auto-115);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.invite-embed__join-col {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 0.35rem;
  max-width: 11rem;
}

.invite-embed__join {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0.5rem 1.2rem;
  border-radius: 6px;
  font-family: inherit;
  font-size: 0.8125rem;
  font-weight: 600;
  line-height: 1.2;
  letter-spacing: 0.02em;
  color: var(--vue-auto-006);
  cursor: pointer;
  border: none;
  background: var(--vue-auto-116);
  box-shadow: none;
  transition:
    background-color 0.15s ease,
    color 0.15s ease,
    opacity 0.15s ease;
}

.invite-embed__join:hover:not(:disabled) {
  background: var(--vue-auto-117);
}

.invite-embed__join:active:not(:disabled) {
  background: var(--vue-auto-118);
}

.invite-embed__join:disabled {
  cursor: wait;
  opacity: 0.75;
}

.invite-embed__join:focus-visible {
  outline: none;
  box-shadow:
    0 0 0 2px var(--vue-auto-119),
    0 0 0 4px var(--vue-auto-032);
}

.invite-embed__hint {
  margin: 0;
  max-width: 11rem;
  text-align: right;
  font-size: 0.6875rem;
  line-height: 1.35;
  font-weight: 500;
}

.invite-embed__hint--ok {
  color: var(--vue-auto-120);
}

.invite-embed__hint--redundant {
  color: var(--vue-auto-121);
}

.invite-embed__hint--error {
  color: var(--vue-auto-068);
}

@media (max-width: 360px) {
  .invite-embed__widget {
    flex-wrap: wrap;
  }

  .invite-embed__join-col {
    align-items: stretch;
    max-width: none;
    width: 100%;
    margin-top: 0.25rem;
  }

  .invite-embed__join {
    width: 100%;
  }

  .invite-embed__hint {
    max-width: none;
    text-align: left;
  }
}

@media (prefers-reduced-motion: reduce) {
  .invite-embed__banner-media {
    transition: none;
  }

  .invite-embed:hover .invite-embed__banner-media {
    transform: none;
  }

  .invite-embed__join {
    transition: none;
  }
}
</style>
