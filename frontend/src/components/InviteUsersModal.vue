<script setup lang="ts">
import { ref, watch, computed, toRef, withDefaults } from 'vue';
import { useFocusTrap } from '@/composables/useFocusTrap';
import { useAutofocusOnOpen } from '@/composables/useAutofocusOnOpen';
import { PUBLIC_INVITE_BASE } from '@/config';
import PausedGifAvatar from '@/components/PausedGifAvatar.vue';
import { safeImageUrl } from '@/utils/safeImageUrl';
import { copyToClipboard } from '@/utils/copyToClipboard';
import { dispatchAppToast } from '@/utils/controllerMissingAction';
import { extractInviteTokenFromUserInput } from '@/utils/inviteLinkParse';
import { useEchoInvitePreview } from '@/features/chat/composables/useEchoInvitePreview';
import { icons } from '@/assets/icons';

const props = withDefaults(
  defineProps<{
    modelValue: boolean;
    serverName: string;
    /** Same URL shown in the modal and sent in DM invite messages. */
    inviteLink: string;
    /** Resolving vanity from API when it was missing from the local workspace snapshot. */
    inviteLinkLookupPending?: boolean;
    inviteVoiceChannelId?: string | null;
    inviteVoiceChannelName?: string | null;
    friends?: { id: string; name: string; pfp: string }[];
  }>(),
  {
    inviteLinkLookupPending: false,
    inviteVoiceChannelId: null,
    inviteVoiceChannelName: null,
  },
);

const friendsList = computed(() => props.friends ?? []);

const hasInviteLink = computed(() => props.inviteLink.trim().length > 0);
const showInviteLinkUnavailable = computed(
  () => !props.inviteLinkLookupPending && !hasInviteLink.value,
);

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  /** UserId and optional voice channel info for voice invites */
  invite: [
    userId: string,
    voiceChannelId?: string | null,
    voiceChannelName?: string | null,
  ];
}>();

const invitedUserIds = ref<Set<string>>(new Set());
const copied = ref(false);
const friendSearchQuery = ref('');

const filteredFriendsList = computed(() => {
  const q = friendSearchQuery.value.trim().toLowerCase();
  if (!q) return friendsList.value;
  return friendsList.value.filter((friend) =>
    friend.name.toLowerCase().includes(q),
  );
});

watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      copied.value = false;
      invitedUserIds.value = new Set();
      friendSearchQuery.value = '';
    }
  },
);

function close() {
  emit('update:modelValue', false);
}

const modalRef = ref<HTMLElement | null>(null);
const inviteLinkInputRef = ref<HTMLInputElement | null>(null);
useFocusTrap(modalRef, toRef(props, 'modelValue'));

const inviteLinkFieldReady = computed(
  () =>
    props.modelValue && !props.inviteLinkLookupPending && hasInviteLink.value,
);

useAutofocusOnOpen(toRef(props, 'modelValue'), inviteLinkInputRef, {
  when: inviteLinkFieldReady,
});

function inviteFriend(userId: string) {
  emit(
    'invite',
    userId,
    props.inviteVoiceChannelId,
    props.inviteVoiceChannelName,
  );
  invitedUserIds.value = new Set([...invitedUserIds.value, userId]);
}

async function copyLink() {
  const ok = await copyToClipboard(props.inviteLink);
  if (ok) {
    copied.value = true;
    setTimeout(() => (copied.value = false), 2000);
  } else {
    dispatchAppToast(
      'Could not copy invite link. Copy it manually or check clipboard permission.',
      'warning',
    );
  }
}

const previewToken = computed(() =>
  extractInviteTokenFromUserInput(props.inviteLink),
);

const voiceIdForPreview = computed(
  () => (props.inviteVoiceChannelId ?? '').trim() || null,
);

const { preview, loading: previewLoading } = useEchoInvitePreview(
  previewToken,
  voiceIdForPreview,
);

const resolvedServerName = computed(
  () => preview.value?.name?.trim() || props.serverName.trim() || 'this server',
);

const voiceInviteLabel = computed(() => {
  const fromPreview = preview.value?.voiceChannel?.name?.trim();
  if (fromPreview) return fromPreview;
  const fromProp = (props.inviteVoiceChannelName ?? '').trim();
  if (fromProp) return fromProp;
  return 'Voice channel';
});

const isVoiceInvite = computed(
  () =>
    !!(props.inviteVoiceChannelId ?? '').trim() ||
    !!preview.value?.voiceChannel?.id,
);

const modalTitle = computed(() =>
  isVoiceInvite.value ? 'Invite to voice' : 'Invite people',
);

const modalSubtitle = computed(() =>
  isVoiceInvite.value
    ? `Share a link so people can join ${resolvedServerName.value} in this voice channel.`
    : `Invite friends to ${resolvedServerName.value}.`,
);
</script>

<template>
  <div
    v-if="modelValue"
    class="fixed inset-0 z-50 flex items-center justify-center modal-overlay-bg"
    @click.self="close"
  >
    <div
      ref="modalRef"
      role="dialog"
      aria-modal="true"
      aria-labelledby="invite-modal-title"
      class="real-glass-modal relative w-full max-w-lg rounded-xl p-6 text-foreground bg-transparent"
    >
      <h2 id="invite-modal-title" class="text-center text-2xl font-bold">
        {{ modalTitle }}
      </h2>
      <p class="mt-1.5 text-center text-sm text-muted">
        {{ modalSubtitle }}
      </p>

      <div
        v-if="isVoiceInvite"
        class="mt-6 rounded-xl border border-indigo-400/25 bg-indigo-500/[0.12] p-4"
        :class="{ 'opacity-90': previewLoading }"
      >
        <div class="flex gap-3">
          <div
            class="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-scrim-2"
          >
            <img
              :src="icons.headphones"
              alt=""
              class="h-6 w-6 opacity-90 filter invert"
            />
          </div>
          <div class="min-w-0 flex-1">
            <p
              class="text-[11px] font-semibold uppercase tracking-wider text-indigo-200/90"
            >
              Voice invite
            </p>
            <p class="mt-1 truncate text-base font-semibold text-foreground">
              {{ voiceInviteLabel }}
            </p>
            <p class="mt-0.5 truncate text-sm text-muted">
              in {{ resolvedServerName }}
            </p>
          </div>
        </div>
      </div>

      <div
        v-if="friendsList.length > 0"
        class="custom-scrollbar mt-6 flex max-h-52 flex-col gap-2 overflow-y-auto"
        v-scrollbar-on-scroll
      >
        <label class="sr-only" for="invite-friend-search">Search friends</label>
        <input
          id="invite-friend-search"
          v-model="friendSearchQuery"
          type="text"
          placeholder="Search friends"
          class="mb-1 min-h-[40px] w-full rounded-lg border border-border bg-glass-1 px-3 py-2 text-sm text-foreground outline-none transition-colors placeholder:text-fg-subtle focus:border-[color-mix(in_srgb,var(--accent)_45%,var(--border))]"
        />
        <div
          v-for="friend in filteredFriendsList"
          :key="friend.id"
          class="flex items-center justify-between rounded-lg bg-glass-1 px-3 py-2.5"
        >
          <div class="flex items-center gap-3 min-w-0">
            <div class="relative h-9 w-9 shrink-0 overflow-hidden rounded-full">
              <PausedGifAvatar
                :src="safeImageUrl(friend.pfp)"
                :alt="friend.name"
                :session-key="friend.id"
                img-class="rounded-full object-cover"
              />
            </div>
            <span class="text-sm font-semibold truncate">{{
              friend.name
            }}</span>
          </div>
          <button
            type="button"
            class="shrink-0 rounded-md px-4 py-1.5 text-sm font-semibold text-foreground transition-colors disabled:cursor-default"
            :class="
              invitedUserIds.has(friend.id)
                ? 'bg-emerald-500/30 text-emerald-100'
                : 'bg-glass-2 hover:bg-glass-hover'
            "
            :disabled="invitedUserIds.has(friend.id)"
            @click="inviteFriend(friend.id)"
          >
            {{ invitedUserIds.has(friend.id) ? 'Invited' : 'Invite' }}
          </button>
        </div>
        <p
          v-if="filteredFriendsList.length === 0"
          class="rounded-lg border border-border bg-glass-1 px-3 py-3 text-sm text-muted"
        >
          No friends match your search.
        </p>
      </div>
      <div v-if="friendsList.length > 0" class="my-4 flex items-center gap-3">
        <div class="h-px flex-1 bg-glass-active"></div>
        <span
          class="shrink-0 text-xs font-semibold uppercase tracking-wider text-muted"
        >
          or send an invite link
        </span>
        <div class="h-px flex-1 bg-glass-active"></div>
      </div>
      <div class="mt-6">
        <label
          for="invite-link-input"
          class="block text-xs font-semibold uppercase tracking-wider text-muted"
        >
          Invite Link
        </label>
        <p
          v-if="inviteLinkLookupPending"
          class="mt-2 rounded-lg border border-border bg-overlay-subtle px-3 py-2.5 text-sm leading-relaxed text-muted"
        >
          Loading invite link…
        </p>
        <p
          v-else-if="showInviteLinkUnavailable"
          class="mt-2 rounded-lg border border-border bg-overlay-subtle px-3 py-2.5 text-sm leading-relaxed text-foreground"
        >
          This server does not have a public invite URL yet. An owner or
          moderator can set a
          <span class="font-semibold">vanity URL</span> under
          <span class="font-semibold">Server Settings → Overview</span>. People
          join at
          <span class="whitespace-nowrap font-mono text-sm text-muted">{{
            `${PUBLIC_INVITE_BASE.replace(/^https?:\/\//, '')}/your-server`
          }}</span
          >.
        </p>
        <div v-else class="mt-2 flex items-stretch gap-2">
          <input
            id="invite-link-input"
            ref="inviteLinkInputRef"
            :value="inviteLink"
            type="text"
            readonly
            class="min-h-[40px] w-full rounded-lg border border-border bg-elevated px-3 py-2.5 text-sm text-foreground outline-none"
          />
          <button
            type="button"
            class="shrink-0 rounded-md bg-glass-2 px-5 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-glass-hover"
            @click="copyLink"
          >
            {{ copied ? 'Copied!' : 'Copy' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.modal-overlay-bg {
  background-color: var(--vue-auto-011);
  backdrop-filter: blur(2px);
  -webkit-backdrop-filter: blur(2px);
}

.real-glass-modal {
  box-shadow: 0px 4px 60px var(--vue-auto-013);
  &::before {
    content: '';
    position: absolute;
    inset: 0;
    z-index: -1;
    border-radius: inherit;
    background-color: var(--vue-auto-015);
    -webkit-backdrop-filter: blur(8px);
    backdrop-filter: blur(8px);
  }
}
</style>
