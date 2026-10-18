<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import {
  isTrustedMediaUrl,
  safeImageUrl,
} from '@/features/layout/display/safeImageUrl';
import { icons } from '@/assets/icons';
import {
  getPopoutAnchorRect,
  ROLE_HIERARCHY,
  type PopoutAnchorRect,
} from '@/features/member-profile/memberProfiles';
import { memberRoleIconImgSrc } from '@/features/member-profile/memberRoleIconDisplay';
import { selectPresence } from '@/features/layout/presence';
import { copyToClipboard } from '@/features/chat/copyToClipboard';
import PausedGifAvatar from '@/components/PausedGifAvatar.vue';
import ServerOwnerCrownIcon from '@/features/layout/ServerOwnerCrownIcon.vue';

export type ServerSettingsMemberRow = {
  id: string;
  name: string;
  pfp: string;
  status?: string;
  isDiscordShadow?: boolean;
  isGuest?: boolean;
};

/** Matches `MemberRole` from the main member list / `pickEchoMemberListSectionRole`. */
type SettingsResolvedMemberRole = {
  id?: string;
  name: string;
  color?: string;
  iconUrl?: string | null;
  iconEmojiId?: string | null;
  /** Echo: `echo_roles.position` — same ordering as Roles settings (higher = earlier). */
  listSortKey?: number;
  isUnhoistedBucket?: boolean;
};

export type ServerSettingsOpenMemberPayload = {
  userId: string;
  anchorRect?: PopoutAnchorRect | null;
  /** Open the member popout directly on the role assignment panel. */
  rolesPanel?: boolean;
};

const props = defineProps<{
  members: ServerSettingsMemberRow[];
  currentUserId?: string | null;
  ownerId?: string | null;
  resolveHighestRole?: (
    userId: string,
  ) => SettingsResolvedMemberRole | null | undefined;
  canModerateMemberAction?: (
    targetUserId: string,
    action: 'kick' | 'ban' | 'timeout',
  ) => boolean;
  onRequestModerateMember?: (payload: {
    targetUserId: string;
    action: 'kick' | 'ban' | 'timeout';
  }) => void;
  /** Open member profile / roles panel (member list popout). */
  onOpenMember?: (payload: ServerSettingsOpenMemberPayload) => void;
  /** When true, show Manage roles for Echo members (not import placeholders). */
  canAssignMemberRoles?: boolean;
}>();

const searchQuery = ref('');
const membersTab = ref<'echo' | 'ghosts'>('echo');
const copyFeedbackId = ref<string | null>(null);
const openMenuUserId = ref<string | null>(null);
let copyTimer: ReturnType<typeof setTimeout> | null = null;

function closeMemberMenu() {
  openMenuUserId.value = null;
}

function onDocumentPointerDown(ev: PointerEvent) {
  if (!openMenuUserId.value) return;
  const t = ev.target;
  if (!(t instanceof Element)) {
    closeMemberMenu();
    return;
  }
  if (t.closest('[data-ss-member-menu]')) return;
  closeMemberMenu();
}

onMounted(() => {
  document.addEventListener('pointerdown', onDocumentPointerDown, true);
});
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDocumentPointerDown, true);
  if (copyTimer) clearTimeout(copyTimer);
});

const q = computed(() => searchQuery.value.trim().toLowerCase());

function matchesSearch(m: ServerSettingsMemberRow): boolean {
  if (!q.value) return true;
  return (
    m.name.toLowerCase().includes(q.value) ||
    m.id.toLowerCase().includes(q.value)
  );
}

const realMembers = computed(() =>
  props.members.filter((m) => !m.isDiscordShadow && matchesSearch(m)),
);

const discordGhosts = computed(() =>
  props.members.filter((m) => !!m.isDiscordShadow && matchesSearch(m)),
);

function roleFor(userId: string): SettingsResolvedMemberRole | null {
  return props.resolveHighestRole?.(userId) ?? null;
}

function roleIconSrcForUser(userId: string): string {
  const r = roleFor(userId);
  return memberRoleIconImgSrc({
    iconUrl: r?.iconUrl,
    iconEmojiId: r?.iconEmojiId,
  });
}

function isMembersBucket(r: SettingsResolvedMemberRole | null): boolean {
  return !!r?.isUnhoistedBucket;
}

function mockHierarchyRank(name: string): number {
  const i = ROLE_HIERARCHY.indexOf(name);
  return i === -1 ? ROLE_HIERARCHY.length : i;
}

/**
 * Same section ordering as the channel member list when Echo data is present:
 * Roles tab order = `position` descending; unhoisted “Members” bucket last.
 * Falls back to static {@link ROLE_HIERARCHY} only when `listSortKey` is absent.
 */
function sortEchoMembersNonGuest(
  a: ServerSettingsMemberRow,
  b: ServerSettingsMemberRow,
): number {
  const oa = props.ownerId && a.id === props.ownerId;
  const ob = props.ownerId && b.id === props.ownerId;
  if (oa !== ob) return oa ? -1 : 1;
  const ra = roleFor(a.id);
  const rb = roleFor(b.id);

  const ua = isMembersBucket(ra);
  const ub = isMembersBucket(rb);
  if (ua !== ub) return ua ? 1 : -1;

  const echoPos = (r: SettingsResolvedMemberRole | null): number | null => {
    if (!r || r.isUnhoistedBucket) return null;
    if (typeof r.listSortKey === 'number' && Number.isFinite(r.listSortKey)) {
      return r.listSortKey;
    }
    return null;
  };
  const pa = echoPos(ra);
  const pb = echoPos(rb);
  if (pa != null && pb != null && pa !== pb) return pb - pa;
  if (pa != null && pb == null) return -1;
  if (pa == null && pb != null) return 1;

  const orderA = mockHierarchyRank(ra?.name ?? 'Member');
  const orderB = mockHierarchyRank(rb?.name ?? 'Member');
  if (orderA !== orderB) return orderA - orderB;

  const idA = ra?.id ?? '';
  const idB = rb?.id ?? '';
  if (idA !== idB) return idA.localeCompare(idB);

  const hasPfpA = isTrustedMediaUrl(a.pfp);
  const hasPfpB = isTrustedMediaUrl(b.pfp);
  if (hasPfpA !== hasPfpB) return hasPfpA ? -1 : 1;

  return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
}

function sortByName(a: ServerSettingsMemberRow, b: ServerSettingsMemberRow) {
  const hasPfpA = isTrustedMediaUrl(a.pfp);
  const hasPfpB = isTrustedMediaUrl(b.pfp);
  if (hasPfpA !== hasPfpB) return hasPfpA ? -1 : 1;
  return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
}

const echoNonGuestsSorted = computed(() =>
  [...realMembers.value.filter((m) => !m.isGuest)].sort(
    sortEchoMembersNonGuest,
  ),
);

const echoGuestsSorted = computed(() =>
  [...realMembers.value.filter((m) => m.isGuest)].sort(sortByName),
);

const echoGrouped = computed(() => {
  const out: Array<
    | {
        kind: 'header';
        roleName: string;
        color?: string;
        iconSrc: string;
      }
    | { kind: 'member'; m: ServerSettingsMemberRow }
  > = [];
  let lastKey = '';
  for (const m of echoNonGuestsSorted.value) {
    const r = roleFor(m.id);
    const key = r?.id ? `${r.id}:${r.name}` : (r?.name ?? 'Member');
    if (key !== lastKey) {
      lastKey = key;
      out.push({
        kind: 'header',
        roleName: r?.name ?? 'Member',
        color: r?.color,
        iconSrc: memberRoleIconImgSrc({
          iconUrl: r?.iconUrl,
          iconEmojiId: r?.iconEmojiId,
        }),
      });
    }
    out.push({ kind: 'member', m });
  }
  if (echoGuestsSorted.value.length) {
    out.push({
      kind: 'header',
      roleName: 'Guests',
      color: undefined,
      iconSrc: '',
    });
    for (const m of echoGuestsSorted.value) {
      out.push({ kind: 'member', m });
    }
  }
  return out;
});

const ghostsSorted = computed(() => [...discordGhosts.value].sort(sortByName));

const echoVisibleCount = computed(
  () => echoNonGuestsSorted.value.length + echoGuestsSorted.value.length,
);

const ghostVisibleCount = computed(() => discordGhosts.value.length);

const echoTotal = computed(
  () => props.members.filter((x) => !x.isDiscordShadow).length,
);
const ghostTotal = computed(
  () => props.members.filter((x) => x.isDiscordShadow).length,
);

/** Tab badges: full totals when not searching; filtered counts when search is active. */
const echoTabCount = computed(() =>
  q.value ? echoVisibleCount.value : echoTotal.value,
);
const ghostTabCount = computed(() =>
  q.value ? ghostVisibleCount.value : ghostTotal.value,
);

function statusLabel(status: string | undefined): string {
  return selectPresence({ rowStatus: status }).label;
}

function canAct(
  m: ServerSettingsMemberRow,
  action: 'kick' | 'ban' | 'timeout',
): boolean {
  if (!props.canModerateMemberAction || !props.onRequestModerateMember)
    return false;
  return props.canModerateMemberAction(m.id, action);
}

function requestModerate(
  m: ServerSettingsMemberRow,
  action: 'kick' | 'ban' | 'timeout',
) {
  if (!canAct(m, action)) return;
  closeMemberMenu();
  props.onRequestModerateMember?.({ targetUserId: m.id, action });
}

function canOpenMember(m: ServerSettingsMemberRow): boolean {
  return !!props.onOpenMember && !m.isDiscordShadow;
}

function canManageRolesFor(m: ServerSettingsMemberRow): boolean {
  return (
    !!props.canAssignMemberRoles &&
    !!props.onOpenMember &&
    !m.isDiscordShadow &&
    !m.isGuest
  );
}

function hasModActions(m: ServerSettingsMemberRow): boolean {
  return canAct(m, 'kick') || canAct(m, 'timeout') || canAct(m, 'ban');
}

function openMember(
  m: ServerSettingsMemberRow,
  ev: Event,
  opts?: { rolesPanel?: boolean },
) {
  if (opts?.rolesPanel) {
    if (!canManageRolesFor(m)) return;
  } else if (!canOpenMember(m)) {
    return;
  }
  closeMemberMenu();
  const anchorTarget =
    (ev.currentTarget instanceof HTMLElement ? ev.currentTarget : null) ??
    (ev.target instanceof HTMLElement ? ev.target : null);
  props.onOpenMember?.({
    userId: m.id,
    anchorRect: getPopoutAnchorRect(anchorTarget, 'generic'),
    rolesPanel: opts?.rolesPanel === true,
  });
}

function toggleMemberMenu(userId: string) {
  openMenuUserId.value = openMenuUserId.value === userId ? null : userId;
}

async function copyUserId(id: string) {
  const ok = await copyToClipboard(id);
  closeMemberMenu();
  if (ok) {
    copyFeedbackId.value = id;
    if (copyTimer) clearTimeout(copyTimer);
    copyTimer = setTimeout(() => {
      copyFeedbackId.value = null;
      copyTimer = null;
    }, 1600);
    return;
  }
  window.prompt('Copy user ID:', id);
}

const ACTION_BTN =
  'inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[11px] font-semibold text-fg-soft transition-colors hover:bg-glass-hover hover:text-fg focus:outline-none focus-visible:ring-2 focus-visible:ring-border';
const ICON_BTN =
  'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-fg-soft transition-colors hover:bg-glass-hover hover:text-fg focus:outline-none focus-visible:ring-2 focus-visible:ring-border';
</script>

<template>
  <div
    class="server-settings-members flex min-h-0 min-w-0 flex-1 flex-col gap-5"
  >
    <div class="flex min-h-0 min-w-0 flex-1 flex-col gap-5">
      <div class="flex flex-wrap items-center gap-3">
        <div class="roles-toolbar min-w-0 flex-1 rounded-xl py-1 pl-1 pr-2">
          <input
            v-model="searchQuery"
            class="roles-toolbar-search min-w-0 flex-1 px-2 py-2"
            type="search"
            placeholder="Search name or ID"
            autocomplete="off"
          />
        </div>
        <span class="shrink-0 text-xs text-fg-subtle">{{
          q
            ? `${echoVisibleCount + ghostVisibleCount} match${
                echoVisibleCount + ghostVisibleCount === 1 ? '' : 'es'
              }`
            : `${members.length} total`
        }}</span>
      </div>

      <div
        class="flex shrink-0 flex-wrap gap-1.5"
        role="tablist"
        aria-label="Member type"
      >
        <button
          type="button"
          role="tab"
          :aria-selected="membersTab === 'echo'"
          class="server-settings-nav-item rounded-xl px-4 py-2.5 text-left text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-border"
          :class="
            membersTab === 'echo'
              ? 'server-settings-nav-item--active'
              : 'text-fg-soft hover:bg-glass-hover hover:text-fg'
          "
          @click="membersTab = 'echo'"
        >
          Echo members
          <span class="ml-1 text-fg-subtle">({{ echoTabCount }})</span>
        </button>
        <button
          type="button"
          role="tab"
          :aria-selected="membersTab === 'ghosts'"
          class="server-settings-nav-item rounded-xl px-4 py-2.5 text-left text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-border"
          :class="
            membersTab === 'ghosts'
              ? 'server-settings-nav-item--active'
              : 'text-fg-soft hover:bg-glass-hover hover:text-fg'
          "
          @click="membersTab = 'ghosts'"
        >
          Import placeholders
          <span class="ml-1 text-fg-subtle">({{ ghostTabCount }})</span>
        </button>
      </div>

      <!-- Echo members -->
      <div
        v-show="membersTab === 'echo'"
        class="server-settings-members__list custom-scrollbar min-h-0 flex-1 overflow-y-auto rounded-2xl"
      >
        <div class="flex flex-col gap-1.5 px-1 py-2 sm:px-2">
          <template
            v-for="(item, idx) in echoGrouped"
            :key="
              item.kind === 'header'
                ? `h-${item.roleName}-${idx}`
                : `m-${item.m.id}`
            "
          >
            <div
              v-if="item.kind === 'header'"
              class="server-settings-members__role-header flex items-center gap-2.5 px-2 pb-1 pt-4 first:pt-0"
            >
              <span
                class="inline-block h-2 w-2 shrink-0 rounded-full"
                :style="{
                  backgroundColor:
                    item.color || 'color-mix(in srgb, white 35%, transparent)',
                }"
              />
              <PausedGifAvatar
                v-if="item.iconSrc"
                :src="item.iconSrc"
                alt=""
                :session-key="`ss-rolehdr-${item.roleName}-${idx}`"
                wrapper-class="relative h-4 w-4 shrink-0 overflow-hidden"
                img-class="h-4 w-4 shrink-0 rounded object-cover ring-1 ring-white/10"
              />
              <span
                class="text-[11px] font-semibold uppercase tracking-[0.14em] text-fg-subtle"
                >{{ item.roleName }}</span
              >
            </div>
            <div
              v-else
              class="server-settings-members__row flex flex-wrap items-center gap-3 rounded-xl px-3 py-3.5 [-webkit-tap-highlight-color:transparent] sm:px-4"
              :class="{
                'server-settings-members__row--interactive': canOpenMember(
                  item.m,
                ),
              }"
            >
              <button
                type="button"
                class="flex min-w-0 flex-1 items-center gap-3 rounded-lg text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-border"
                :disabled="!canOpenMember(item.m)"
                :title="canOpenMember(item.m) ? 'Open profile' : undefined"
                @click="openMember(item.m, $event)"
              >
                <img
                  :src="safeImageUrl(item.m.pfp)"
                  alt=""
                  class="h-9 w-9 shrink-0 rounded-full bg-glass-1 object-cover"
                />
                <div class="min-w-0 flex-1">
                  <div class="flex flex-wrap items-center gap-2">
                    <PausedGifAvatar
                      v-if="roleIconSrcForUser(item.m.id)"
                      :src="roleIconSrcForUser(item.m.id)"
                      alt=""
                      :session-key="`ss-role-${item.m.id}`"
                      wrapper-class="relative h-4 w-4 shrink-0 overflow-hidden"
                      img-class="h-4 w-4 shrink-0 rounded object-cover ring-1 ring-white/10"
                    />
                    <span class="truncate font-semibold text-fg-strong">{{
                      item.m.name
                    }}</span>
                    <ServerOwnerCrownIcon
                      v-if="ownerId && item.m.id === ownerId"
                    />
                    <span
                      v-if="currentUserId && item.m.id === currentUserId"
                      class="server-settings-members__meta-tag shrink-0 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-fg-soft"
                    >
                      You
                    </span>
                    <span
                      v-if="item.m.isGuest"
                      class="server-settings-members__meta-tag shrink-0 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-fg-soft"
                    >
                      Guest
                    </span>
                  </div>
                  <div class="mt-0.5 text-xs text-fg-subtle">
                    {{ statusLabel(item.m.status) }}
                    <span v-if="roleFor(item.m.id)?.name" class="text-fg-soft">
                      · {{ roleFor(item.m.id)?.name }}
                    </span>
                  </div>
                </div>
              </button>

              <div
                class="relative flex shrink-0 flex-wrap items-center justify-end gap-1"
                data-ss-member-menu
              >
                <button
                  v-if="canManageRolesFor(item.m)"
                  type="button"
                  :class="ACTION_BTN"
                  title="Manage roles"
                  @click="openMember(item.m, $event, { rolesPanel: true })"
                >
                  <img
                    :src="icons.shield"
                    alt=""
                    class="h-3.5 w-3.5 opacity-90 filter invert"
                  />
                  Roles
                </button>
                <button
                  type="button"
                  :class="ICON_BTN"
                  title="More actions"
                  aria-label="More actions"
                  :aria-expanded="openMenuUserId === item.m.id"
                  @click.stop="toggleMemberMenu(item.m.id)"
                >
                  <img
                    :src="icons.moreVertical"
                    alt=""
                    class="h-4 w-4 opacity-90 filter invert"
                  />
                </button>
                <div
                  v-if="openMenuUserId === item.m.id"
                  class="server-settings-members__menu absolute right-0 top-full z-20 mt-1 min-w-[11rem] overflow-hidden rounded-xl border border-border bg-[var(--bg)] py-1 shadow-xl"
                  role="menu"
                >
                  <button
                    v-if="canOpenMember(item.m)"
                    type="button"
                    class="server-settings-members__menu-item"
                    role="menuitem"
                    @click="openMember(item.m, $event)"
                  >
                    View profile
                  </button>
                  <button
                    v-if="canManageRolesFor(item.m)"
                    type="button"
                    class="server-settings-members__menu-item"
                    role="menuitem"
                    @click="openMember(item.m, $event, { rolesPanel: true })"
                  >
                    Manage roles
                  </button>
                  <button
                    type="button"
                    class="server-settings-members__menu-item"
                    role="menuitem"
                    @click="copyUserId(item.m.id)"
                  >
                    {{
                      copyFeedbackId === item.m.id
                        ? 'Copied ID'
                        : 'Copy user ID'
                    }}
                  </button>
                  <template v-if="hasModActions(item.m)">
                    <div class="my-1 border-t border-border" role="separator" />
                    <button
                      type="button"
                      class="server-settings-members__menu-item"
                      role="menuitem"
                      :disabled="!canAct(item.m, 'kick')"
                      @click="requestModerate(item.m, 'kick')"
                    >
                      Kick
                    </button>
                    <button
                      type="button"
                      class="server-settings-members__menu-item"
                      role="menuitem"
                      :disabled="!canAct(item.m, 'timeout')"
                      @click="requestModerate(item.m, 'timeout')"
                    >
                      Timeout
                    </button>
                    <button
                      type="button"
                      class="server-settings-members__menu-item server-settings-members__menu-item--danger"
                      role="menuitem"
                      :disabled="!canAct(item.m, 'ban')"
                      @click="requestModerate(item.m, 'ban')"
                    >
                      Ban
                    </button>
                  </template>
                </div>
              </div>
            </div>
          </template>
        </div>
        <div
          v-if="!echoVisibleCount"
          class="px-4 py-12 text-center text-sm text-fg-subtle"
        >
          {{
            !members.length
              ? 'No members.'
              : q
                ? 'No matches.'
                : 'No Echo members yet.'
          }}
        </div>
      </div>

      <!-- Discord import placeholders -->
      <div
        v-show="membersTab === 'ghosts'"
        class="server-settings-members__list custom-scrollbar min-h-0 flex-1 overflow-y-auto rounded-2xl"
      >
        <div class="flex flex-col gap-1.5 px-1 py-2 sm:px-2">
          <div
            v-for="m in ghostsSorted"
            :key="m.id"
            class="server-settings-members__row flex flex-wrap items-center gap-3 rounded-xl px-3 py-3.5 [-webkit-tap-highlight-color:transparent] sm:px-4"
          >
            <img
              :src="safeImageUrl(m.pfp)"
              alt=""
              class="h-9 w-9 shrink-0 rounded-full bg-glass-1 object-cover opacity-90"
            />
            <div class="min-w-0 flex-1">
              <div class="flex flex-wrap items-center gap-2">
                <span class="truncate font-semibold text-fg">{{ m.name }}</span>
                <span
                  class="server-settings-members__meta-tag shrink-0 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-fg-soft"
                >
                  Import
                </span>
                <ServerOwnerCrownIcon v-if="ownerId && m.id === ownerId" />
              </div>
              <div class="mt-0.5 text-xs text-fg-subtle">
                {{ statusLabel(m.status) }}
              </div>
            </div>
            <div
              class="relative flex shrink-0 flex-wrap items-center justify-end gap-1"
              data-ss-member-menu
            >
              <button
                type="button"
                :class="ACTION_BTN"
                @click="copyUserId(m.id)"
              >
                {{ copyFeedbackId === m.id ? 'Copied' : 'Copy ID' }}
              </button>
              <button
                v-if="hasModActions(m)"
                type="button"
                :class="ICON_BTN"
                title="More actions"
                aria-label="More actions"
                :aria-expanded="openMenuUserId === m.id"
                @click.stop="toggleMemberMenu(m.id)"
              >
                <img
                  :src="icons.moreVertical"
                  alt=""
                  class="h-4 w-4 opacity-90 filter invert"
                />
              </button>
              <div
                v-if="openMenuUserId === m.id"
                class="server-settings-members__menu absolute right-0 top-full z-20 mt-1 min-w-[11rem] overflow-hidden rounded-xl border border-border bg-[var(--bg)] py-1 shadow-xl"
                role="menu"
              >
                <button
                  type="button"
                  class="server-settings-members__menu-item"
                  role="menuitem"
                  :disabled="!canAct(m, 'kick')"
                  @click="requestModerate(m, 'kick')"
                >
                  Kick
                </button>
                <button
                  type="button"
                  class="server-settings-members__menu-item"
                  role="menuitem"
                  :disabled="!canAct(m, 'timeout')"
                  @click="requestModerate(m, 'timeout')"
                >
                  Timeout
                </button>
                <button
                  type="button"
                  class="server-settings-members__menu-item server-settings-members__menu-item--danger"
                  role="menuitem"
                  :disabled="!canAct(m, 'ban')"
                  @click="requestModerate(m, 'ban')"
                >
                  Ban
                </button>
              </div>
            </div>
          </div>
        </div>
        <div
          v-if="!ghostsSorted.length"
          class="px-4 py-12 text-center text-sm text-fg-subtle"
        >
          {{ ghostTotal ? 'No matches.' : 'No import placeholders.' }}
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
/* Neutral row chrome: avoids tint from layered panels (no stray blue/purple). */
.server-settings-members__row {
  background-color: transparent;
  transition: background-color 0.12s ease;
}

@media (hover: hover) and (pointer: fine) {
  .server-settings-members__row:hover,
  .server-settings-members__row--interactive:hover {
    background-color: color-mix(in srgb, white 4.5%, transparent);
  }
}

.server-settings-members__role-header {
  background-color: transparent;
}

.server-settings-members__meta-tag {
  background: transparent !important;
  box-shadow: none !important;
  border-radius: 0 !important;
}

.server-settings-members__menu-item {
  display: block;
  width: 100%;
  padding: 0.55rem 0.85rem;
  text-align: left;
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--fg-soft);
  transition:
    background-color 0.1s ease,
    color 0.1s ease;
}

.server-settings-members__menu-item:hover:not(:disabled) {
  background-color: color-mix(in srgb, white 6%, transparent);
  color: var(--fg);
}

.server-settings-members__menu-item:disabled {
  cursor: not-allowed;
  opacity: 0.35;
}

.server-settings-members__menu-item--danger:hover:not(:disabled) {
  color: var(--echo-palette-f87171-1a75);
}

:global([data-theme='light'] .server-settings-members__role-header) {
  background-color: transparent;
}

:global([data-theme='light'] .server-settings-members__row:hover) {
  background-color: color-mix(in srgb, black 4%, transparent);
}

:global(
  [data-theme='light'] .server-settings-members__menu-item:hover:not(:disabled)
) {
  background-color: color-mix(in srgb, black 5%, transparent);
}
</style>
