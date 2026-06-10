<script setup lang="ts">
import { computed, ref, toRef, watch } from 'vue';
import { collectExploreQuickFilters } from '@/services/domain/exploreDirectoryRows';
import { storeToRefs } from 'pinia';
import { useFocusTrap } from '@/composables/useFocusTrap';
import { useCompactShell } from '@/composables/useCompactShell';
import { useCompactSettingsModalGestures } from '@/composables/useCompactSettingsModalGestures';
import { useAuthSessionStore } from '@/stores/authSession';
import { isEchoGraphId as isEchoGraphIdLocal } from '@/utils/echoIds';
import { useEchoWorkspace } from '@/composables/useEchoWorkspace';
import type { ServerSettingsSection } from '@/features/server-settings/types';
import { useRolePreview } from '@/features/server-settings/composables/useRolePreview';
import {
  useServerSettingsAudit,
  type AuditTabFilter,
  type AuditTimeFilter,
} from '@/features/server-settings/composables/useServerSettingsAudit';
import { useServerSettingsEmoji } from '@/features/server-settings/composables/useServerSettingsEmoji';
import { useServerSettingsEchoAuditBans } from '@/features/server-settings/composables/useServerSettingsEchoAuditBans';
import { useServerSettingsRoles } from '@/features/server-settings/composables/useServerSettingsRoles';
import { useServerSettingsOverviewState } from '@/features/server-settings/composables/useServerSettingsOverviewState';
import { useServerSettingsDangerZone } from '@/features/server-settings/composables/useServerSettingsDangerZone';
import {
  useServerSettingsNavigation,
  useServerSettingsRolePreview,
} from '@/features/server-settings/composables/useServerSettingsNavigation';
import { useServerSettingsVisibility } from '@/features/server-settings/composables/useServerSettingsVisibility';
import { useServerSettingsModalLayout } from '@/features/server-settings/composables/useServerSettingsModalLayout';
import { fetchManagedRolesFromEcho } from '@/services/orchestration/fetchManagedRolesFromEcho';

import ServerSettingsSidebar from '@/features/server-settings/components/ServerSettingsSidebar.vue';
import ServerSettingsHeader from '@/features/server-settings/components/ServerSettingsHeader.vue';
import ServerSettingsOverviewSection from '@/features/server-settings/components/ServerSettingsOverviewSection.vue';
import ServerSettingsRolesSection from '@/features/server-settings/components/ServerSettingsRolesSection.vue';
import ServerSettingsEmojiSection from '@/features/server-settings/components/ServerSettingsEmojiSection.vue';
import ServerSettingsSecuritySection from '@/features/server-settings/components/ServerSettingsSecuritySection.vue';
import ServerSettingsAccessSection from '@/features/server-settings/components/ServerSettingsAccessSection.vue';
import ServerSettingsTicketsSection from '@/features/server-settings/components/ServerSettingsTicketsSection.vue';
import ServerSettingsSelfRolesSection from '@/features/server-settings/components/ServerSettingsSelfRolesSection.vue';
import ServerSettingsModerationSection from '@/features/server-settings/components/ServerSettingsModerationSection.vue';
import BannedWordsPanel from '@/features/server-settings/components/banned-words/BannedWordsPanel.vue';
import ServerSettingsAuditLogSection from '@/features/server-settings/components/ServerSettingsAuditLogSection.vue';
import ServerSettingsBansSection from '@/features/server-settings/components/ServerSettingsBansSection.vue';
import ServerSettingsDangerZoneSection from '@/features/server-settings/components/ServerSettingsDangerZoneSection.vue';
import ServerSettingsDiscordSection from '@/features/server-settings/components/ServerSettingsDiscordSection.vue';
import ServerSettingsEventsSection from '@/features/server-settings/components/ServerSettingsEventsSection.vue';
import ServerSettingsMembersSection from '@/features/server-settings/components/ServerSettingsMembersSection.vue';
import ServerSettingsStructureSection from '@/features/server-settings/components/ServerSettingsStructureSection.vue';
import type { ChannelCategory } from '@/composables/useChannels';

const props = withDefaults(
  defineProps<{
    modelValue: boolean;
    server: {
      id: string;
      name: string;
      imageUrl: string;
      bannerImageUrl?: string;
      listedInDirectory?: boolean;
      inviteJoinEnabled?: boolean;
      allowGlobalGuests?: boolean;
      bannerBlurEnabled?: boolean;
      bannerBlackoutEnabled?: boolean;
      raidProtectionEnabled?: boolean;
      raidJoinThresholdCount?: number;
      raidJoinWindowSeconds?: number;
      ownerId?: string;
      vanityCode?: string;
      description?: string;
      tags?: string[];
    } | null;
    users: {
      id: string;
      name: string;
      pfp: string;
      status?: string;
      isDiscordShadow?: boolean;
      isGuest?: boolean;
    }[];
    canManageRoles?: boolean;
    canManageServer?: boolean;
    deleteServerEnabled?: boolean;
    /** Member list: highest role label when Echo/mock role data is available */
    resolveMemberHighestRole?: (
      userId: string,
    ) => { name: string; color?: string } | null | undefined;
    canModerateMemberAction?: (
      targetUserId: string,
      action: 'kick' | 'ban' | 'timeout',
    ) => boolean;
    onRequestModerateMember?: (payload: {
      targetUserId: string;
      action: 'kick' | 'ban' | 'timeout';
    }) => void;
    /** Deep-link / URL-driven section (e.g. `?guild_section=`). */
    initialSection?: ServerSettingsSection | null;
    /** Echo: show Structure tab + channel tree (MANAGE_CHANNELS / create-channel capability). */
    guildStructureEnabled?: boolean;
    /** Echo: Discord-imported guild — show Server Settings → Discord. */
    isDiscordImportedServer?: boolean;
    structureCategories?: ChannelCategory[];
    reorderChannel?: (payload: {
      channelId: string;
      targetCategoryId: string | null;
      siblingIndex: number;
    }) => void | Promise<void>;
    reorderCategory?: (payload: {
      categoryId: string;
      siblingIndex: number;
    }) => void | Promise<void>;
  }>(),
  {
    canManageRoles: true,
    canManageServer: true,
    deleteServerEnabled: false,
    initialSection: null,
    guildStructureEnabled: false,
    isDiscordImportedServer: false,
    structureCategories: () => [],
  },
);

async function noopReorderChannel(_payload: {
  channelId: string;
  targetCategoryId: string | null;
  siblingIndex: number;
}) {}

async function noopReorderCategory(_payload: {
  categoryId: string;
  siblingIndex: number;
}) {}

const resolvedReorderChannel = computed(
  () => props.reorderChannel ?? noopReorderChannel,
);
const resolvedReorderCategory = computed(
  () => props.reorderCategory ?? noopReorderCategory,
);

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  'update:activeSection': [value: ServerSettingsSection];
  'echo-workspace-refresh': [];
  /** Refetch shell role catalog (member popout, assignments) after Roles UI mutates Echo. */
  'echo-role-catalog-refresh': [];
  'server-deleted': [serverId: string];
  'preview-role': [
    {
      serverId: string;
      roleId: string;
      roleName: string;
      roleColor: string;
      uiPermissions: string[];
    },
  ];
}>();

const authSession = useAuthSessionStore();
const { isCompactShell } = useCompactShell();
const { accessToken } = storeToRefs(authSession);
const workspace = useEchoWorkspace();

const { rolePreview } = useRolePreview();

const modelValueRef = toRef(props, 'modelValue');
const serverRef = toRef(props, 'server');
const usersRef = toRef(props, 'users');
const canManageServerRef = toRef(props, 'canManageServer');
const deleteServerEnabledRef = toRef(props, 'deleteServerEnabled');
const backendUserIdRef = computed(() => authSession.backendUser?.id);

const {
  transferOwnershipLoading,
  transferOwnershipError,
  deleteServerLoading,
  deleteServerError,
  canTransferEchoOwnership,
  transferOwnershipCandidates,
  runTransferOwnership,
  runDeleteServer,
} = useServerSettingsDangerZone({
  accessToken,
  backendUserId: backendUserIdRef,
  server: serverRef,
  users: usersRef,
  deleteServerEnabled: deleteServerEnabledRef,
  onWorkspaceRefresh: () => emit('echo-workspace-refresh'),
  onServerDeleted: (id) => emit('server-deleted', id),
});

const modalRef = ref<HTMLElement | null>(null);
const serverSettingsContentRef = ref<HTMLElement | null>(null);
const serverSettingsMobileNavRef = ref<HTMLElement | null>(null);

const {
  modalWidthClamped,
  sidebarWidthClamped,
  navCollapsed,
  revealNavLabels,
  preferIconNav,
  startModalWidthResize,
  startSidebarResize,
  resetModalWidth,
  resetSidebarWidth,
  showPreferIconRailShortcut,
} = useServerSettingsModalLayout({
  modelValue: () => props.modelValue,
  isCompactShell: () => isCompactShell.value,
  modalShellRef: modalRef,
});
const activeSection = ref<ServerSettingsSection>('Overview');
const mobilePage = ref<'nav' | 'content'>('nav');

const { visibleSectionGroups, resolveInitialServerSection } =
  useServerSettingsVisibility(props, authSession);

const visibleServerSectionsFlat = computed(() =>
  visibleSectionGroups.value.flatMap((g) => g.items),
);

watch(
  activeSection,
  (s) => {
    if (props.modelValue) emit('update:activeSection', s);
  },
  { flush: 'post' },
);

const overviewPopularTags = computed(() =>
  collectExploreQuickFilters(workspace.discoverableServers.value, 48).map(
    (f) => f.tag,
  ),
);

watch(
  () => props.modelValue && activeSection.value === 'Overview',
  (open) => {
    if (open) void workspace.refreshExploreDirectory();
  },
);

const {
  form,
  serverBannerUrl,
  bannerBlurEnabled,
  bannerBlackoutEnabled,
  bannerChannelPrefsPersisting,
  listedInDirectoryEnabled,
  inviteJoinEnabled,
  bannerPositionY,
  onBannerBlurEnabledChange,
  onBannerBlackoutEnabledChange,
  onServerAccessModeChange,
  serverIconUrl,
  onServerBannerFileChange,
  removeServerBanner,
  onServerIconFileChange,
  resetBannerPreviewsAndToggles,
  syncFormFieldsFromServer,
  onOverviewVanityBlur,
  onOverviewNameBlur,
  onOverviewDescriptionBlur,
  onOverviewTagsBlur,
  persistModerationSettings,
  persistAllowGlobalGuestsSetting,
  persistVerificationRequireEmailSetting,
  persistBannerPositionY,
} = useServerSettingsOverviewState({
  server: serverRef,
  canManageServer: canManageServerRef,
  accessToken,
  workspace: {
    servers: workspace.servers,
    refreshExploreDirectory: workspace.refreshExploreDirectory,
  },
});

const {
  roleManagerRoles,
  selectedRoleId,
  hoveredRoleId,
  draggingRoleId,
  dragOverRoleId,
  dragInsertAfter,
  roleManagerDirty,
  roleManagerSearchQuery,
  roleEditorTab,
  selectedRole,
  filteredRoleManagerRoles,
  displayedRoleManagerRoles,
  echoRoleCategories,
  selectedRoleCategoryTabId,
  roleCategoryUiEnabled,
  rolesDragReorderEnabled,
  hydrateEchoRoleCategories,
  requestAssignRoleToCategory,
  confirmRoleCategorySync,
  cancelRoleCategorySync,
  roleCategorySyncPrompt,
  createRoleCategory,
  deleteActiveRoleCategory,
  roleCategoryListExtra,
  categorySettingsNameDraft,
  categorySettingsDefaultsDraft,
  categorySettingsSelfAssignableDraft,
  categorySettingsSaving,
  categorySettingsError,
  selectRoleCategorySettingsRow,
  saveRoleCategorySettings,
  initRoleManager,
  initRoleManagerFromEcho,
  rolePosition,
  setRolePosition,
  onRoleDragStart,
  onRoleDragOver,
  onRoleDrop,
  onRoleDragEnd,
  deleteRole,
  setSelectedRoleDisplaySeparately,
  setSelectedRoleDefaultOnJoin,
  setSelectedRoleType,
  addSelectedRoleLink,
  removeSelectedRoleLink,
  setSelectedRoleLinkTwoWay,
  setSelectedRoleMentionable,
  setSelectedRoleScope,
  reorderRoleCategoriesLocally,
  roleCustomPanelOpen,
  roleHexInput,
  roleRInput,
  roleGInput,
  roleBInput,
  roleHInput,
  roleSInput,
  roleLInput,
  setColorWheelCanvasEl,
  openRoleCustomPanel,
  selectRoleColorPreset,
  setSeparateThemeColors,
  onPickerHexBlur,
  onRgbInputsBlur,
  onHslInputsBlur,
  nudgeRgb,
  nudgeHsl,
  onWheelPointerDown,
  roleMenuOpen,
  roleSaveLoading,
  roleSaveError,
  echoRolesLocked,
  visibleRolePermissionDefsForServer,
  createRoleWrapped,
  saveRoleManagerChanges,
  discardRoleManagerChanges,
  onRolePermissionCheckboxChange,
  selectedRoleMembers,
  memberRoleIdsByUser,
  setMemberRoleAssignments,
  refreshMemberRoleAssignments,
  assignMemberToRole,
  uploadSelectedRoleIcon,
  setSelectedRoleIconFromPickerEntry,
  setSelectedRoleIconFromAppIcon,
  setSelectedRoleIconFromExternalUrl,
  clearSelectedRoleIcon,
} = useServerSettingsRoles({
  server: serverRef,
  users: usersRef,
  canManageRoles: toRef(props, 'canManageRoles'),
  accessToken,
  activeSection,
  onEchoRoleCatalogMutated: () => emit('echo-role-catalog-refresh'),
});

const roleQuickAddEnabled = computed(() => {
  const sid = props.server?.id;
  return Boolean(
    sid &&
    isEchoGraphIdLocal(sid) &&
    props.canManageRoles &&
    authSession.isAuthenticated,
  );
});

const auditActorAvatarByName = computed<Record<string, string>>(() => {
  const map: Record<string, string> = {};
  for (const user of props.users) {
    if (!user?.name || !user?.pfp) continue;
    map[user.name] = user.pfp;
  }
  return map;
});

/** Shared with Echo audit fetch (`GET /audit?actorId=`) and audit filter state. */
const auditActorFilter = ref('All');

const {
  useEchoSettingsApi,
  liveAuditEntries,
  auditActorCatalog,
  banSearchQuery,
  banScopeFilter,
  filteredBans,
  unbanMember,
} = useServerSettingsEchoAuditBans({
  modelValue: modelValueRef,
  server: serverRef,
  accessToken,
  auditActorFilter,
  activeSection,
});

const {
  MAX_EMOJI_PACKS,
  MAX_EMOJIS_PER_PACK,
  ECHO_EMOJI_PACK_DESCRIPTION_MIN_LEN,
  emojiSearchQuery,
  selectedEmojiPackId,
  selectedEmojiId,
  selectedStickerId,
  customEmojiPackName,
  customEmojiPackDescription,
  customEmojiPackTags,
  customEmojiPackListedInMarket,
  packEditDescription,
  packEditTags,
  packEditListedInMarket,
  saveCustomPackMarketDetails,
  emojiPackMarketSearch,
  emojiPackModalOpen,
  emojiPackModalTab,
  emojiUploadFeedback,
  serverEmojiPacks,
  canImportMorePacks,
  selectedEmojiPack,
  selectedEmoji,
  selectedSticker,
  filteredPackEmojis,
  filteredPackStickers,
  filteredMarketEmojiPacks,
  marketEmojiPacksLoading,
  marketEmojiPacksError,
  refreshMarketEmojiPacks,
  loadMarketPackDetail,
  createCustomEmojiPack,
  importMarketEmojiPack,
  onEmojiUploadFile,
  onEmojiUploadFileChange,
  onStickerUploadFileChange,
  removeEmoji,
  removeSticker,
  updateSelectedEmojiName,
  forkSelectedEmojiPack,
  openEmojiPackModal,
  closeEmojiPackModal,
} = useServerSettingsEmoji(computed(() => props.server?.id));

const {
  auditTabFilter,
  auditTimeFilter,
  AUDIT_TAB_OPTIONS,
  AUDIT_TIME_OPTIONS,
  auditActorSelectOptions,
  filteredAuditEntries,
  splitAuditActionParts,
  clearAuditLogFilters,
} = useServerSettingsAudit(
  computed(() => props.server?.name ?? 'Server'),
  {
    liveEntries: liveAuditEntries,
    useLive: useEchoSettingsApi,
    auditActorCatalog,
    actorFilterRef: auditActorFilter,
  },
);

function setAuditTabFilter(v: string) {
  auditTabFilter.value = v as AuditTabFilter;
}
function setAuditTimeFilter(v: string) {
  auditTimeFilter.value = v as AuditTimeFilter;
}

// Only reset the active section when the modal opens or the target server changes.
// Watching `canManageRoles` / `canManageServer` here caused spurious jumps to Overview:
// those computeds can briefly recompute when `persistPreferences` replaces the server
// row in the store (e.g. moderation toggles), which re-ran this handler and called
// `resolveInitialServerSection()` with a null `initialSection` → first visible tab.
watch(
  () => [props.modelValue, props.server?.id] as const,
  async ([open, serverId], previous) => {
    const [prevOpen, prevServerId] = previous ?? [false, undefined];
    if (!open) return;
    const opening = !prevOpen && open;
    const serverChanged =
      !!serverId && !!prevServerId && serverId !== prevServerId;

    if (opening || serverChanged) {
      activeSection.value = resolveInitialServerSection();
    }
    mobilePage.value = isCompactShell.value
      ? props.initialSection
        ? 'content'
        : 'nav'
      : 'content';
    resetBannerPreviewsAndToggles();
    clearAuditLogFilters();
    syncFormFieldsFromServer();
    const sid = props.server?.id;
    const token = accessToken.value ?? '';
    if (sid && isEchoGraphIdLocal(sid) && authSession.isAuthenticated) {
      try {
        const bundle = await fetchManagedRolesFromEcho(token, sid, props.users);
        hydrateEchoRoleCategories(bundle.roleCategories);
        initRoleManagerFromEcho(bundle.managedRoles);
        setMemberRoleAssignments(bundle.memberAssignments);
      } catch {
        initRoleManager();
      }
    } else {
      initRoleManager();
    }
  },
  { immediate: true },
);

useFocusTrap(modalRef, modelValueRef);

function close() {
  mobilePage.value = 'nav';
  emit('update:modelValue', false);
}

const { getSectionIcon } = useServerSettingsNavigation();

const { previewSelectedRole } = useServerSettingsRolePreview(
  selectedRole,
  computed(() => props.server?.id),
  emit,
  close,
);

const previewedRoleId = computed(() => {
  const preview = rolePreview.value;
  if (!preview || preview.serverId !== props.server?.id) return null;
  return preview.roleId;
});

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') close();
}

function openMobileSection(section: ServerSettingsSection) {
  activeSection.value = section;
  mobilePage.value = 'content';
}

function onMobileBack() {
  mobilePage.value = 'nav';
}

const { onModalPointerDown, onModalPointerUp, onModalPointerCancel } =
  useCompactSettingsModalGestures<ServerSettingsSection>({
    modelValue: () => props.modelValue,
    isCompactShell: () => isCompactShell.value,
    mobilePage,
    activeSection,
    visibleSectionsFlat: visibleServerSectionsFlat,
    close,
    onMobileBack,
    mobileNavRef: serverSettingsMobileNavRef,
    contentRef: serverSettingsContentRef,
  });

async function onSecurityPatch(patch: {
  verificationRequireEmail?: boolean;
  verificationRequirePhone?: boolean;
  verificationRequire2FA?: boolean;
  verificationRequireMatureAccount?: boolean;
  allowGlobalGuests?: boolean;
}) {
  const prevGuests = form.allowGlobalGuests;
  const prevRequireEmail = form.verificationRequireEmail;
  Object.assign(form, patch);
  if (!props.canManageServer || !props.server?.id) return;
  if (!isEchoGraphIdLocal(props.server.id)) return;
  try {
    if (typeof patch.allowGlobalGuests === 'boolean') {
      await persistAllowGlobalGuestsSetting(patch.allowGlobalGuests);
    }
    if (typeof patch.verificationRequireEmail === 'boolean') {
      await persistVerificationRequireEmailSetting(
        patch.verificationRequireEmail,
      );
    }
  } catch {
    form.allowGlobalGuests = prevGuests;
    form.verificationRequireEmail = prevRequireEmail;
  }
}

async function onModerationPatch(patch: {
  raidProtectionEnabled?: boolean;
  raidJoinThresholdCount?: number;
  raidJoinWindowSeconds?: number;
  explicitMediaFilterEnabled?: boolean;
  automodSpamEnabled?: boolean;
  mentionsRequireRole?: boolean;
}) {
  Object.assign(form, patch);
  const persistPatch: {
    automodSpamEnabled?: boolean;
    raidProtectionEnabled?: boolean;
    raidJoinThresholdCount?: number;
    raidJoinWindowSeconds?: number;
  } = {};
  if (typeof patch.automodSpamEnabled === 'boolean') {
    persistPatch.automodSpamEnabled = patch.automodSpamEnabled;
  }
  if (typeof patch.raidProtectionEnabled === 'boolean') {
    persistPatch.raidProtectionEnabled = patch.raidProtectionEnabled;
  }
  if (typeof patch.raidJoinThresholdCount === 'number') {
    persistPatch.raidJoinThresholdCount = patch.raidJoinThresholdCount;
  }
  if (typeof patch.raidJoinWindowSeconds === 'number') {
    persistPatch.raidJoinWindowSeconds = patch.raidJoinWindowSeconds;
  }
  if (Object.keys(persistPatch).length === 0) return;
  try {
    await persistModerationSettings(persistPatch);
  } catch {
    syncFormFieldsFromServer();
  }
}
</script>

<template>
  <Transition name="server-settings-modal">
    <div
      v-if="modelValue && server"
      class="fixed inset-0 z-[140] flex bg-overlay-dim"
      :class="
        isCompactShell
          ? 'items-stretch justify-stretch p-0'
          : 'items-center justify-center px-2'
      "
      @click.self="close"
      @keydown="onKeydown"
    >
      <div
        ref="modalRef"
        role="dialog"
        aria-modal="true"
        aria-labelledby="server-settings-title"
        class="server-settings-modal relative overflow-hidden text-foreground"
        :class="
          isCompactShell
            ? 'flex h-[100dvh] max-w-none flex-col rounded-none'
            : 'flex h-[min(920px,96vh)] max-w-none min-w-0 flex-nowrap flex-row rounded-2xl'
        "
        :style="
          !isCompactShell
            ? {
                width: `${modalWidthClamped}px`,
                maxWidth: 'calc(100vw - 16px)',
              }
            : undefined
        "
        @pointerdown="onModalPointerDown"
        @pointerup="onModalPointerUp"
        @pointercancel="onModalPointerCancel"
      >
        <template v-if="!isCompactShell">
          <div
            class="relative flex min-h-0 min-w-0 shrink-0 flex-col self-stretch border-r border-[var(--border)] bg-[var(--srv-sidebar-grad)]"
            :style="{
              width: navCollapsed ? '48px' : `${sidebarWidthClamped}px`,
            }"
          >
            <ServerSettingsSidebar
              class="min-h-0 flex-1"
              :server-name="server.name"
              :visible-section-groups="visibleSectionGroups"
              :active-section="activeSection"
              :get-section-icon="getSectionIcon"
              :collapsed="navCollapsed"
              @update:active-section="activeSection = $event"
              @request-expand-labels="revealNavLabels"
            />
            <div
              v-if="showPreferIconRailShortcut"
              class="mt-auto shrink-0 border-t border-[var(--border)] p-2"
            >
              <button
                type="button"
                class="chat-focus-ring w-full rounded-lg px-2 py-1.5 text-center text-[11px] font-semibold text-fg-soft transition-colors hover:bg-glass-hover hover:text-fg"
                @click="preferIconNav"
              >
                Icon rail
              </button>
            </div>

            <div
              v-if="!navCollapsed"
              class="pointer-events-auto absolute bottom-0 right-0 top-0 z-[6] w-2 -mr-1 cursor-col-resize"
              style="background: transparent; border: none"
              aria-label="Resize settings navigation"
              @mousedown="startSidebarResize"
              @dblclick.stop="resetSidebarWidth"
            />
          </div>
        </template>

        <aside
          v-if="isCompactShell && mobilePage === 'nav'"
          ref="serverSettingsMobileNavRef"
          class="server-settings-sidebar custom-scrollbar w-full shrink-0 overflow-y-auto p-5"
        >
          <div class="mb-5 flex items-start justify-between gap-4 px-3">
            <div class="min-w-0">
              <div
                class="text-[11px] font-semibold uppercase tracking-[0.18em] text-fg-soft"
              >
                Server Settings
              </div>
              <h2 id="server-settings-title" class="mt-2 text-2xl font-bold">
                {{ server.name }}
              </h2>
              <p class="mt-1 text-sm text-muted">
                One thing at a time. Tap a section or swipe left.
              </p>
            </div>
            <button
              type="button"
              class="close-btn shrink-0 rounded-lg px-3 py-2 text-sm font-semibold text-fg-soft transition-colors hover:bg-glass-hover hover:text-fg"
              @click="close"
            >
              Exit
            </button>
          </div>

          <div
            v-if="!visibleSectionGroups.length"
            class="mb-5 px-3 text-sm text-muted"
          >
            You don't have permission to change this server's settings.
          </div>
          <div
            v-for="group in visibleSectionGroups"
            :key="group.label"
            class="mb-5"
          >
            <div
              class="server-settings-nav-section-label px-3 pb-2 text-[11px] font-semibold uppercase tracking-[0.18em]"
            >
              {{ group.label }}
            </div>
            <div class="flex flex-col gap-1">
              <button
                v-for="item in group.items"
                :key="item"
                type="button"
                class="server-settings-nav-item rounded-xl px-3 py-3 text-left text-sm font-medium transition-colors text-fg-soft hover:bg-glass-hover hover:text-fg"
                @click="openMobileSection(item)"
              >
                <div class="flex items-center justify-between gap-2">
                  <span class="flex min-w-0 items-center gap-2">
                    <img
                      :src="getSectionIcon(item)"
                      alt=""
                      class="server-settings-nav-icon h-4 w-4"
                    />
                    <span class="truncate">{{ item }}</span>
                  </span>
                  <span class="text-fg-subtle" aria-hidden="true">&gt;</span>
                </div>
              </button>
            </div>
          </div>
        </aside>

        <section
          v-if="!isCompactShell || mobilePage === 'content'"
          ref="serverSettingsContentRef"
          class="server-settings-content min-w-0 flex min-h-0 flex-1 flex-col overflow-hidden"
          :class="isCompactShell ? 'p-4' : 'p-6'"
        >
          <ServerSettingsHeader
            :active-section="activeSection"
            :get-section-icon="getSectionIcon"
            :compact="!isCompactShell && navCollapsed"
            @close="close"
            :show-back="isCompactShell"
            @back="onMobileBack"
          />

          <div
            class="flex min-h-0 flex-1 flex-col"
            :class="
              activeSection === 'Roles' || activeSection === 'Members'
                ? 'min-h-0 overflow-hidden'
                : 'min-h-0 overflow-y-auto custom-scrollbar'
            "
          >
            <Transition name="server-settings-panel" mode="out-in">
              <div
                :key="activeSection"
                class="server-settings-panel-root"
                :class="
                  activeSection === 'Roles' || activeSection === 'Members'
                    ? 'flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden'
                    : ''
                "
              >
                <template v-if="activeSection === 'Overview'">
                  <ServerSettingsOverviewSection
                    :server="server"
                    :form="form"
                    :access-token="accessToken ?? ''"
                    :can-manage-server="!!props.canManageServer"
                    :popular-tag-suggestions="overviewPopularTags"
                    :server-banner-url="serverBannerUrl"
                    :server-icon-url="serverIconUrl"
                    :banner-blur-enabled="bannerBlurEnabled"
                    :banner-blackout-enabled="bannerBlackoutEnabled"
                    :banner-channel-prefs-persisting="
                      bannerChannelPrefsPersisting
                    "
                    :banner-position-y="bannerPositionY"
                    :on-server-banner-file-change="onServerBannerFileChange"
                    :on-remove-server-banner="removeServerBanner"
                    :can-manage-banner="!!props.canManageServer"
                    :on-server-icon-file-change="onServerIconFileChange"
                    :on-banner-position-y-save="persistBannerPositionY"
                    @update:banner-blur-enabled="onBannerBlurEnabledChange"
                    @update:banner-blackout-enabled="
                      onBannerBlackoutEnabledChange
                    "
                    @vanity-blur="onOverviewVanityBlur"
                    @name-blur="onOverviewNameBlur"
                    @description-blur="onOverviewDescriptionBlur"
                    @tags-blur="onOverviewTagsBlur"
                  />
                </template>

                <ServerSettingsEventsSection
                  v-else-if="activeSection === 'Events'"
                  :server-id="server?.id ?? ''"
                  :is-discord-imported-server="!!props.isDiscordImportedServer"
                  @echo-workspace-refresh="emit('echo-workspace-refresh')"
                />

                <ServerSettingsStructureSection
                  v-else-if="activeSection === 'Structure'"
                  :categories="structureCategories"
                  :server-id="server?.id ?? null"
                  :can-reorder-channels="guildStructureEnabled"
                  :can-reorder-categories="guildStructureEnabled"
                  :commit-channel-reorder="resolvedReorderChannel"
                  :commit-category-reorder="resolvedReorderCategory"
                />

                <ServerSettingsMembersSection
                  v-else-if="activeSection === 'Members'"
                  :members="props.users"
                  :current-user-id="authSession.backendUser?.id ?? null"
                  :owner-id="server?.ownerId ?? null"
                  :resolve-highest-role="props.resolveMemberHighestRole"
                  :can-moderate-member-action="props.canModerateMemberAction"
                  :on-request-moderate-member="props.onRequestModerateMember"
                />

                <ServerSettingsRolesSection
                  v-else-if="activeSection === 'Roles'"
                  :role-manager-roles="roleManagerRoles"
                  :selected-role-id="selectedRoleId"
                  :hovered-role-id="hoveredRoleId"
                  :dragging-role-id="draggingRoleId"
                  :drag-over-role-id="dragOverRoleId"
                  :drag-insert-after="dragInsertAfter"
                  :role-manager-dirty="roleManagerDirty"
                  :role-manager-search-query="roleManagerSearchQuery"
                  :role-editor-tab="roleEditorTab"
                  :selected-role="selectedRole"
                  :filtered-role-manager-roles="displayedRoleManagerRoles"
                  :echo-role-categories="echoRoleCategories"
                  :selected-role-category-tab-id="selectedRoleCategoryTabId"
                  :role-category-ui-enabled="roleCategoryUiEnabled"
                  :roles-drag-reorder-enabled="rolesDragReorderEnabled"
                  :assign-role-to-category="requestAssignRoleToCategory"
                  :role-category-sync-prompt="roleCategorySyncPrompt"
                  :confirm-role-category-sync="confirmRoleCategorySync"
                  :cancel-role-category-sync="cancelRoleCategorySync"
                  :create-role-category="createRoleCategory"
                  :delete-active-role-category="deleteActiveRoleCategory"
                  :role-category-list-extra="roleCategoryListExtra"
                  v-model:category-settings-name-draft="
                    categorySettingsNameDraft
                  "
                  v-model:category-settings-defaults-draft="
                    categorySettingsDefaultsDraft
                  "
                  v-model:category-settings-self-assignable-draft="
                    categorySettingsSelfAssignableDraft
                  "
                  :category-settings-saving="categorySettingsSaving"
                  :category-settings-error="categorySettingsError"
                  :select-role-category-settings-row="
                    selectRoleCategorySettingsRow
                  "
                  :save-role-category-settings="saveRoleCategorySettings"
                  @update:selected-role-category-tab-id="
                    selectedRoleCategoryTabId = $event
                  "
                  :visible-role-permission-defs="
                    visibleRolePermissionDefsForServer
                  "
                  :echo-roles-locked="echoRolesLocked"
                  :role-save-loading="roleSaveLoading"
                  :echo-server-id-for-permission-preview="
                    !authSession.isAuthenticated || !props.canManageRoles
                      ? null
                      : (props.server?.id ?? null)
                  "
                  :role-menu-open="roleMenuOpen"
                  :role-custom-panel-open="roleCustomPanelOpen"
                  :role-hex-input="roleHexInput"
                  :role-r-input="roleRInput"
                  :role-g-input="roleGInput"
                  :role-b-input="roleBInput"
                  :role-h-input="roleHInput"
                  :role-s-input="roleSInput"
                  :role-l-input="roleLInput"
                  :selected-role-members="selectedRoleMembers"
                  :member-role-ids-by-user="memberRoleIdsByUser"
                  :assign-member-to-role="assignMemberToRole"
                  :refresh-member-role-assignments="
                    refreshMemberRoleAssignments
                  "
                  :role-quick-add-enabled="roleQuickAddEnabled"
                  :all-users="props.users"
                  :role-icon-picker-server-id="props.server?.id ?? null"
                  :upload-selected-role-icon="uploadSelectedRoleIcon"
                  :set-selected-role-icon-from-picker-entry="
                    setSelectedRoleIconFromPickerEntry
                  "
                  :set-selected-role-icon-from-app-icon="
                    setSelectedRoleIconFromAppIcon
                  "
                  :set-selected-role-icon-from-external-url="
                    setSelectedRoleIconFromExternalUrl
                  "
                  :clear-selected-role-icon="clearSelectedRoleIcon"
                  :previewed-role-id="previewedRoleId"
                  :role-save-error="roleSaveError"
                  :set-color-wheel-canvas-el="setColorWheelCanvasEl"
                  :create-role="createRoleWrapped"
                  :role-position="rolePosition"
                  :set-role-position="setRolePosition"
                  :on-role-drag-start="onRoleDragStart"
                  :on-role-drag-over="onRoleDragOver"
                  :on-role-drop="onRoleDrop"
                  :on-role-drag-end="onRoleDragEnd"
                  :delete-role="deleteRole"
                  :set-selected-role-display-separately="
                    setSelectedRoleDisplaySeparately
                  "
                  :set-selected-role-default-on-join="
                    setSelectedRoleDefaultOnJoin
                  "
                  :set-selected-role-type="setSelectedRoleType"
                  :add-selected-role-link="addSelectedRoleLink"
                  :remove-selected-role-link="removeSelectedRoleLink"
                  :set-selected-role-link-two-way="setSelectedRoleLinkTwoWay"
                  :set-selected-role-mentionable="setSelectedRoleMentionable"
                  :set-selected-role-scope="setSelectedRoleScope"
                  :reorder-role-categories-locally="
                    reorderRoleCategoriesLocally
                  "
                  :on-role-permission-checkbox-change="
                    onRolePermissionCheckboxChange
                  "
                  :set-separate-theme-colors="setSeparateThemeColors"
                  :open-role-custom-panel="openRoleCustomPanel"
                  :select-role-color-preset="selectRoleColorPreset"
                  :on-picker-hex-blur="onPickerHexBlur"
                  :on-rgb-inputs-blur="onRgbInputsBlur"
                  :on-hsl-inputs-blur="onHslInputsBlur"
                  :nudge-rgb="nudgeRgb"
                  :nudge-hsl="nudgeHsl"
                  :on-wheel-pointer-down="onWheelPointerDown"
                  :discard-role-manager-changes="discardRoleManagerChanges"
                  :save-role-manager-changes="saveRoleManagerChanges"
                  @update:selected-role-id="selectedRoleId = $event"
                  @update:hovered-role-id="hoveredRoleId = $event"
                  @update:role-manager-search-query="
                    roleManagerSearchQuery = $event
                  "
                  @update:role-editor-tab="roleEditorTab = $event"
                  @update:role-menu-open="roleMenuOpen = $event"
                  @update:role-hex-input="roleHexInput = $event"
                  @update:role-r-input="roleRInput = $event"
                  @update:role-g-input="roleGInput = $event"
                  @update:role-b-input="roleBInput = $event"
                  @update:role-h-input="roleHInput = $event"
                  @update:role-s-input="roleSInput = $event"
                  @update:role-l-input="roleLInput = $event"
                  @preview-selected-role="previewSelectedRole"
                />

                <ServerSettingsDiscordSection
                  v-else-if="activeSection === 'Discord'"
                  :server-id="server.id"
                  :can-manage-server="!!props.canManageServer"
                  :on-workspace-refresh="() => emit('echo-workspace-refresh')"
                />

                <ServerSettingsEmojiSection
                  v-else-if="activeSection === 'Emoji'"
                  :max-emoji-packs="MAX_EMOJI_PACKS"
                  :max-emojis-per-pack="MAX_EMOJIS_PER_PACK"
                  :emoji-pack-description-min-len="
                    ECHO_EMOJI_PACK_DESCRIPTION_MIN_LEN
                  "
                  :emoji-search-query="emojiSearchQuery"
                  :selected-emoji-pack-id="selectedEmojiPackId"
                  :selected-emoji-id="selectedEmojiId"
                  :selected-sticker-id="selectedStickerId"
                  :custom-emoji-pack-name="customEmojiPackName"
                  :custom-emoji-pack-description="customEmojiPackDescription"
                  :custom-emoji-pack-tags="customEmojiPackTags"
                  :custom-emoji-pack-listed-in-market="
                    customEmojiPackListedInMarket
                  "
                  :pack-edit-description="packEditDescription"
                  :pack-edit-tags="packEditTags"
                  :pack-edit-listed-in-market="packEditListedInMarket"
                  :save-custom-pack-market-details="saveCustomPackMarketDetails"
                  :emoji-pack-market-search="emojiPackMarketSearch"
                  :emoji-pack-modal-open="emojiPackModalOpen"
                  :emoji-pack-modal-tab="emojiPackModalTab"
                  :emoji-upload-feedback="emojiUploadFeedback"
                  :server-emoji-packs="serverEmojiPacks"
                  :can-import-more-packs="canImportMorePacks"
                  :selected-emoji-pack="selectedEmojiPack"
                  :selected-emoji="selectedEmoji"
                  :selected-sticker="selectedSticker"
                  :filtered-pack-emojis="filteredPackEmojis"
                  :filtered-pack-stickers="filteredPackStickers"
                  :filtered-market-emoji-packs="filteredMarketEmojiPacks"
                  :market-emoji-packs-loading="marketEmojiPacksLoading"
                  :market-emoji-packs-error="marketEmojiPacksError"
                  :refresh-market-emoji-packs="refreshMarketEmojiPacks"
                  :load-market-pack-detail="loadMarketPackDetail"
                  :create-custom-emoji-pack="createCustomEmojiPack"
                  :import-market-emoji-pack="importMarketEmojiPack"
                  :on-emoji-upload-file="onEmojiUploadFile"
                  :on-emoji-upload-file-change="onEmojiUploadFileChange"
                  :on-sticker-upload-file-change="onStickerUploadFileChange"
                  :remove-emoji="removeEmoji"
                  :remove-sticker="removeSticker"
                  :update-selected-emoji-name="updateSelectedEmojiName"
                  :fork-selected-emoji-pack="forkSelectedEmojiPack"
                  :open-emoji-pack-modal="openEmojiPackModal"
                  :close-emoji-pack-modal="closeEmojiPackModal"
                  @update:emoji-search-query="emojiSearchQuery = $event"
                  @update:selected-emoji-pack-id="selectedEmojiPackId = $event"
                  @update:selected-emoji-id="selectedEmojiId = $event"
                  @update:selected-sticker-id="selectedStickerId = $event"
                  @update:custom-emoji-pack-name="customEmojiPackName = $event"
                  @update:custom-emoji-pack-description="
                    customEmojiPackDescription = $event
                  "
                  @update:custom-emoji-pack-tags="customEmojiPackTags = $event"
                  @update:custom-emoji-pack-listed-in-market="
                    customEmojiPackListedInMarket = $event
                  "
                  @update:pack-edit-description="packEditDescription = $event"
                  @update:pack-edit-tags="packEditTags = $event"
                  @update:pack-edit-listed-in-market="
                    packEditListedInMarket = $event
                  "
                  @update:emoji-pack-market-search="
                    emojiPackMarketSearch = $event
                  "
                  @update:emoji-pack-modal-tab="emojiPackModalTab = $event"
                />

                <ServerSettingsSecuritySection
                  v-else-if="activeSection === 'Security'"
                  :form="form"
                  @patch-form="onSecurityPatch"
                />

                <ServerSettingsAccessSection
                  v-else-if="activeSection === 'Access'"
                  :server-id="server?.id ?? ''"
                  :can-manage-server="!!props.canManageServer"
                  :access-token="accessToken"
                  :workspace-servers="workspace.servers"
                  :listed-in-directory-enabled="listedInDirectoryEnabled"
                  :invite-join-enabled="inviteJoinEnabled"
                  @update:access-mode="onServerAccessModeChange"
                  @echo-workspace-refresh="emit('echo-workspace-refresh')"
                />

                <ServerSettingsTicketsSection
                  v-else-if="activeSection === 'Tickets'"
                  :server-id="server?.id ?? ''"
                  :access-token="accessToken"
                  :categories="structureCategories"
                  :roles="
                    roleManagerRoles.map((r) => ({
                      id: r.id,
                      name: r.name,
                    }))
                  "
                />

                <ServerSettingsSelfRolesSection
                  v-else-if="activeSection === 'Self-assignable Roles'"
                  :server-id="server?.id ?? ''"
                  :access-token="accessToken"
                  :roles="
                    roleManagerRoles.map((r) => ({
                      id: r.id,
                      name: r.name,
                      color: r.color,
                      roleCategoryId: r.roleCategoryId,
                      permissions: r.storedEchoPermissions,
                    }))
                  "
                  :role-categories="echoRoleCategories"
                />

                <div
                  v-else-if="activeSection === 'Banned Words'"
                  class="server-settings-panel-root"
                >
                  <BannedWordsPanel
                    v-if="isEchoGraphIdLocal(server?.id ?? '')"
                    :server-id="server?.id ?? ''"
                    :can-manage="!!props.canManageServer"
                    :echo-roles="
                      roleManagerRoles.map((r) => ({
                        id: r.id,
                        name: r.name,
                      }))
                    "
                  />
                  <div
                    v-else
                    class="server-settings-panel rounded-2xl p-5 text-sm text-fg-soft"
                  >
                    Banned words filter is unavailable for this server.
                  </div>
                </div>

                <ServerSettingsModerationSection
                  v-else-if="activeSection === 'Moderation'"
                  :form="form"
                  @patch-form="onModerationPatch"
                />

                <ServerSettingsAuditLogSection
                  v-else-if="activeSection === 'Audit Log'"
                  :audit-tab-filter="auditTabFilter"
                  :audit-actor-filter="auditActorFilter"
                  :audit-time-filter="auditTimeFilter"
                  :audit-tab-options="AUDIT_TAB_OPTIONS"
                  :audit-actor-select-options="auditActorSelectOptions"
                  :audit-time-options="AUDIT_TIME_OPTIONS"
                  :filtered-audit-entries="filteredAuditEntries"
                  :split-audit-action-parts="splitAuditActionParts"
                  :audit-actor-avatar-by-name="auditActorAvatarByName"
                  :clear-audit-log-filters="clearAuditLogFilters"
                  @update:audit-tab-filter="setAuditTabFilter"
                  @update:audit-actor-filter="auditActorFilter = $event"
                  @update:audit-time-filter="setAuditTimeFilter"
                />

                <ServerSettingsBansSection
                  v-else-if="activeSection === 'Bans'"
                  :ban-search-query="banSearchQuery"
                  :ban-scope-filter="banScopeFilter"
                  :ban-list="filteredBans"
                  :unban-member="unbanMember"
                  @update:ban-search-query="banSearchQuery = $event"
                  @update:ban-scope-filter="banScopeFilter = $event"
                />

                <ServerSettingsDangerZoneSection
                  v-else-if="activeSection === 'Danger Zone'"
                  :server-name="server?.name ?? 'this server'"
                  :transfer-enabled="canTransferEchoOwnership"
                  :transfer-candidates="transferOwnershipCandidates"
                  :transfer-loading="transferOwnershipLoading"
                  :transfer-error="transferOwnershipError"
                  :delete-server-enabled="deleteServerEnabled"
                  :delete-loading="deleteServerLoading"
                  :delete-error="deleteServerError"
                  @transfer-ownership="runTransferOwnership"
                  @confirm-delete-server="runDeleteServer"
                />
              </div>
            </Transition>
          </div>
        </section>

        <div
          v-if="!isCompactShell"
          class="server-settings-modal__resize-edge pointer-events-auto absolute bottom-6 right-0 top-24 z-[6] w-2 cursor-col-resize"
          style="background: transparent; border: none"
          aria-label="Resize server settings window"
          @mousedown="startModalWidthResize"
          @dblclick.stop="resetModalWidth"
        />
      </div>
    </div>
  </Transition>
</template>

<style lang="scss">
@use '@/features/server-settings/styles/serverSettingsModal.scss';
</style>
