<script setup lang="ts">
import { ref, watch, computed, toRef } from 'vue';
import { useFocusTrap } from '@/composables/useFocusTrap';
import { useAutofocusOnOpen } from '@/composables/useAutofocusOnOpen';
import { PUBLIC_INVITE_BASE } from '@/config';
import PausedGifAvatar from '@/components/PausedGifAvatar.vue';
import { safeImageUrl } from '@/utils/safeImageUrl';
import { copyToClipboard } from '@/utils/copyToClipboard';
import { dispatchAppToast } from '@/utils/controllerMissingAction';
import { extractInviteTokenFromUserInput } from '@/utils/inviteLinkParse';
import { useEchoInvitePreview } from '@/features/chat/composables/useEchoInvitePreview';

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
    /** Server uses application gate for joins. */
    applicationsEnabled?: boolean;
    /** When false, invite links cannot add new members (Server Settings → Access). */
    inviteJoinLinksEnabled?: boolean;
    /** User may create a hex invite that skips the application gate. */
    canCreateDirectInvite?: boolean;
    /** Populated after user requests a direct (skips application) invite. */
    directInviteLink?: string;
    directInviteBusy?: boolean;
    friends?: { id: string; name: string; pfp: string }[];
  }>(),
  {
    inviteLinkLookupPending: false,
    inviteVoiceChannelId: null,
    inviteVoiceChannelName: null,
    applicationsEnabled: false,
    inviteJoinLinksEnabled: true,
    canCreateDirectInvite: false,
    directInviteLink: '',
    directInviteBusy: false,
  },
);

const friendsList = computed(() => props.friends ?? []);

const hasInviteLink = computed(() => props.inviteLink.trim().length > 0);
const inviteJoinBlocked = computed(
  () => props.inviteJoinLinksEnabled === false,
);
const showInviteLinkUnavailable = computed(
  () =>
    !props.inviteLinkLookupPending &&
    !inviteJoinBlocked.value &&
    !hasInviteLink.value,
);

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  /** UserId and optional voice channel info for voice invites */
  invite: [
    userId: string,
    voiceChannelId?: string | null,
    voiceChannelName?: string | null,
  ];
  'create-direct-invite': [];
}>();

const invitedUserIds = ref<Set<string>>(new Set());
const copied = ref(false);
const directCopied = ref(false);
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
      directCopied.value = false;
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

async function copyDirectInviteLink() {
  const link = (props.directInviteLink ?? '').trim();
  if (!link) return;
  const ok = await copyToClipboard(link);
  if (ok) {
    directCopied.value = true;
    setTimeout(() => (directCopied.value = false), 2000);
  } else {
    dispatchAppToast(
      'Could not copy link. Copy it manually or check clipboard permission.',
      'warning',
    );
  }
}

function requestDirectInvite() {
  emit('create-direct-invite');
}

const previewToken = computed(() =>
  extractInviteTokenFromUserInput(props.inviteLink),
);

const voiceIdForPreview = computed(
  () => (props.inviteVoiceChannelId ?? '').trim() || null,
);

const { preview } = useEchoInvitePreview(previewToken, voiceIdForPreview);

const resolvedServerName = computed(
  () => preview.value?.name?.trim() || props.serverName.trim() || 'this server',
);

const voiceChannelName = computed(() => {
  const fromPreview = preview.value?.voiceChannel?.name?.trim();
  if (fromPreview) return fromPreview;
  const fromProp = (props.inviteVoiceChannelName ?? '').trim();
  if (fromProp) return fromProp;
  return null;
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
    ? voiceChannelName.value
      ? `Invite friends to ${voiceChannelName.value} in ${resolvedServerName.value}.`
      : `Share a link so people can join ${resolvedServerName.value} in this voice channel.`
    : `Invite friends to ${resolvedServerName.value}.`,
);

const hasFriendsSection = computed(() => friendsList.value.length > 0);

const showDirectInviteSection = computed(
  () =>
    props.applicationsEnabled &&
    props.canCreateDirectInvite &&
    props.serverName.trim().length > 0,
);
</script>

<template>
  <div
    v-if="modelValue"
    class="fixed inset-0 z-50 flex items-center justify-center modal-overlay-bg px-4 py-6"
    @click.self="close"
  >
    <div
      ref="modalRef"
      role="dialog"
      aria-modal="true"
      aria-labelledby="invite-modal-title"
      class="invite-users-modal real-glass-modal custom-scrollbar relative flex w-full max-w-xl flex-col overflow-y-auto overscroll-contain rounded-2xl p-5 text-foreground max-h-[min(92dvh,calc(100dvh-3rem))] sm:p-6"
      @click.stop
    >
      <header class="shrink-0 text-center">
        <h2 id="invite-modal-title" class="text-xl font-bold tracking-tight">
          {{ modalTitle }}
        </h2>
        <p class="mt-1.5 text-sm leading-snug text-muted">
          {{ modalSubtitle }}
        </p>
      </header>

      <section
        v-if="hasFriendsSection"
        class="mt-5 flex min-h-0 flex-1 flex-col"
      >
        <div class="mb-2 flex items-center justify-between gap-3">
          <span class="invite-section-label">Friends</span>
          <span class="text-xs text-muted">
            {{ filteredFriendsList.length }}
            {{ filteredFriendsList.length === 1 ? 'friend' : 'friends' }}
          </span>
        </div>

        <label class="sr-only" for="invite-friend-search">Search friends</label>
        <input
          id="invite-friend-search"
          v-model="friendSearchQuery"
          type="search"
          autocomplete="off"
          placeholder="Search friends"
          class="invite-input chat-focus-ring min-h-[40px] w-full rounded-lg border border-border bg-elevated px-3 py-2 text-sm text-foreground outline-none transition-colors placeholder:text-fg-subtle focus:border-[color-mix(in_srgb,var(--accent)_45%,var(--border))]"
        />

        <div
          class="custom-scrollbar invite-friends-list mt-2 min-h-[10rem] max-h-[min(40vh,18rem)] flex-1 space-y-1 overflow-y-auto overscroll-contain sm:max-h-[min(48vh,24rem)]"
          v-scrollbar-on-scroll
        >
          <div
            v-for="friend in filteredFriendsList"
            :key="friend.id"
            class="invite-friend-row flex items-center justify-between gap-2 rounded-lg border border-transparent bg-glass-1 px-3 py-2"
          >
            <div class="flex min-w-0 items-center gap-3">
              <div
                class="relative h-9 w-9 shrink-0 overflow-hidden rounded-full"
              >
                <PausedGifAvatar
                  :src="safeImageUrl(friend.pfp)"
                  :alt="friend.name"
                  :session-key="friend.id"
                  img-class="rounded-full object-cover"
                />
              </div>
              <span class="truncate text-sm font-semibold text-foreground">{{
                friend.name
              }}</span>
            </div>
            <button
              type="button"
              class="invite-friend-btn chat-focus-ring shrink-0 rounded-md px-3 py-1.5 text-sm font-semibold transition-colors disabled:cursor-default"
              :class="
                invitedUserIds.has(friend.id)
                  ? 'invite-friend-btn--invited'
                  : 'invite-friend-btn--default'
              "
              :disabled="invitedUserIds.has(friend.id)"
              @click="inviteFriend(friend.id)"
            >
              {{ invitedUserIds.has(friend.id) ? 'Invited' : 'Invite' }}
            </button>
          </div>
          <p
            v-if="filteredFriendsList.length === 0"
            class="invite-empty-search rounded-xl border border-border bg-elevated px-4 py-4 text-center text-sm text-muted"
          >
            No friends match your search.
          </p>
        </div>
      </section>

      <div
        v-if="hasFriendsSection"
        class="invite-section-divider my-5 flex shrink-0 items-center gap-3"
      >
        <div class="h-px flex-1 bg-border" />
        <span
          class="shrink-0 text-xs font-semibold uppercase tracking-wider text-muted"
        >
          or send an invite link
        </span>
        <div class="h-px flex-1 bg-border" />
      </div>

      <section class="shrink-0" :class="hasFriendsSection ? '' : 'mt-5'">
        <label for="invite-link-input" class="invite-section-label block">
          Invite link
        </label>
        <p
          v-if="inviteLinkLookupPending"
          class="invite-link-status mt-3 rounded-xl border border-border bg-elevated px-4 py-3.5 text-sm leading-relaxed text-muted"
        >
          Loading invite link…
        </p>
        <p
          v-else-if="inviteJoinBlocked"
          class="invite-link-status mt-3 rounded-xl border border-border bg-elevated px-4 py-3.5 text-sm leading-relaxed text-foreground"
        >
          This server is not accepting new members through invite links. A
          server admin can open joins again under
          <span class="font-semibold">Server Settings → Access</span>.
        </p>
        <p
          v-else-if="showInviteLinkUnavailable"
          class="invite-link-status mt-3 rounded-xl border border-border bg-elevated px-4 py-3.5 text-sm leading-relaxed text-foreground"
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
        <div
          v-else
          class="mt-3 flex flex-col gap-2 sm:flex-row sm:items-stretch"
        >
          <input
            id="invite-link-input"
            ref="inviteLinkInputRef"
            :value="inviteLink"
            type="text"
            readonly
            class="invite-input invite-link-field chat-focus-ring min-h-[44px] min-w-0 flex-1 rounded-lg border border-border bg-elevated px-3.5 py-2.5 text-sm text-foreground outline-none"
          />
          <button
            type="button"
            class="invite-copy-btn chat-focus-ring shrink-0 rounded-lg border border-border bg-glass-2 px-5 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-glass-hover sm:min-w-[5.5rem]"
            @click="copyLink"
          >
            {{ copied ? 'Copied!' : 'Copy' }}
          </button>
        </div>
      </section>

      <section
        v-if="showDirectInviteSection"
        class="invite-direct-section mt-5 shrink-0"
      >
        <div
          class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
        >
          <div class="min-w-0">
            <span class="invite-section-label block">Direct invite</span>
            <p class="mt-1 text-xs leading-snug text-muted">
              One-time link — skips the application form.
            </p>
          </div>
          <button
            type="button"
            class="invite-direct-btn chat-focus-ring shrink-0 rounded-md border border-border bg-glass-2 px-3 py-1.5 text-sm font-semibold text-foreground transition-colors hover:bg-glass-hover disabled:cursor-wait disabled:opacity-70"
            :disabled="directInviteBusy"
            @click="requestDirectInvite"
          >
            {{
              directInviteBusy
                ? 'Creating…'
                : (directInviteLink ?? '').trim()
                  ? 'Regenerate'
                  : 'Create link'
            }}
          </button>
        </div>
        <div
          v-if="(directInviteLink ?? '').trim()"
          class="mt-2 flex flex-col gap-1.5 sm:flex-row sm:items-stretch"
        >
          <input
            :value="directInviteLink"
            type="text"
            readonly
            aria-label="Direct invite link"
            class="invite-input invite-link-field chat-focus-ring min-h-[36px] min-w-0 flex-1 rounded-md border border-border bg-surface px-3 py-1.5 font-mono text-xs text-foreground outline-none"
          />
          <button
            type="button"
            class="invite-copy-btn chat-focus-ring shrink-0 rounded-md border border-border bg-glass-2 px-4 py-1.5 text-sm font-semibold text-foreground transition-colors hover:bg-glass-hover sm:min-w-[4.5rem]"
            @click="copyDirectInviteLink"
          >
            {{ directCopied ? 'Copied!' : 'Copy' }}
          </button>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped lang="scss">
.modal-overlay-bg {
  background-color: var(--vue-auto-011);
  backdrop-filter: blur(12px) saturate(1.05);
  -webkit-backdrop-filter: blur(12px) saturate(1.05);
}

.real-glass-modal {
  background: var(--echo-modal-bg);
  border: 1px solid var(--border);
  box-shadow: var(--shadow-3);
  backdrop-filter: blur(24px) saturate(1.2);
  -webkit-backdrop-filter: blur(24px) saturate(1.2);
}

.invite-section-label {
  display: block;
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--muted);
}

.invite-friend-btn--default {
  color: var(--text);
  background: var(--surface);
  border: 1px solid var(--border);
}

.invite-friend-btn--default:hover:not(:disabled) {
  background: var(--elevated);
}

.invite-friend-btn--invited {
  color: color-mix(in srgb, rgb(110 231 183) 90%, var(--text));
  background: color-mix(in srgb, rgb(16 185 129) 24%, transparent);
  border: 1px solid color-mix(in srgb, rgb(16 185 129) 36%, var(--border));
}
</style>

<style>
html[data-theme='light'] .invite-friend-btn--invited {
  color: rgb(5 150 105);
  background: color-mix(in srgb, rgb(16 185 129) 12%, var(--elevated));
  border-color: color-mix(in srgb, rgb(16 185 129) 28%, var(--border));
}
</style>
