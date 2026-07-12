<script setup lang="ts">
import { computed, inject, nextTick, ref, unref, watch, type Ref } from 'vue';
import {
  dbgMemberList,
  isEchoMemberListDebugEnabled,
} from '@/utils/echoMemberListDebug';
import { memberPanelDiag } from '@/utils/memberPanelDiag';
import { storeToRefs } from 'pinia';
import StatusIndicator from '@/components/StatusIndicator.vue';
import PausedGifAvatar from '@/components/PausedGifAvatar.vue';
import { isTrustedMediaUrl, safeImageUrl } from '@/utils/safeImageUrl';
import {
  getPopoutAnchorRect,
  getHighestRoleForMember,
  ROLE_HIERARCHY,
} from '@/utils/memberProfiles';
import { memberRoleIconImgSrc } from '@/utils/memberRoleIconDisplay';
import type { MemberRole } from '@/utils/memberProfiles';
import { userAvatars } from '@/assets/userAvatars';
import { useEchoWorkspace } from '@/composables/useEchoWorkspace';
import { useSimpleContextMenu } from '@/composables/useSimpleContextMenu';
import { copyToClipboard } from '@/features/chat/composables/useMessageLinkActions';
import { icons } from '@/assets/icons';
import ServerOwnerCrownIcon from '@/features/layout/components/ServerOwnerCrownIcon.vue';
import { linkTokenUser } from '@/utils/idTokens';
import { useDevSettingsStore } from '@/stores/devSettings';
import { selectPresence } from '@/services/domain/presence';
import { isEchoPanelDiagEnabled } from '@/utils/panelDiagEnabled';
import {
  COMPOSER_INSERT_USER_MENTION_KEY,
  type InsertUserMentionFn,
} from '@/features/chat/chatComposerContext';
import type { EchoRoleCategoryDto } from '@/api/echo/types';

type User = {
  id: string;
  name: string;
  pfp: string;
  status?: string;
  customStatus?: string;
  isGuest?: boolean;
};

const devSettings = useDevSettingsStore();
const { devModeIdsEnabled } = storeToRefs(devSettings);

const MENU_ITEM =
  'chat-focus-ring echo-menu-item flex w-full items-center gap-2 rounded-sm px-3 py-2 text-left text-sm';
const MENU_ITEM_KICK =
  'chat-focus-ring echo-menu-item echo-menu-item--warning flex w-full items-center gap-2 rounded-sm px-3 py-2 text-left text-sm';
const MENU_ITEM_BAN =
  'chat-focus-ring echo-menu-item echo-menu-item--destructive flex w-full items-center gap-2 rounded-sm px-3 py-2 text-left text-sm';
const MENU_ITEM_TIMEOUT =
  'chat-focus-ring echo-menu-item echo-menu-item--warning flex w-full items-center gap-2 rounded-sm px-3 py-2 text-left text-sm';

export type MemberRoleManagementSpec = {
  enabled: boolean;
  assignableRoles: {
    id: string;
    name: string;
    color: string;
    darkColor?: string;
    lightColor?: string;
    separateThemeColors?: boolean;
    roleIconUrl?: string | null;
    roleIconEmojiId?: string | null;
    isEveryone?: boolean;
    position?: number;
    /** Server Settings organizer group; omit when uncategorized. */
    roleCategoryId?: string | null;
  }[];
  /** When non-empty, Manage Roles can show category tabs. */
  roleCategories?: EchoRoleCategoryDto[];
  /**
   * Whether the viewer may assign (`assign: true`) or remove (`assign: false`)
   * `roleId` on `targetUserId`. Omitted in mock workspaces (all rows stay enabled).
   */
  canMutateMemberRole?: (
    targetUserId: string,
    roleId: string,
    assign: boolean,
  ) => boolean;
  busy?: boolean;
  resolveAssignedRoleIds: (userId: string) => string[];
  onToggleRole: (payload: {
    targetUserId: string;
    roleId: string;
    assign: boolean;
  }) => void | Promise<void>;
};

const props = defineProps<{
  users: User[] | import('vue').Ref<User[]>;
  serverId: string;
  collapsed: boolean;
  visible: boolean;
  currentUserId?: string;
  /** Broad gate for moderation UI on this member (hierarchy / server rules). */
  canModerateUser?: (userId: string) => boolean;
  /** Per-action permission (preview roles, Echo capabilities, mock hierarchy). */
  canModerateMemberAction?: (
    userId: string,
    action: 'kick' | 'ban' | 'timeout',
  ) => boolean;
  onModerateUser?: (payload: {
    action: 'kick' | 'ban' | 'timeout';
    targetUserId: string;
    timeoutMinutes?: number;
  }) => void;
  /** Whether the current user may set this member’s server nickname (parent checks perms). */
  canChangeMemberNickname?: (userId: string) => boolean;
  onChangeMemberNickname?: (userId: string) => void;
  /** Open DM with this user (same as clicking them in DM list). */
  onMessageUser?: (userId: string) => void;
  /** When set, overrides static mock map / drives Echo grouping. */
  resolveHighestRole?: (userId: string) => MemberRole | undefined;
  /** compact role checkboxes (nested glass panel). */
  roleManagement?: MemberRoleManagementSpec;
  /** True while waiting for server role hierarchy bootstrap for this guild. */
  loadingRoleHierarchy?: boolean;
  /** Echo: sort sections by `listSortKey` (hoisted roles), unhoisted bucket last. */
  echoMemberSectionOrdering?: boolean;
  /** Sparse map: user id → true when peer uses Echo Web from a phone-class client. */
  presenceMobileByUserId?: Record<string, true>;
  /** Sparse map: user id → true when peer is online on Discord. */
  discordOnlineByUserId?: Record<string, true>;
  /** Sparse map: user id → ISO timestamp when they were last online. */
  lastOnlineAtByUserId?: Record<string, string>;
  /** Echo guild owner — shows crown next to display name. */
  serverOwnerId?: string | null;
  /** When false (default), guest rows are omitted upstream; footer toggles visibility. */
  showGuests?: boolean;
  /** Total guest members on the server (including hidden rows). */
  guestCount?: number;
}>();

const emit = defineEmits<{
  'update:collapsed': [value: boolean];
  'update:showGuests': [value: boolean];
  'open-profile': [
    payload: {
      userId: string;
      anchorRect: ReturnType<typeof getPopoutAnchorRect>;
      rolesPanel?: boolean;
      fromContextMenu?: boolean;
    },
  ];
}>();

const showGuestsToggleVisible = computed(() => (props.guestCount ?? 0) > 0);

const {
  menuOpen,
  menuRef,
  menuPosition,
  openAtEvent,
  closeMenu,
  fitMenuToViewport,
} = useSimpleContextMenu();

const composerInsertUserMention =
  inject<Ref<InsertUserMentionFn | null> | null>(
    COMPOSER_INSERT_USER_MENTION_KEY,
    null,
  );
const workspace = useEchoWorkspace();
const showMentionInChat = computed(() => !!composerInsertUserMention?.value);

const contextUser = ref<User | null>(null);

watch(menuOpen, async () => {
  await nextTick();
  requestAnimationFrame(() => fitMenuToViewport(menuRef.value));
});

function canModerateAction(action: 'kick' | 'ban' | 'timeout'): boolean {
  const u = contextUser.value;
  const cur = props.currentUserId;
  const perAction = props.canModerateMemberAction;
  const broad = props.canModerateUser;
  if (!u || !cur || u.id === cur) return false;
  if (perAction) return perAction(u.id, action);
  return broad?.(u.id) ?? false;
}

const showKick = computed(() => canModerateAction('kick'));
const showBan = computed(() => canModerateAction('ban'));
const showTimeout = computed(() => canModerateAction('timeout'));
const showAnyModAction = computed(
  () => showKick.value || showBan.value || showTimeout.value,
);

const showChangeNickname = computed(() => {
  const u = contextUser.value;
  const cur = props.currentUserId;
  if (!u || !cur) return false;
  return !!(
    props.onChangeMemberNickname && props.canChangeMemberNickname?.(u.id)
  );
});

const isSelf = computed(() => {
  const u = contextUser.value;
  const cur = props.currentUserId;
  return !!(u && cur && u.id === cur);
});

const usersList = computed(() => unref(props.users));
const hasMembers = computed(() => usersList.value.length > 0);
/**
 * Discord/YouTube-style: skeletons appear instantly on the *first* load (no data yet)
 * and are replaced in place once members arrive. We never blank an already-populated
 * list — subsequent role-hierarchy refreshes keep the existing rows visible (no gap,
 * no "Loading…" flash, no full reload).
 */
const showMemberSkeleton = computed(
  () => !!props.loadingRoleHierarchy && !hasMembers.value,
);
/** Static placeholder layout — fixed keys/widths so the skeleton never reshuffles. */
const skeletonSections = [
  {
    key: 'sk-1',
    headerWidth: '40%',
    rowWidths: ['62%', '48%', '70%', '55%', '44%'],
  },
  { key: 'sk-2', headerWidth: '30%', rowWidths: ['58%', '66%', '50%', '72%'] },
];

const roleManagementUiVisible = computed(() => {
  const rm = props.roleManagement;
  return !!(rm?.enabled && contextUser.value);
});

function presenceForUser(user: User) {
  const presence = selectPresence({
    rowStatus: user.status,
    diagnosticsKey: `member-list:${user.id}`,
    mobileSurface: !!props.presenceMobileByUserId?.[user.id],
  });
  const discordOnline = !!props.discordOnlineByUserId?.[user.id];
  return {
    ...presence,
    discordOnline,
    // If user is offline on Echo but online on Discord, show Discord indicator
    indicatorDiscordOnline:
      discordOnline && (presence.isOffline || !presence.status),
  };
}

function sectionRoleIconSrc(role: MemberRole): string {
  return memberRoleIconImgSrc({
    iconUrl: role.iconUrl,
    iconEmojiId: role.iconEmojiId,
  });
}

/**
 * Groups members by display section role (Echo: hoisted bucket + `listSortKey` = role position,
 * same order as Server Settings → Roles). Mock servers: {@link ROLE_HIERARCHY}.
 * Within each section, sorts by online status (online → idle → DND → offline).
 */
const roleSections = computed(() => {
  const serverId = props.serverId || 'echo';
  const resolve = props.resolveHighestRole;
  const currentUsers = usersList.value;

  // 1. Group members by role ID
  const membersByRoleId = new Map<
    string,
    { role: MemberRole; members: User[] }
  >();

  for (const user of currentUsers) {
    const role =
      (resolve ? resolve(user.id) : null) ??
      getHighestRoleForMember(serverId, user.id);

    let entry = membersByRoleId.get(role.id);
    if (!entry) {
      entry = { role, members: [] };
      membersByRoleId.set(role.id, entry);
    }
    entry.members.push(user);
  }

  const isBottom = (r: MemberRole): boolean =>
    !!r.isUnhoistedBucket || r.id === '__echo_unhoisted__';

  // 2. Sort sections
  const sections = Array.from(membersByRoleId.values()).sort((a, b) => {
    const ua = isBottom(a.role);
    const ub = isBottom(b.role);
    if (ua !== ub) return ua ? 1 : -1;
    if (props.echoMemberSectionOrdering) {
      const ka = a.role.listSortKey ?? 0;
      const kb = b.role.listSortKey ?? 0;
      if (kb !== ka) return kb - ka;
      return a.role.id.localeCompare(b.role.id);
    }
    const ia = ROLE_HIERARCHY.indexOf(a.role.name);
    const ib = ROLE_HIERARCHY.indexOf(b.role.name);
    const orderA = ia === -1 ? ROLE_HIERARCHY.length : ia;
    const orderB = ib === -1 ? ROLE_HIERARCHY.length : ib;
    return orderA - orderB;
  });

  // 3. Sort members within each section
  for (const section of sections) {
    section.members.sort((u1, u2) => {
      const statusDiff =
        presenceForUser(u1).sortOrder - presenceForUser(u2).sortOrder;
      if (statusDiff !== 0) return statusDiff;
      const hasPfp1 = hasCustomProfilePhoto(u1);
      const hasPfp2 = hasCustomProfilePhoto(u2);
      if (hasPfp1 !== hasPfp2) return hasPfp1 ? -1 : 1;
      return u1.name.localeCompare(u2.name);
    });
  }

  return sections;
});

watch(
  () => {
    if (!isEchoMemberListDebugEnabled() && !isEchoPanelDiagEnabled()) {
      return null;
    }
    return {
      serverId: props.serverId,
      collapsed: props.collapsed,
      visible: props.visible,
      usersLen: usersList.value.length,
      loadingRoleHierarchy: props.loadingRoleHierarchy,
      echoMemberSectionOrdering: props.echoMemberSectionOrdering,
      roleSectionsLen: roleSections.value.length,
      sections: roleSections.value.map((s) => ({
        role: s.role.name,
        id: s.role.id,
        listSortKey: s.role.listSortKey,
        isUnhoistedBucket: s.role.isUnhoistedBucket,
        count: s.members.length,
      })),
    };
  },
  (v) => {
    if (!v) return;
    dbgMemberList('MemberList.vue', v as Record<string, unknown>);
    memberPanelDiag('MemberList:render', v as Record<string, unknown>);
  },
  { immediate: true },
);

function statusLabel(status: string | undefined): string {
  return selectPresence({ rowStatus: status }).label;
}

function subtitleText(user: User): string {
  const custom = user.customStatus?.trim();
  if (custom) return custom;
  // Show last online for offline users if available
  const lastOnline = props.lastOnlineAtByUserId?.[user.id];
  if (lastOnline && user.status === 'offline') {
    return `Last online ${formatLastOnline(lastOnline)}`;
  }
  return statusLabel(user.status);
}

function formatLastOnline(isoTimestamp: string): string {
  const date = new Date(isoTimestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function hasCustomProfilePhoto(user: User): boolean {
  if (!isTrustedMediaUrl(user.pfp)) return false;
  const normalized = safeImageUrl(user.pfp);
  return normalized !== icons.usersAvatar && normalized !== userAvatars.u1;
}

function activeCommunicationTimeoutUntil(userId: string): number | null {
  const serverId = props.serverId?.trim();
  if (!serverId || serverId === 'echo') return null;
  const epochMs = workspace.timeoutUntilByServerUser.value[serverId]?.[userId];
  if (!epochMs || epochMs <= Date.now()) return null;
  return epochMs;
}

function formatTimeoutRemaining(epochMs: number): string {
  const seconds = Math.max(0, Math.ceil((epochMs - Date.now()) / 1000));
  if (seconds >= 86_400) return `${Math.ceil(seconds / 86_400)}d left`;
  if (seconds >= 3_600) return `${Math.ceil(seconds / 3_600)}h left`;
  if (seconds >= 60) return `${Math.ceil(seconds / 60)}m left`;
  return `${seconds}s left`;
}

function isUserCommunicationTimedOut(userId: string): boolean {
  return activeCommunicationTimeoutUntil(userId) !== null;
}

function contextUserHasActiveTimeout(): boolean {
  const userId = contextUser.value?.id;
  if (!userId) return false;
  return isUserCommunicationTimedOut(userId);
}

function subtitleTextWithTimeout(user: User): string {
  const timeoutUntil = activeCommunicationTimeoutUntil(user.id);
  if (timeoutUntil != null) {
    return `Timed out, ${formatTimeoutRemaining(timeoutUntil)}`;
  }
  return subtitleText(user);
}

function toggleShowGuests() {
  emit('update:showGuests', !props.showGuests);
}

async function handleMemberContextMenu(user: User, e: MouseEvent) {
  contextUser.value = user;
  await openAtEvent(e);
}

function anchorRectForContextUser(): ReturnType<typeof getPopoutAnchorRect> {
  const u = contextUser.value;
  if (!u) return null;
  const row = document.querySelector(
    `[data-member-id="${u.id}"]`,
  ) as HTMLElement | null;
  const anchorTarget =
    (row?.querySelector('.avatar-wrap') as HTMLElement | null) ??
    (row?.querySelector('.member-pfp') as HTMLElement | null) ??
    row;
  return anchorTarget ? getPopoutAnchorRect(anchorTarget, 'member-list') : null;
}

function openProfileFromContext() {
  const u = contextUser.value;
  if (!u) return;
  closeMenu();
  emit('open-profile', {
    userId: u.id,
    anchorRect: anchorRectForContextUser(),
    fromContextMenu: true,
  });
}

function openRolesPanelFromContext() {
  const u = contextUser.value;
  if (!u || !props.roleManagement?.enabled) return;
  closeMenu();
  emit('open-profile', {
    userId: u.id,
    anchorRect: anchorRectForContextUser(),
    rolesPanel: true,
  });
}

function changeNicknameFromContext() {
  const u = contextUser.value;
  if (
    !u ||
    !props.onChangeMemberNickname ||
    !props.canChangeMemberNickname?.(u.id)
  )
    return;
  closeMenu();
  props.onChangeMemberNickname(u.id);
}

function messageUserFromContext() {
  const u = contextUser.value;
  if (!u || u.id === props.currentUserId) return;
  closeMenu();
  props.onMessageUser?.(u.id);
}

function mentionUserFromContext() {
  const u = contextUser.value;
  const fn = composerInsertUserMention?.value;
  if (!u || !fn || isSelf.value) return;
  closeMenu();
  fn({ userId: u.id, displayName: u.name });
}

function copyUserIdFromContext() {
  const u = contextUser.value;
  if (!u) return;
  copyToClipboard(linkTokenUser(u.id));
  closeMenu();
}

function moderateFromContext(action: 'kick' | 'ban' | 'timeout') {
  const u = contextUser.value;
  if (!u || !props.onModerateUser) return;
  closeMenu();
  props.onModerateUser({
    action,
    targetUserId: u.id,
    ...(action === 'timeout' ? { timeoutMinutes: 60 } : {}),
  });
}

function handleOpenProfile(userId: string, event: MouseEvent) {
  const row = event.currentTarget as HTMLElement | null;
  const anchorTarget =
    row?.querySelector('.avatar-wrap') ??
    row?.querySelector('.member-pfp') ??
    row;

  emit('open-profile', {
    userId,
    anchorRect: getPopoutAnchorRect(anchorTarget, 'member-list'),
  });
}
</script>

<template>
  <div
    class="member-list-panel group/member relative flex min-h-0 min-w-0 flex-col bg-transparent"
  >
    <div
      v-show="!collapsed"
      class="flex min-h-0 min-w-0 flex-1 touch-pan-y flex-col bg-transparent"
    >
      <div
        class="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto overscroll-y-contain px-4 pt-14 custom-scrollbar"
        v-scrollbar-on-scroll
      >
        <template v-if="showMemberSkeleton">
          <div
            v-for="sk in skeletonSections"
            :key="sk.key"
            class="mb-4"
            aria-hidden="true"
          >
            <div
              class="member-skeleton member-skeleton-pulse mb-2 h-3 rounded"
              :style="{ width: sk.headerWidth }"
            />
            <div class="flex flex-col gap-1">
              <div
                v-for="(w, i) in sk.rowWidths"
                :key="i"
                class="flex items-center gap-3 p-2"
              >
                <div
                  class="member-skeleton member-skeleton-pulse h-8 w-8 shrink-0 rounded-full"
                />
                <div class="min-w-0 flex-1">
                  <div
                    class="member-skeleton member-skeleton-pulse h-3 rounded"
                    :style="{ width: w }"
                  />
                  <div
                    class="member-skeleton member-skeleton-pulse mt-1.5 h-2 w-1/3 rounded"
                  />
                </div>
              </div>
            </div>
          </div>
        </template>
        <div
          v-for="section in roleSections"
          :key="section.role.id"
          class="mb-4"
        >
          <div
            class="font-semibold text-xs uppercase tracking-wider mb-2 flex items-center gap-2"
            :style="{ color: section.role.color }"
          >
            <span
              class="h-2 w-2 shrink-0 rounded-full"
              :style="{ backgroundColor: section.role.color }"
              :title="`${section.role.name} role color`"
              aria-hidden="true"
            />
            <PausedGifAvatar
              v-if="sectionRoleIconSrc(section.role)"
              :src="sectionRoleIconSrc(section.role)"
              alt=""
              :session-key="`ml-hdr-${section.role.id}`"
              wrapper-class="relative h-3.5 w-3.5 shrink-0 overflow-hidden"
              img-class="h-3.5 w-3.5 shrink-0 rounded object-cover ring-1 ring-white/10"
            />
            {{ section.role.name }} — {{ section.members.length }}
          </div>
          <div class="flex flex-col gap-1">
            <div
              v-for="user in section.members"
              :key="user.id"
              :data-member-id="user.id"
              :class="[
                'flex items-center gap-3 p-2 cursor-pointer rounded-lg hover:bg-glass-tint',
              ]"
              @click="handleOpenProfile(user.id, $event)"
              @contextmenu="handleMemberContextMenu(user, $event)"
            >
              <div class="avatar-wrap relative h-8 w-8 shrink-0">
                <div
                  class="member-pfp-clip h-full w-full overflow-hidden rounded-full"
                >
                  <PausedGifAvatar
                    :src="safeImageUrl(user.pfp)"
                    :alt="user.name"
                    :session-key="user.id"
                    img-class="member-pfp block rounded-full object-cover"
                  />
                </div>
                <StatusIndicator
                  v-if="
                    presenceForUser(user).indicatorStatus ||
                    presenceForUser(user).indicatorDiscordOnline
                  "
                  :status="presenceForUser(user).indicatorStatus"
                  :mobile-surface="presenceForUser(user).indicatorMobileSurface"
                  :discord-online="presenceForUser(user).indicatorDiscordOnline"
                  size="sm"
                />
              </div>
              <div class="min-w-0 flex-1 truncate">
                <div class="flex items-center gap-2 min-w-0">
                  <div
                    class="font-semibold truncate flex min-w-0 flex-1 items-center gap-1"
                    :class="[
                      presenceForUser(user).isOffline ? 'text-muted' : '',
                      presenceForUser(user).discordOnline
                        ? 'discord-active-user'
                        : '',
                    ]"
                    :style="
                      presenceForUser(user).isOffline
                        ? {}
                        : { color: section.role.color }
                    "
                  >
                    <span class="truncate">{{ user.name }}</span>
                    <ServerOwnerCrownIcon
                      v-if="serverOwnerId && user.id === serverOwnerId.trim()"
                    />
                  </div>
                  <span
                    v-if="isUserCommunicationTimedOut(user.id)"
                    class="inline-flex shrink-0 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-200 ring-1 ring-amber-400/20"
                    title="Communication timeout"
                    aria-label="Communication timeout"
                  >
                    Timed out
                  </span>
                </div>
                <div class="text-xs text-muted truncate">
                  {{ subtitleTextWithTimeout(user) }}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div
        v-if="showGuestsToggleVisible"
        class="member-list-guest-toggle shrink-0 border-t border-glass-tint bg-[color-mix(in_srgb,var(--surface-0)_92%,transparent)] px-4 py-2"
      >
        <button
          type="button"
          class="chat-focus-ring w-full rounded-md px-2 py-1.5 text-left text-xs font-medium text-muted hover:bg-glass-tint hover:text-fg"
          :aria-pressed="!!showGuests"
          @click="toggleShowGuests"
        >
          {{
            showGuests
              ? 'Hide guests'
              : `Show ${guestCount} guest${guestCount === 1 ? '' : 's'}`
          }}
        </button>
      </div>
    </div>

    <Teleport to="body">
      <div
        v-if="menuOpen && contextUser"
        ref="menuRef"
        class="ellipsis-menu fixed z-[100] min-w-[220px] py-1"
        :style="{
          left: `${menuPosition.left}px`,
          top: `${menuPosition.top}px`,
        }"
        role="menu"
        @contextmenu.prevent
      >
        <button
          type="button"
          :class="MENU_ITEM"
          role="menuitem"
          @click="openProfileFromContext"
        >
          <img
            :src="icons.profileView"
            alt=""
            class="h-4 w-4 shrink-0 opacity-80 filter invert"
          />
          Profile
        </button>
        <button
          v-if="showMentionInChat && !isSelf"
          type="button"
          :class="MENU_ITEM"
          role="menuitem"
          @click="mentionUserFromContext"
        >
          <span
            class="flex h-4 w-4 shrink-0 items-center justify-center text-[11px] font-bold text-foreground"
            aria-hidden="true"
            >@</span
          >
          Direct mention
        </button>
        <button
          v-if="!isSelf && onMessageUser"
          type="button"
          :class="MENU_ITEM"
          role="menuitem"
          @click="messageUserFromContext"
        >
          <img
            :src="icons.message"
            alt=""
            class="h-4 w-4 shrink-0 opacity-80 filter invert"
          />
          Message
        </button>
        <button
          v-if="showChangeNickname"
          type="button"
          :class="MENU_ITEM"
          role="menuitem"
          @click="changeNicknameFromContext"
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
              d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
            />
          </svg>
          Change nickname
        </button>
        <button
          v-if="roleManagementUiVisible"
          type="button"
          :class="MENU_ITEM"
          role="menuitem"
          @click="openRolesPanelFromContext"
        >
          <svg
            class="h-4 w-4 shrink-0 text-accent"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
            />
          </svg>
          Roles
        </button>
        <div
          v-if="showAnyModAction"
          class="my-1 border-t border-border"
          role="separator"
        />
        <button
          v-if="showKick"
          type="button"
          :class="MENU_ITEM_KICK"
          role="menuitem"
          @click="moderateFromContext('kick')"
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
          Kick from server
        </button>
        <button
          v-if="showBan"
          type="button"
          :class="MENU_ITEM_BAN"
          role="menuitem"
          @click="moderateFromContext('ban')"
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
              d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"
            />
          </svg>
          Ban from server
        </button>
        <button
          v-if="showTimeout"
          type="button"
          :class="MENU_ITEM_TIMEOUT"
          role="menuitem"
          @click="moderateFromContext('timeout')"
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
              d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          {{
            contextUserHasActiveTimeout() ? 'Remove timeout' : 'Timeout (1h)'
          }}
        </button>
        <template v-if="devModeIdsEnabled">
          <div class="my-1 border-t border-border" role="separator" />
          <button
            type="button"
            :class="MENU_ITEM"
            role="menuitem"
            @click="copyUserIdFromContext"
          >
            <svg
              class="h-4 w-4 shrink-0 text-muted"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
              />
            </svg>
            Copy user ID
          </button>
        </template>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.avatar-wrap {
  width: 2rem;
  height: 2rem;
  overflow: visible;
}

.member-pfp-clip {
  overflow: hidden;
  border-radius: 9999px;
}

.avatar-wrap :deep(.status-indicator) {
  right: -3px;
  bottom: -3px;
}

/* Discord active users get a subtle blue tint on their name */
.discord-active-user {
  text-shadow: 0 0 8px rgba(88, 101, 242, 0.4);
}

/* First-load placeholder blocks (pfp circles + name/subtitle bars). */
.member-skeleton {
  background: color-mix(in srgb, var(--text) 11%, transparent);
}

.member-skeleton-pulse {
  animation: member-skeleton-pulse 1.4s ease-in-out infinite;
}

@keyframes member-skeleton-pulse {
  0%,
  100% {
    opacity: 0.45;
  }
  50% {
    opacity: 0.9;
  }
}

@media (prefers-reduced-motion: reduce) {
  .member-skeleton-pulse {
    animation: none;
    opacity: 0.6;
  }
}
</style>
