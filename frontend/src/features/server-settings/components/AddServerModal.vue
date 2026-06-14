<script setup lang="ts">
import { ref, watch, computed, unref, toRef, nextTick } from 'vue';
import { PUBLIC_INVITE_BASE } from '@/config';
import { icons } from '@/assets/icons';
import { iconEchoRounded } from '@/assets/branding';
import { useFocusTrap } from '@/composables/useFocusTrap';
import { useAddServerDiscordImportFlow } from '@/features/layout/composables/useAddServerDiscordImportFlow';
import PausedGifAvatar from '@/components/PausedGifAvatar.vue';
import { safeImageUrl } from '@/utils/safeImageUrl';
import { serverGuildIconDisplayUrl } from '@/utils/serverGuildIconDisplayUrl';

type DiscoverableServer = { id?: string; name: string; pfp: string };

type View = 'initial' | 'create' | 'join';

const props = withDefaults(
  defineProps<{
    modelValue: boolean;
    discoverableServers:
      | DiscoverableServer[]
      | import('vue').Ref<DiscoverableServer[]>;
    initialView?: 'initial' | 'create' | 'join';
    canImportDiscord?: boolean;
    /** Echo join-with-link error message from parent. */
    joinError?: string;
    /** Parent sets this while the server is being created or Discord import runs. */
    createBusy?: boolean;
    /** Parent sets this while invite or directory join is in flight. */
    joinBusy?: boolean;
    /** Prefill invite input when opening the join step (e.g. from Explore). */
    initialJoinInvite?: string;
  }>(),
  { joinError: '', createBusy: false, joinBusy: false, initialJoinInvite: '' },
);

const discoverableList = computed(() => unref(props.discoverableServers));

const MAX_SERVER_ICON_BYTES = 5 * 1024 * 1024;

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  'server-created': [
    payload: {
      name: string;
      importFromDiscord?: boolean;
      discordGuildId?: string;
      discordPostImportSyncAllChannels?: boolean;
      discordPostImportRecentMessages?: boolean;
      iconUrl?: string;
      iconFile?: File;
    },
  ];
  'join-discoverable': [payload: { id?: string; name: string; pfp: string }];
  'join-with-invite-link': [raw: string];
  'request-discord-link': [];
}>();

const view = ref<View>('initial');
const newServerName = ref('');
/** Object URL or legacy data URL for preview only. */
const newServerIconPreviewUrl = ref('');
const newServerIconFile = ref<File | null>(null);
const joinInviteRaw = ref('');
const discordPostImportSyncAllChannels = ref(false);
const discordPostImportRecentMessages = ref(false);

const joinInvitePlaceholder = computed(
  () => `${PUBLIC_INVITE_BASE.replace(/\/$/, '')}/your-server or your-server`,
);

function revokeServerIconPreview() {
  const u = newServerIconPreviewUrl.value;
  if (u.startsWith('blob:')) URL.revokeObjectURL(u);
  newServerIconPreviewUrl.value = '';
  newServerIconFile.value = null;
}

const {
  createUsesDiscordImport,
  discordImportPhase,
  importableGuilds,
  discordGuildsError,
  selectedImportGuild,
  guildsLoading,
  guildSearchQuery,
  botWaitTakingLong,
  discordInviteFlowBusy,
  importLeaveConfirmVisible,
  importLeaveDialogRef,
  discordBotWaitUiStep,
  filteredImportableGuilds,
  handleRequestClose,
  cancelImportLeaveConfirm,
  confirmLeaveDiscordImport,
  loadImportableGuilds,
  chooseDiscordImport,
  backDiscordImportStep,
  selectImportGuild,
  openDiscordForBotInstall,
  onLinkDiscordClick,
  clearImportLeaveConfirmOnParentClose,
  resetForModalOpen,
  resetDiscordImportWizard,
  setCreateUsesDiscordImport,
} = useAddServerDiscordImportFlow({
  modelValue: toRef(props, 'modelValue'),
  canImportDiscord: toRef(props, 'canImportDiscord'),
  view,
  newServerName,
  onRequestDiscordLink: () => emit('request-discord-link'),
  beforeChooseDiscordImport: revokeServerIconPreview,
  onBackFromCreateToInitial: () => {
    revokeServerIconPreview();
    view.value = 'initial';
  },
  emitModelValue: (v) => emit('update:modelValue', v),
});

function applyOpenStateFromProps() {
  const initial = props.initialView ?? 'initial';
  view.value = initial === 'create' || initial === 'join' ? initial : 'initial';
  newServerName.value = '';
  revokeServerIconPreview();
  joinInviteRaw.value = props.initialJoinInvite?.trim() ?? '';
  discordPostImportSyncAllChannels.value = false;
  discordPostImportRecentMessages.value = false;
  resetForModalOpen();
}

watch(
  () =>
    [
      props.modelValue,
      props.initialView ?? 'initial',
      props.initialJoinInvite ?? '',
    ] as const,
  ([open]) => {
    if (!open) return;
    applyOpenStateFromProps();
  },
  // Parent uses v-if; on first mount modelValue is already true, so a non-immediate watch would skip this.
  // Watch `initialView` / `initialJoinInvite` so entry points win over async mount / prop timing races.
  { immediate: true },
);

function performClose() {
  clearImportLeaveConfirmOnParentClose();
  emit('update:modelValue', false);
}

/** Overlay / close button: confirm before abandoning Discord import. */
function requestClose() {
  if (props.createBusy) return;
  handleRequestClose(performClose);
}

/** Used where close is intentional (initial/join, successful create). */
function close() {
  if (props.createBusy) return;
  performClose();
}

function goCreateFlow() {
  revokeServerIconPreview();
  view.value = 'create';
  setCreateUsesDiscordImport(false);
}

function backFromCreate() {
  revokeServerIconPreview();
  setCreateUsesDiscordImport(false);
  resetDiscordImportWizard();
  discordPostImportSyncAllChannels.value = false;
  discordPostImportRecentMessages.value = false;
  view.value = 'initial';
}

function onNewServerIconChange(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  if (!file.type.startsWith('image/')) return;
  if (file.size > MAX_SERVER_ICON_BYTES) return;
  revokeServerIconPreview();
  newServerIconFile.value = file;
  newServerIconPreviewUrl.value = URL.createObjectURL(file);
}

function submitCreate() {
  if (props.createBusy) return;
  const name = newServerName.value.trim() || 'My Server';
  if (createUsesDiscordImport.value) {
    if (discordImportPhase.value !== 'name_server') return;
    const gid = selectedImportGuild.value?.id?.trim();
    if (!gid) return;
    emit('server-created', {
      name,
      importFromDiscord: true,
      discordGuildId: gid,
      discordPostImportSyncAllChannels: discordPostImportSyncAllChannels.value,
      discordPostImportRecentMessages: discordPostImportRecentMessages.value,
    });
  } else {
    if (newServerIconFile.value) {
      emit('server-created', { name, iconFile: newServerIconFile.value });
    } else {
      emit('server-created', { name });
    }
  }
}

function submitJoinWithLink() {
  if (props.joinBusy) return;
  emit('join-with-invite-link', joinInviteRaw.value);
}

const modalRef = ref<HTMLElement | null>(null);
const joinInviteInputRef = ref<HTMLInputElement | null>(null);
const discordGuildSearchInputRef = ref<HTMLInputElement | null>(null);
const addServerNameDiscordInputRef = ref<HTMLInputElement | null>(null);
const addServerNameFreshInputRef = ref<HTMLInputElement | null>(null);
useFocusTrap(modalRef, toRef(props, 'modelValue'));

function focusPrimaryAddServerField() {
  if (!props.modelValue) return;
  if (props.createBusy && view.value === 'create') return;
  if (view.value === 'join') {
    joinInviteInputRef.value?.focus();
    return;
  }
  if (view.value !== 'create') return;
  if (
    createUsesDiscordImport.value &&
    discordImportPhase.value === 'pick_guild' &&
    importableGuilds.value.length > 0
  ) {
    discordGuildSearchInputRef.value?.focus();
    return;
  }
  if (
    createUsesDiscordImport.value &&
    discordImportPhase.value === 'name_server'
  ) {
    addServerNameDiscordInputRef.value?.focus();
    return;
  }
  if (!createUsesDiscordImport.value) {
    addServerNameFreshInputRef.value?.focus();
  }
}

watch(
  () =>
    [
      props.modelValue,
      view.value,
      createUsesDiscordImport.value,
      discordImportPhase.value,
      importableGuilds.value.length,
    ] as const,
  () => {
    if (!props.modelValue) return;
    void nextTick(() => focusPrimaryAddServerField());
  },
  { immediate: true },
);

const modalTitleId = computed(() => {
  switch (view.value) {
    case 'initial':
      return 'add-server-modal-title';
    case 'create':
      return 'add-server-create-title';
    case 'join':
      return 'add-server-join-title';
    default:
      return 'add-server-modal-title';
  }
});

const createModalTitle = computed(() => {
  if (!createUsesDiscordImport.value) return 'Customize your server';
  switch (discordImportPhase.value) {
    case 'loading':
      return 'Import from Discord';
    case 'need_link':
      return 'Connect Discord';
    case 'pick_guild':
      return 'Choose a server';
    case 'invite_bot':
      return 'Add the Echo bot';
    case 'waiting_bot':
      switch (discordBotWaitUiStep.value) {
        case 'need_bot':
          return 'Add the Echo bot';
        case 'exporting':
          return 'Exporting your server';
        case 'stuck_sync':
          return 'Still setting up';
        case 'connecting':
        default:
          return 'Setting up import';
      }
    case 'name_server':
    default:
      return 'Name your server';
  }
});

const createModalSubtitle = computed(() => {
  if (!createUsesDiscordImport.value) {
    return 'Choose a display name and optional icon. You can change everything later.';
  }
  switch (discordImportPhase.value) {
    case 'loading':
      return 'One moment…';
    case 'need_link':
      return 'Link your Discord account in Settings first.';
    case 'pick_guild':
      return 'Pick a server you manage in Discord.';
    case 'invite_bot':
      return 'We’ll open Discord in a new tab. Add Echo to this server, then return here.';
    case 'waiting_bot':
      switch (discordBotWaitUiStep.value) {
        case 'need_bot':
          return 'Open Discord, add Echo to this server, then keep this window open.';
        case 'exporting':
          return 'Echo is copying channels, roles, and members. Large servers can take a few minutes.';
        case 'stuck_sync':
          return 'We don’t see your import request yet. Go back and tap Open Discord again, or wait and we’ll retry.';
        case 'connecting':
        default:
          return 'Talking to Echo and checking your import status…';
      }
    case 'name_server':
    default:
      return 'You can change this later in server settings.';
  }
});

const createBusyStatusLine = computed(() => {
  if (createUsesDiscordImport.value) {
    return 'Importing channels, roles, and members from Discord. Large servers can take a few minutes.';
  }
  return 'Creating your server…';
});

function isUnknownDiscordGuildName(name: string | null | undefined): boolean {
  const normalized = (name ?? '').trim().toLowerCase();
  return (
    !normalized || normalized === 'unknown' || normalized === 'unknown server'
  );
}

function getDiscordGuildDisplayName(name: string | null | undefined): string {
  if (!isUnknownDiscordGuildName(name)) return (name ?? '').trim();
  return 'Unknown Discord server name';
}

const hasUnknownGuildNameInImportList = computed(() =>
  importableGuilds.value.some((g) => isUnknownDiscordGuildName(g.name)),
);

const selectedImportGuildDisplayName = computed(() =>
  getDiscordGuildDisplayName(selectedImportGuild.value?.name),
);

const discordBotWaitStatusLine = computed(() => {
  if (discordImportPhase.value !== 'waiting_bot') return '';
  const name = selectedImportGuildDisplayName.value || 'this server';
  switch (discordBotWaitUiStep.value) {
    case 'need_bot':
      return `Add the Echo bot to “${name}” in Discord if you haven’t already, then stay on this screen.`;
    case 'exporting':
      return 'The Echo bot is exporting your server layout. You can keep this tab open.';
    case 'stuck_sync':
      return 'Still syncing your request with Echo. Try the previous step again if this lasts more than a minute.';
    case 'connecting':
    default:
      return 'Connecting and registering your import with Echo…';
  }
});
</script>

<template>
  <Teleport to="body">
    <div
      v-if="modelValue"
      class="add-server-overlay fixed inset-0 z-[150] overflow-x-hidden overflow-y-auto px-4 py-6 sm:px-8 sm:py-12"
      @click.self="requestClose"
    >
      <div
        class="flex min-h-[100dvh] w-full items-center justify-center py-2 sm:py-4"
      >
        <div
          ref="modalRef"
          role="dialog"
          aria-modal="true"
          :aria-labelledby="modalTitleId"
          :aria-busy="createBusy && view === 'create'"
          class="add-server-panel relative my-auto w-full max-w-[32rem] max-h-[min(calc(100dvh-2rem),780px)] overflow-y-auto custom-scrollbar rounded-2xl px-6 py-8 text-foreground outline-none sm:max-w-[34rem] sm:px-12 sm:py-12"
        >
          <div class="add-server-accent" aria-hidden="true" />

          <div
            v-if="createBusy && view === 'create'"
            class="add-server-create-busy-overlay absolute inset-0 z-[60] flex flex-col items-center justify-center gap-4 rounded-2xl px-8 text-center"
            aria-live="polite"
            aria-atomic="true"
          >
            <div
              class="h-11 w-11 shrink-0 animate-spin rounded-full border-2 border-border border-t-[var(--accent)]"
              aria-hidden="true"
            />
            <p
              class="max-w-sm text-sm font-semibold leading-snug text-foreground"
            >
              {{ createBusyStatusLine }}
            </p>
          </div>

          <!-- Initial View -->
          <template v-if="view === 'initial'">
            <div class="flex items-start justify-between gap-6">
              <div class="min-w-0">
                <h2
                  id="add-server-modal-title"
                  class="text-[1.625rem] font-bold leading-snug tracking-tight text-foreground"
                >
                  Add a server
                </h2>
                <p class="mt-4 text-[0.9375rem] leading-relaxed text-fg-subtle">
                  Create a new home for your community or join one with a link.
                </p>
              </div>
              <button
                type="button"
                class="shrink-0 rounded-xl p-2 text-fg-subtle transition hover:bg-glass-hover hover:text-foreground"
                aria-label="Close"
                @click="close"
              >
                <svg
                  class="h-5 w-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>
            <div class="mt-10 flex flex-col gap-3">
              <button
                type="button"
                class="flex w-full items-center gap-5 rounded-xl bg-glass-2 p-5 text-left transition-colors hover:bg-glass-hover"
                @click="goCreateFlow"
              >
                <img
                  :src="icons.plus"
                  alt=""
                  class="h-10 w-10 shrink-0 filter invert opacity-90"
                />
                <div>
                  <div class="font-semibold text-foreground">Create My Own</div>
                  <div class="mt-0.5 text-sm leading-snug text-fg-subtle">
                    Set a name and optional icon. You can refine everything in
                    server settings.
                  </div>
                </div>
              </button>
              <button
                type="button"
                class="flex w-full items-center gap-5 rounded-xl bg-glass-2 p-5 text-left transition-colors hover:bg-glass-hover"
                @click="view = 'join'"
              >
                <img
                  :src="icons.logIn"
                  alt=""
                  class="h-10 w-10 shrink-0 filter invert opacity-90"
                />
                <div>
                  <div class="font-semibold text-foreground">Join a Server</div>
                  <div class="mt-0.5 text-sm leading-snug text-fg-subtle">
                    Browse discoverable servers or paste an invite.
                  </div>
                </div>
              </button>
            </div>
          </template>

          <!-- Create Server View -->
          <template v-else-if="view === 'create'">
            <div class="flex items-start justify-between gap-6">
              <div class="min-w-0">
                <h2
                  id="add-server-create-title"
                  class="text-[1.625rem] font-bold leading-snug tracking-tight text-foreground"
                >
                  {{ createModalTitle }}
                </h2>
                <p class="mt-4 text-[0.9375rem] leading-relaxed text-fg-subtle">
                  {{ createModalSubtitle }}
                </p>
              </div>
              <button
                type="button"
                class="shrink-0 rounded-xl p-2 text-fg-subtle transition hover:bg-glass-hover hover:text-foreground disabled:pointer-events-none disabled:opacity-35"
                aria-label="Close"
                :disabled="createBusy"
                @click="requestClose"
              >
                <svg
                  class="h-5 w-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>

            <p
              v-if="joinError"
              class="mt-4 text-sm leading-relaxed text-amber-200/90"
            >
              {{ joinError }}
            </p>

            <div class="mt-10 space-y-8">
              <!-- Discord import wizard -->
              <template v-if="createUsesDiscordImport && canImportDiscord">
                <div
                  v-if="discordImportPhase === 'loading'"
                  class="py-8 text-center text-sm text-fg-soft"
                >
                  {{ guildsLoading ? 'Loading servers…' : '…' }}
                </div>

                <div
                  v-else-if="discordImportPhase === 'need_link'"
                  class="space-y-4"
                >
                  <p
                    v-if="discordGuildsError"
                    class="text-sm leading-relaxed text-amber-200/90"
                  >
                    {{ discordGuildsError }}
                  </p>
                  <p class="text-sm leading-relaxed text-fg-soft">
                    Use the button below, then tap refresh.
                  </p>
                  <div class="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                    <button
                      type="button"
                      class="add-server-primary-btn rounded-xl px-6 py-3 text-sm font-semibold"
                      @click="onLinkDiscordClick"
                    >
                      Open Settings
                    </button>
                    <button
                      type="button"
                      class="add-server-discord-btn rounded-xl px-6 py-3 text-sm font-semibold"
                      :disabled="guildsLoading"
                      @click="loadImportableGuilds"
                    >
                      Refresh
                    </button>
                  </div>
                </div>

                <div
                  v-else-if="discordImportPhase === 'pick_guild'"
                  class="space-y-3"
                >
                  <p
                    v-if="discordGuildsError"
                    class="text-sm leading-relaxed text-amber-200/90"
                  >
                    {{ discordGuildsError }}
                  </p>
                  <p
                    v-if="hasUnknownGuildNameInImportList"
                    class="text-sm leading-relaxed text-amber-200/90"
                  >
                    Some Discord servers were returned without a readable name.
                    This usually means your Discord token is stale or missing
                    scope. Try Refresh, then reconnect Discord in Settings if it
                    persists.
                  </p>
                  <div v-if="importableGuilds.length > 0" class="space-y-2">
                    <label
                      for="add-server-discord-guild-search"
                      class="add-server-label"
                      >Search servers</label
                    >
                    <input
                      id="add-server-discord-guild-search"
                      ref="discordGuildSearchInputRef"
                      v-model="guildSearchQuery"
                      type="search"
                      class="add-server-input"
                      placeholder="Filter by name…"
                      autocomplete="off"
                      enterkeyhint="search"
                    />
                  </div>
                  <div
                    class="custom-scrollbar max-h-[min(26rem,calc(100dvh-14rem))] space-y-2 overflow-y-auto pr-1"
                    role="listbox"
                    :aria-label="
                      importableGuilds.length > 0
                        ? 'Servers you can import'
                        : 'No servers to import'
                    "
                  >
                    <p
                      v-if="
                        importableGuilds.length > 0 &&
                        filteredImportableGuilds.length === 0
                      "
                      class="py-6 text-center text-sm text-fg-subtle"
                    >
                      No servers match your search.
                    </p>
                    <button
                      v-for="g in filteredImportableGuilds"
                      :key="g.id"
                      type="button"
                      class="flex w-full items-center gap-3 rounded-xl bg-glass-2 px-4 py-3.5 text-left transition-colors hover:bg-glass-hover"
                      @click="selectImportGuild(g)"
                    >
                      <img
                        v-if="g.iconUrl"
                        :src="g.iconUrl"
                        alt=""
                        class="h-10 w-10 shrink-0 rounded-full object-cover"
                      />
                      <div
                        v-else
                        class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-glass-2 text-sm font-semibold text-fg-soft"
                      >
                        {{ (g.name || '?').charAt(0).toUpperCase() }}
                      </div>
                      <span
                        class="min-w-0 truncate font-semibold text-foreground"
                        >{{ getDiscordGuildDisplayName(g.name) }}</span
                      >
                    </button>
                  </div>
                </div>

                <div
                  v-else-if="discordImportPhase === 'invite_bot'"
                  class="space-y-5"
                >
                  <div
                    class="flex items-center gap-3 rounded-xl bg-glass-2 px-4 py-3"
                  >
                    <img
                      v-if="selectedImportGuild?.iconUrl"
                      :src="selectedImportGuild.iconUrl"
                      alt=""
                      class="h-11 w-11 shrink-0 rounded-full object-cover"
                    />
                    <div class="min-w-0">
                      <p
                        class="text-xs font-semibold uppercase tracking-wider text-fg-subtle"
                      >
                        Server
                      </p>
                      <p class="truncate font-semibold text-foreground">
                        {{ selectedImportGuildDisplayName }}
                      </p>
                    </div>
                  </div>
                  <p
                    v-if="discordGuildsError"
                    class="text-sm leading-relaxed text-amber-200/90"
                  >
                    {{ discordGuildsError }}
                  </p>
                  <p
                    v-if="!selectedImportGuild?.botInviteUrl"
                    class="text-sm text-amber-200/90"
                  >
                    Discord import isn’t set up on this Echo host yet.
                  </p>
                  <div class="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                    <button
                      type="button"
                      class="add-server-primary-btn rounded-xl px-6 py-3 text-sm font-semibold disabled:opacity-40"
                      :disabled="
                        !selectedImportGuild?.botInviteUrl ||
                        discordInviteFlowBusy
                      "
                      @click="openDiscordForBotInstall"
                    >
                      {{ discordInviteFlowBusy ? 'Checking…' : 'Open Discord' }}
                    </button>
                  </div>
                </div>

                <div
                  v-else-if="discordImportPhase === 'waiting_bot'"
                  class="space-y-5"
                >
                  <div
                    class="flex flex-col items-center gap-4 py-1 text-center"
                  >
                    <div
                      class="h-10 w-10 shrink-0 animate-spin rounded-full border-2 border-border border-t-[var(--accent)]"
                      aria-hidden="true"
                    />
                    <p class="max-w-md text-sm leading-relaxed text-fg-soft">
                      {{ discordBotWaitStatusLine }}
                    </p>
                    <p
                      v-if="
                        botWaitTakingLong &&
                        discordBotWaitUiStep === 'exporting'
                      "
                      class="max-w-md text-sm leading-relaxed text-amber-200/90"
                    >
                      Large servers can take several minutes — nothing is wrong
                      if it’s slow.
                    </p>
                    <p
                      v-else-if="
                        botWaitTakingLong &&
                        discordBotWaitUiStep !== 'exporting'
                      "
                      class="max-w-md text-sm leading-relaxed text-amber-200/90"
                    >
                      If nothing changes, go back and open Discord again, or
                      confirm the Echo bot is in your server.
                    </p>
                  </div>
                </div>

                <div v-else-if="discordImportPhase === 'name_server'">
                  <label for="add-server-name" class="add-server-label"
                    >Server name</label
                  >
                  <input
                    id="add-server-name"
                    ref="addServerNameDiscordInputRef"
                    v-model="newServerName"
                    type="text"
                    class="add-server-input mt-3"
                    placeholder="My Server"
                    autocomplete="organization"
                    @keydown.enter.prevent="submitCreate"
                  />
                  <div
                    class="mt-6 space-y-3 rounded-xl bg-scrim-1 p-4 text-left ring-1 ring-white/8"
                  >
                    <div
                      class="text-xs font-semibold uppercase tracking-[0.14em] text-fg-subtle"
                    >
                      After import
                    </div>
                    <label
                      class="flex cursor-pointer items-start gap-3 text-sm leading-snug text-fg-soft"
                    >
                      <input
                        v-model="discordPostImportSyncAllChannels"
                        type="checkbox"
                        class="mt-0.5 shrink-0 rounded border-border"
                        :disabled="createBusy"
                      />
                      <span>
                        <span class="font-medium text-fg"
                          >Sync all channels</span
                        >
                        — turn on the Discord ↔ Echo message bridge for every
                        imported text and forum channel, and enable the voice
                        mirror for every imported voice room (including stage
                        channels).
                      </span>
                    </label>
                    <label
                      class="flex cursor-pointer items-start gap-3 text-sm leading-snug text-fg-soft"
                    >
                      <input
                        v-model="discordPostImportRecentMessages"
                        type="checkbox"
                        class="mt-0.5 shrink-0 rounded border-border"
                        :disabled="createBusy"
                      />
                      <span>
                        <span class="font-medium text-fg"
                          >Import the last 90 messages</span
                        >
                        into each empty text or forum channel. Runs one channel
                        at a time with pauses to stay kind to Discord rate
                        limits.
                      </span>
                    </label>
                  </div>
                </div>
              </template>

              <!-- Normal create (no Discord import) -->
              <template v-else>
                <div
                  class="add-server-icon-row flex items-center justify-between gap-6"
                >
                  <div class="min-w-0 flex-1 text-left">
                    <p class="add-server-label">Server icon (optional)</p>
                    <p class="mt-3 text-sm leading-relaxed text-fg-subtle">
                      Tap the circle to upload PNG or JPG (max 5&nbsp;MB).
                    </p>
                    <button
                      v-if="newServerIconPreviewUrl"
                      type="button"
                      class="add-server-link-btn mt-3 text-sm font-semibold"
                      @click="revokeServerIconPreview"
                    >
                      Remove icon
                    </button>
                  </div>
                  <label
                    class="add-server-icon-drop group shrink-0 cursor-pointer"
                  >
                    <input
                      type="file"
                      accept="image/*"
                      class="sr-only"
                      @change="onNewServerIconChange"
                    />
                    <span class="sr-only">Upload server icon</span>
                    <span class="add-server-icon-drop__frame">
                      <img
                        :src="newServerIconPreviewUrl || iconEchoRounded"
                        alt=""
                        class="add-server-icon-drop__blur"
                        :class="{
                          'add-server-icon-drop__blur--echo':
                            !newServerIconPreviewUrl,
                          'add-server-icon-drop__blur--preview':
                            !!newServerIconPreviewUrl,
                        }"
                        aria-hidden="true"
                      />
                      <span
                        v-if="!newServerIconPreviewUrl"
                        class="add-server-icon-drop__veil"
                        aria-hidden="true"
                      />
                      <img
                        v-if="!newServerIconPreviewUrl"
                        :src="icons.imageGallery"
                        alt=""
                        class="add-server-icon-drop__glyph"
                      />
                    </span>
                  </label>
                </div>

                <div>
                  <label for="add-server-name-fresh" class="add-server-label"
                    >Server name</label
                  >
                  <input
                    id="add-server-name-fresh"
                    ref="addServerNameFreshInputRef"
                    v-model="newServerName"
                    type="text"
                    class="add-server-input mt-3"
                    placeholder="Adel's Server"
                    autocomplete="organization"
                    @keydown.enter.prevent="submitCreate"
                  />
                </div>
              </template>
            </div>

            <div
              class="add-server-footer-actions mt-12 flex flex-col-reverse gap-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <button
                v-if="
                  createUsesDiscordImport &&
                  canImportDiscord &&
                  discordImportPhase !== 'name_server'
                "
                type="button"
                class="add-server-back-btn text-sm font-semibold disabled:pointer-events-none disabled:opacity-35"
                :disabled="createBusy"
                @click="backDiscordImportStep"
              >
                Back
              </button>
              <button
                v-else
                type="button"
                class="add-server-back-btn text-sm font-semibold disabled:pointer-events-none disabled:opacity-35"
                :disabled="createBusy"
                @click="backFromCreate"
              >
                Back
              </button>
              <div
                class="flex w-full flex-col gap-3 sm:ml-auto sm:w-auto sm:flex-row sm:flex-nowrap sm:items-center sm:justify-end"
              >
                <button
                  v-if="canImportDiscord && !createUsesDiscordImport"
                  type="button"
                  class="add-server-discord-btn rounded-xl px-6 py-3.5 text-sm font-semibold disabled:pointer-events-none disabled:opacity-35"
                  :disabled="createBusy"
                  @click="chooseDiscordImport"
                >
                  Import from Discord
                </button>
                <button
                  v-if="
                    !createUsesDiscordImport ||
                    (createUsesDiscordImport &&
                      discordImportPhase === 'name_server')
                  "
                  type="button"
                  class="add-server-primary-btn rounded-xl px-7 py-3.5 text-sm font-semibold disabled:pointer-events-none disabled:opacity-35"
                  :disabled="createBusy"
                  @click="submitCreate"
                >
                  {{
                    createBusy
                      ? createUsesDiscordImport
                        ? 'Importing…'
                        : 'Creating…'
                      : createUsesDiscordImport
                        ? 'Create and import'
                        : 'Create'
                  }}
                </button>
              </div>
            </div>
          </template>

          <!-- Join Server View -->
          <template v-else-if="view === 'join'">
            <div class="flex items-start justify-between gap-6">
              <div class="min-w-0">
                <h2
                  id="add-server-join-title"
                  class="text-[1.625rem] font-bold leading-snug tracking-tight text-foreground"
                >
                  Join a server
                </h2>
                <p class="mt-4 text-[0.9375rem] leading-relaxed text-fg-subtle">
                  Pick a public server or use an invite link.
                </p>
              </div>
              <button
                type="button"
                class="shrink-0 rounded-xl p-2 text-fg-subtle transition hover:bg-glass-hover hover:text-foreground"
                aria-label="Close"
                @click="close"
              >
                <svg
                  class="h-5 w-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>

            <p
              v-if="joinError"
              role="alert"
              class="add-server-join-error mt-6 text-sm leading-snug"
            >
              {{ joinError }}
            </p>

            <div class="mt-10 space-y-8">
              <div
                class="flex max-h-64 flex-col gap-2.5 overflow-y-auto pr-1 custom-scrollbar"
              >
                <div
                  v-for="server in discoverableList"
                  :key="server.name"
                  class="flex items-center justify-between gap-4 rounded-xl bg-glass-2 px-4 py-3.5 transition-colors hover:bg-glass-hover"
                >
                  <div class="flex min-w-0 items-center gap-3.5">
                    <div
                      class="relative h-10 w-10 shrink-0 overflow-hidden rounded-full"
                    >
                      <PausedGifAvatar
                        :src="serverGuildIconDisplayUrl(server.pfp)"
                        :alt="server.name"
                        :session-key="server.id ?? server.name"
                        img-class="rounded-full object-cover"
                      />
                    </div>
                    <span class="truncate font-semibold text-foreground">{{
                      server.name
                    }}</span>
                  </div>
                  <button
                    type="button"
                    class="add-server-join-row-btn shrink-0 rounded-xl px-4 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-glass-hover disabled:pointer-events-none disabled:opacity-40"
                    :disabled="joinBusy"
                    @click="emit('join-discoverable', server)"
                  >
                    {{ joinBusy ? 'Joining…' : 'Join' }}
                  </button>
                </div>
              </div>

              <p
                class="text-center text-xs font-semibold uppercase tracking-wide text-fg-subtle"
              >
                Or invite link
              </p>

              <div>
                <label for="invite-link" class="add-server-label"
                  >Invite link</label
                >
                <input
                  id="invite-link"
                  ref="joinInviteInputRef"
                  v-model="joinInviteRaw"
                  type="text"
                  class="add-server-input mt-3"
                  :placeholder="joinInvitePlaceholder"
                  @keydown.enter.prevent="submitJoinWithLink"
                />
              </div>
            </div>

            <div
              class="add-server-footer-actions mt-12 flex flex-col-reverse gap-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <button
                type="button"
                class="add-server-back-btn text-sm font-semibold"
                @click="view = 'initial'"
              >
                Back
              </button>
              <button
                type="button"
                class="add-server-primary-btn w-full rounded-xl px-7 py-3.5 text-sm font-semibold disabled:pointer-events-none disabled:opacity-40 sm:w-auto"
                :disabled="joinBusy"
                :aria-busy="joinBusy"
                @click="submitJoinWithLink"
              >
                {{ joinBusy ? 'Joining…' : 'Join Server' }}
              </button>
            </div>
          </template>
        </div>
      </div>

      <div
        v-if="importLeaveConfirmVisible"
        class="add-server-import-leave-backdrop fixed inset-0 z-[160] flex items-center justify-center px-5"
        role="presentation"
        @click.self="cancelImportLeaveConfirm"
      >
        <div
          ref="importLeaveDialogRef"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="add-server-import-leave-title"
          tabindex="-1"
          class="add-server-import-leave-dialog w-full max-w-[22rem] rounded-2xl px-6 py-6 text-left shadow-xl outline-none sm:max-w-[24rem]"
          @click.stop
          @keydown.escape.prevent="cancelImportLeaveConfirm"
        >
          <h3
            id="add-server-import-leave-title"
            class="text-lg font-bold leading-snug tracking-tight text-foreground"
          >
            Leave Discord import?
          </h3>
          <p class="mt-3 text-sm leading-relaxed text-fg-soft">
            You’ll exit the import wizard. A bot export may still finish on the
            server; to resume in the UI, start Import from Discord again.
          </p>
          <div
            class="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"
          >
            <button
              type="button"
              class="add-server-back-btn rounded-lg px-4 py-2.5 text-sm font-semibold sm:min-w-[5.5rem]"
              @click="cancelImportLeaveConfirm"
            >
              Stay
            </button>
            <button
              type="button"
              class="add-server-primary-btn rounded-xl px-5 py-2.5 text-sm font-semibold sm:min-w-[5.5rem]"
              @click="confirmLeaveDiscordImport"
            >
              Leave
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped lang="scss">
/* Match LoginRegisterModal liquid glass — flat, borderless */
.add-server-overlay {
  background: var(--vue-auto-165);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
}

.add-server-import-leave-backdrop {
  background: var(--overlay-dim);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
}

.add-server-import-leave-dialog {
  background: linear-gradient(
    165deg,
    var(--vue-auto-166) 0%,
    var(--vue-auto-167) 55%,
    var(--vue-auto-168) 100%
  );
  box-shadow: 0 24px 48px var(--vue-auto-181);
  border: 1px solid var(--glass-border);
}

.add-server-create-busy-overlay {
  background: color-mix(in srgb, black 42%, transparent);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
}

.add-server-panel {
  position: relative;
  overflow: hidden;
  background: linear-gradient(
    165deg,
    var(--vue-auto-166) 0%,
    var(--vue-auto-167) 55%,
    var(--vue-auto-168) 100%
  );
  border: none;
  box-shadow: none;
}

.add-server-accent {
  position: absolute;
  left: 0;
  right: 0;
  top: 0;
  height: 3px;
  background: linear-gradient(
    90deg,
    var(--vue-auto-081),
    var(--vue-auto-169),
    var(--vue-auto-170)
  );
  opacity: 0.95;
}

.add-server-label {
  display: block;
  font-size: 0.9375rem;
  font-weight: 600;
  color: var(--vue-auto-049);
  letter-spacing: 0.01em;
}

.add-server-input {
  display: block;
  width: 100%;
  border-radius: 12px;
  border: none;
  background: var(--vue-auto-046);
  padding: 0.95rem 1.2rem;
  font-size: 1rem;
  color: var(--vue-auto-006);
  outline: none;
  transition: box-shadow 0.18s ease;

  &::placeholder {
    color: var(--vue-auto-073);
  }

  &:focus {
    box-shadow: 0 0 0 2px var(--vue-auto-174);
  }
}

.add-server-icon-row {
  @media (max-width: 380px) {
    flex-direction: column;
    align-items: stretch;

    .add-server-icon-drop {
      align-self: flex-end;
    }
  }
}

.add-server-icon-drop {
  &:focus-within .add-server-icon-drop__frame {
    box-shadow: 0 0 0 2px var(--vue-auto-174);
  }

  &:hover .add-server-icon-drop__veil {
    background: var(--overlay-subtle);
  }
}

/* Circle clip + contain: paint so blurred img cannot paint a square halo outside the disc */
.add-server-icon-drop__frame {
  position: relative;
  display: block;
  width: 6.25rem;
  height: 6.25rem;
  border-radius: 50%;
  overflow: hidden;
  clip-path: circle(50% at 50% 50%);
  isolation: isolate;
  contain: paint;
  box-shadow: 0 0 0 2px var(--glass-border);
  transition: box-shadow 0.18s ease;
}

.add-server-icon-drop__blur {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 145%;
  height: 145%;
  transform: translate(-50%, -50%);
  object-fit: cover;
  filter: blur(12px);
  border-radius: 50%;
  clip-path: circle(50% at 50% 50%);
}

/* Default Echo mark: push wash toward accent indigo so it matches modal chrome */
.add-server-icon-drop__blur--echo {
  filter: blur(12px) sepia(0.55) saturate(2.4) hue-rotate(200deg)
    brightness(0.82) contrast(1.08);
}

/* User-uploaded icon: sharp fill, no blur (veil + gallery glyph hidden in template). */
.add-server-icon-drop__blur--preview {
  left: 0;
  top: 0;
  width: 100%;
  height: 100%;
  transform: none;
  filter: none;
  border-radius: 0;
  clip-path: none;
  object-fit: cover;
}

.add-server-icon-drop__veil {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  /* No backdrop-filter — it composites as a rectangle behind the circle and reads as a square */
  background: var(--overlay-dim);
  transition: background-color 0.15s ease;
}

.add-server-icon-drop__glyph {
  position: absolute;
  left: 50%;
  top: 50%;
  z-index: 1;
  width: 2rem;
  height: 2rem;
  transform: translate(-50%, -50%);
  pointer-events: none;
  filter: invert(1);
  opacity: 0.92;
}

.add-server-link-btn {
  border: none;
  background: none;
  padding: 0;
  font: inherit;
  color: var(--vue-auto-171);
  cursor: pointer;
  text-align: left;
  border-radius: 4px;
  transition: color 0.15s ease;

  &:hover {
    color: var(--vue-auto-172);
    text-decoration: underline;
    text-underline-offset: 3px;
  }

  &:focus-visible {
    outline: 2px solid var(--vue-auto-173);
    outline-offset: 2px;
  }
}

.add-server-back-btn {
  color: var(--vue-auto-028);
  background: none;
  border: none;
  padding: 0.25rem 0;
  cursor: pointer;
  transition: color 0.15s ease;

  &:hover {
    color: var(--text);
  }

  &:focus-visible {
    outline: 2px solid var(--vue-auto-173);
    outline-offset: 2px;
    border-radius: 4px;
  }
}

.add-server-footer-actions {
  margin-top: 0.25rem;
  padding-top: 1.75rem;
}

.add-server-primary-btn {
  border: none;
  cursor: pointer;
  color: var(--vue-auto-006);
  background: linear-gradient(
    180deg,
    var(--vue-auto-179) 0%,
    var(--vue-auto-180) 100%
  );
  box-shadow: 0 4px 16px var(--vue-auto-181);
  transition:
    filter 0.15s ease,
    transform 0.1s ease;

  &:hover {
    filter: brightness(1.06);
  }

  &:active {
    transform: translateY(0.5px);
  }

  &:focus-visible {
    outline: 2px solid var(--vue-auto-173);
    outline-offset: 2px;
  }
}

/* Secondary action: outline only — Create keeps the solid gradient primary */
.add-server-discord-btn {
  border: 2px solid var(--accent);
  cursor: pointer;
  background: transparent;
  color: var(--accent);
  box-shadow: none;
  transition:
    background-color 0.15s ease,
    color 0.15s ease,
    border-color 0.15s ease;

  &:hover {
    background: var(--chat-accent-muted);
    color: var(--text);
  }

  &:focus-visible {
    outline: 2px solid var(--vue-auto-173);
    outline-offset: 2px;
  }
}

.add-server-join-row-btn {
  border: none;
  cursor: pointer;
  background: var(--vc-ctrl-bg);

  &:focus-visible {
    outline: 2px solid var(--vue-auto-173);
    outline-offset: 2px;
  }
}

.add-server-join-error {
  color: var(--srv-role-danger-fg);
}
</style>
