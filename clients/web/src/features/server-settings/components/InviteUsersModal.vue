<script setup lang="ts">
import { ref, watch, computed, toRef } from 'vue';
import { echoT } from '@/i18n';
import { useFocusTrap } from '@/features/layout/useFocusTrap';
import { useAutofocusOnOpen } from '@/features/layout/useAutofocusOnOpen';
import { PUBLIC_INVITE_BASE } from '@/config';
import PausedGifAvatar from '@/components/PausedGifAvatar.vue';
import { safeImageUrl } from '@/features/layout/display/safeImageUrl';
import { copyToClipboard } from '@/features/chat/copyToClipboard';
import { dispatchAppToast } from '@/features/layout/failures/controllerMissingAction';
import { extractInviteTokenFromUserInput } from '@/features/chat/inviteLinkParse';
import { useEchoInvitePreview } from '@/features/chat/useEchoInvitePreview';

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

/** How long the "Copied!" affordance stays lit after a successful copy. */
const COPY_FEEDBACK_RESET_MS = 2000;

async function copyLink() {
  const ok = await copyToClipboard(props.inviteLink);
  if (ok) {
    copied.value = true;
    setTimeout(() => (copied.value = false), COPY_FEEDBACK_RESET_MS);
  } else {
    dispatchAppToast(echoT('b13.invite.copyLinkFailed'), 'warning');
  }
}

async function copyDirectInviteLink() {
  const link = (props.directInviteLink ?? '').trim();
  if (!link) return;
  const ok = await copyToClipboard(link);
  if (ok) {
    directCopied.value = true;
    setTimeout(() => (directCopied.value = false), COPY_FEEDBACK_RESET_MS);
  } else {
    dispatchAppToast(echoT('b13.invite.copyDirectFailed'), 'warning');
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
  () =>
    preview.value?.name?.trim() ||
    props.serverName.trim() ||
    echoT('b13.invite.thisServer'),
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
  isVoiceInvite.value
    ? echoT('b13.invite.titleVoice')
    : echoT('b13.invite.titlePeople'),
);

const modalSubtitle = computed(() =>
  isVoiceInvite.value
    ? voiceChannelName.value
      ? echoT('b13.invite.subtitleVoiceChannel', {
          channel: voiceChannelName.value,
          server: resolvedServerName.value,
        })
      : echoT('b13.invite.subtitleVoiceLink', {
          server: resolvedServerName.value,
        })
    : echoT('b13.invite.subtitleFriends', { server: resolvedServerName.value }),
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
      <button
        type="button"
        class="invite-modal-close chat-focus-ring absolute right-4 top-4 z-10 flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-glass-hover hover:text-foreground"
        :aria-label="echoT('b13.invite.close')"
        @click="close"
      >
        <svg
          class="h-4 w-4"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
      </button>

      <header class="shrink-0 px-8 text-center">
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
          <span class="invite-section-label">{{
            echoT('b13.invite.friends')
          }}</span>
          <span class="text-xs text-muted">
            {{
              echoT(
                filteredFriendsList.length === 1
                  ? 'b13.invite.friendCountOne'
                  : 'b13.invite.friendCountMany',
                { count: filteredFriendsList.length },
              )
            }}
          </span>
        </div>

        <label class="sr-only" for="invite-friend-search">{{
          echoT('b13.invite.searchFriends')
        }}</label>
        <input
          id="invite-friend-search"
          v-model="friendSearchQuery"
          type="search"
          autocomplete="off"
          :placeholder="echoT('b13.invite.searchFriends')"
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
              {{
                invitedUserIds.has(friend.id)
                  ? echoT('b13.invite.invited')
                  : echoT('b13.invite.invite')
              }}
            </button>
          </div>
          <p
            v-if="filteredFriendsList.length === 0"
            class="invite-empty-search rounded-xl border border-border bg-elevated px-4 py-4 text-center text-sm text-muted"
          >
            {{ echoT('b13.invite.noFriendsMatch') }}
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
          {{ echoT('b13.invite.orSendLink') }}
        </span>
        <div class="h-px flex-1 bg-border" />
      </div>

      <section class="shrink-0" :class="hasFriendsSection ? '' : 'mt-5'">
        <label for="invite-link-input" class="invite-section-label block">
          {{ echoT('b13.invite.inviteLink') }}
        </label>
        <p
          v-if="inviteLinkLookupPending"
          class="invite-link-status mt-3 rounded-xl border border-border bg-elevated px-4 py-3.5 text-sm leading-relaxed text-muted"
        >
          {{ echoT('b13.invite.loadingLink') }}
        </p>
        <i18n-t
          v-else-if="inviteJoinBlocked"
          keypath="b13.invite.joinBlocked"
          tag="p"
          scope="global"
          class="invite-link-status mt-3 rounded-xl border border-border bg-elevated px-4 py-3.5 text-sm leading-relaxed text-foreground"
        >
          <template #path>
            <span class="font-semibold">{{
              echoT('b13.invite.pathAccess')
            }}</span>
          </template>
        </i18n-t>
        <i18n-t
          v-else-if="showInviteLinkUnavailable"
          keypath="b13.invite.noPublicUrl"
          tag="p"
          scope="global"
          class="invite-link-status mt-3 rounded-xl border border-border bg-elevated px-4 py-3.5 text-sm leading-relaxed text-foreground"
        >
          <template #vanity>
            <span class="font-semibold">{{
              echoT('b13.invite.vanityUrl')
            }}</span>
          </template>
          <template #path>
            <span class="font-semibold">{{
              echoT('b13.invite.pathOverview')
            }}</span>
          </template>
          <template #url>
            <span class="whitespace-nowrap font-mono text-sm text-muted">{{
              `${PUBLIC_INVITE_BASE.replace(/^https?:\/\//, '')}/your-server`
            }}</span>
          </template>
        </i18n-t>
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
            {{ copied ? echoT('b13.invite.copied') : echoT('b13.invite.copy') }}
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
            <span class="invite-section-label block">{{
              echoT('b13.invite.directInvite')
            }}</span>
            <p class="mt-1 text-xs leading-snug text-muted">
              {{ echoT('b13.invite.directHint') }}
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
                ? echoT('b13.invite.creating')
                : (directInviteLink ?? '').trim()
                  ? echoT('b13.invite.regenerate')
                  : echoT('b13.invite.createLink')
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
            :aria-label="echoT('b13.invite.directLinkAria')"
            class="invite-input invite-link-field chat-focus-ring min-h-[36px] min-w-0 flex-1 rounded-md border border-border bg-surface px-3 py-1.5 font-mono text-xs text-foreground outline-none"
          />
          <button
            type="button"
            class="invite-copy-btn chat-focus-ring shrink-0 rounded-md border border-border bg-glass-2 px-4 py-1.5 text-sm font-semibold text-foreground transition-colors hover:bg-glass-hover sm:min-w-[4.5rem]"
            @click="copyDirectInviteLink"
          >
            {{
              directCopied
                ? echoT('b13.invite.copied')
                : echoT('b13.invite.copy')
            }}
          </button>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped lang="scss" src="./styles/InviteUsersModal.scss"></style>

<style>
html[data-theme='light'] .invite-friend-btn--invited {
  color: var(--echo-palette-rgb-5-150-105-c06a);
  background: color-mix(
    in srgb,
    var(--echo-palette-rgb-16-185-129-eeb0) 12%,
    var(--elevated)
  );
  border-color: color-mix(
    in srgb,
    var(--echo-palette-rgb-16-185-129-eeb0) 28%,
    var(--border)
  );
}
</style>
