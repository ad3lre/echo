<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import {
  roleHierarchyDisplayRank,
  type MemberProfile,
  type PopoutAnchorRect,
} from '@/utils/memberProfiles';
import { profileBannerRefractionBackdropStyle } from '@/utils/profileBannerGradientFromImage';
import MemberProfileHeader from './member-profile/MemberProfileHeader.vue';
import MemberProfileContent from './member-profile/MemberProfileContent.vue';
import MemberProfileRolePanel from './member-profile/MemberProfileRolePanel.vue';
import UserProfileMoreMenu from '@/components/UserProfileMoreMenu.vue';
import type { MemberRoleManagementSpec } from '@/components/MemberList.vue';
import { icons } from '@/assets/icons';
import { useCompactShell } from '@/composables/useCompactShell';

const props = withDefaults(
  defineProps<{
    modelValue: boolean;
    profile: MemberProfile | null;
    anchor: PopoutAnchorRect | null;
    note: string;
    /**
     * When true (e.g. member list → Roles context menu): show only the Manage Roles panel near `anchor`,
     * not the quick profile card. Still uses the same overlay + close behavior.
     */
    openRolesPanelWithProfile?: boolean;
    roleManagement?: MemberRoleManagementSpec | null;
    /** Signed-in user id — hides safety menu on your own popout. */
    currentUserId?: string;
    isTargetBlocked?: boolean;
    /** Accepted friendship with the viewed member (Echo / workspace). */
    isFriend?: boolean;
    /** Friendship data is loaded and viewer can send a request to this member. */
    canSendFriendRequest?: boolean;
    /** DM inbox / rail: hide server “Roles” (e.g. Direct Contact) in quick profile. */
    hideGuildRolesSection?: boolean;
  }>(),
  {
    isTargetBlocked: false,
    isFriend: false,
    canSendFriendRequest: false,
    hideGuildRolesSection: false,
  },
);

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  'update:note': [value: string];
  'open-full-profile': [];
  /** Open DM tab / thread for the viewed member (from ⋮ menu). */
  'open-dm': [userId: string];
  'block-user': [userId: string];
  'unblock-user': [userId: string];
  'remove-friend': [userId: string];
  'send-friend-request': [userId: string];
  'report-user': [payload: { userId: string; reason: string }];
  'quick-dm': [text: string];
}>();

const rolePanelOpen = ref(false);
const roleTriggerRef = ref<HTMLElement | null>(null);
const rolePopupPanelRef = ref<InstanceType<
  typeof MemberProfileRolePanel
> | null>(null);
const contentRef = ref<InstanceType<typeof MemberProfileContent> | null>(null);
const popoutArticleRef = ref<HTMLElement | null>(null);
const popoutMeasuredHeight = ref(0);
const popoutDisplayNameOverflowPx = ref(0);
const rolePopupLayoutTick = ref(0);
const { isCompactShell } = useCompactShell();
let popoutResizeObserver: ResizeObserver | null = null;
let popoutHeightResizeObserver: ResizeObserver | null = null;
let popoutDisplayNameResizeObserver: ResizeObserver | null = null;

function disconnectPopoutHeightResizeObserver() {
  popoutHeightResizeObserver?.disconnect();
  popoutHeightResizeObserver = null;
}

function disconnectPopoutDisplayNameResizeObserver() {
  popoutDisplayNameResizeObserver?.disconnect();
  popoutDisplayNameResizeObserver = null;
}

function updateDisplayNameOverflowMeasure() {
  const heading = popoutArticleRef.value?.querySelector(
    '.member-popout__display-name',
  ) as HTMLElement | null;
  if (!heading) {
    popoutDisplayNameOverflowPx.value = 0;
    return;
  }
  // Positive when the title is visually truncated by `truncate` (ellipsis).
  const overflowPx = Math.max(0, heading.scrollWidth - heading.clientWidth);
  popoutDisplayNameOverflowPx.value = overflowPx;
}

const rolesStandaloneUi = computed(
  () => !!(props.openRolesPanelWithProfile && props.roleManagement?.enabled),
);

const quickDmEnabled = computed(
  () =>
    !!props.currentUserId &&
    !!props.profile &&
    props.profile.id !== props.currentUserId &&
    !props.profile.isDiscordShadow &&
    !props.isTargetBlocked,
);

const showFriendsBadge = computed(
  () =>
    !!props.isFriend &&
    !!props.profile &&
    !!props.currentUserId &&
    props.profile.id !== props.currentUserId &&
    !props.profile.isDiscordShadow,
);

/** Banner action button for “Add friend”; ⋮ omits duplicate when this is true. */
const showBannerAddFriendButton = computed(
  () =>
    !!props.canSendFriendRequest &&
    !!props.currentUserId &&
    !!props.profile &&
    props.profile.id !== props.currentUserId &&
    !props.isFriend &&
    !props.isTargetBlocked &&
    !props.profile.isDiscordShadow,
);

const showProfileMoreMenu = computed(
  () =>
    !!props.currentUserId &&
    !!props.profile &&
    props.profile.id !== props.currentUserId,
);

/** Compact shell quick profile (bottom sheet): full-width control for the same actions as ⋮ / member-list right-click. */
const showCompactPersonSettingsRow = computed(
  () =>
    isCompactShell.value &&
    showProfileMoreMenu.value &&
    !rolesStandaloneUi.value,
);

const profileMoreMenuRef = ref<InstanceType<typeof UserProfileMoreMenu> | null>(
  null,
);

function onCompactPersonSettingsClick(ev: MouseEvent) {
  const el = ev.currentTarget;
  if (!(el instanceof HTMLElement)) return;
  profileMoreMenuRef.value?.toggleMenu(el);
}

const canSendFriendRequestInEllipsisMenu = computed(
  () =>
    !!props.canSendFriendRequest &&
    !showBannerAddFriendButton.value &&
    !props.isFriend &&
    !props.isTargetBlocked &&
    !props.profile?.isDiscordShadow,
);

function disconnectPopoutResizeObserver() {
  popoutResizeObserver?.disconnect();
  popoutResizeObserver = null;
}

const assignedRoleIds = computed(() => {
  const rm = props.roleManagement;
  const p = props.profile;
  if (!rm || !p) return [];
  return rm.resolveAssignedRoleIds(p.id);
});

// Optimistic local state for immediate UI feedback when toggling roles.
const optimisticAssign = ref<Record<string, boolean>>({});
const pendingRoleIds = ref(new Set<string>());

const displayedRoles = computed(() => {
  const p = props.profile;
  if (!p) return [];
  const rm = props.roleManagement;
  if (rm && rm.enabled) {
    const ids = rm.resolveAssignedRoleIds(p.id);
    const byId = new Map(rm.assignableRoles.map((r) => [r.id, r]));
    const rows = ids
      .map((id) => byId.get(id))
      .filter((r): r is (typeof rm.assignableRoles)[number] => !!r)
      .map((r) => ({
        id: r.id,
        name: r.name === '@everyone' ? 'Member' : r.name,
        color: r.color,
        darkColor: r.darkColor,
        lightColor: r.lightColor,
        separateThemeColors: r.separateThemeColors,
        iconUrl: r.roleIconUrl ?? null,
        rank: roleHierarchyDisplayRank(r.name, r.position),
      }))
      .sort((a, b) => b.rank - a.rank);
    if (rows.length > 0)
      return rows.map(({ rank: _r, ...rest }) => ({
        id: rest.id,
        name: rest.name,
        color: rest.color,
        darkColor: rest.darkColor,
        lightColor: rest.lightColor,
        separateThemeColors: rest.separateThemeColors,
        iconUrl: rest.iconUrl,
      }));
  }
  const fallback = (p.roles ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    color: r.color,
    iconUrl: r.iconUrl ?? null,
    rank: roleHierarchyDisplayRank(r.name),
  }));
  fallback.sort((a, b) => b.rank - a.rank);
  return fallback.map(({ rank: _r, ...rest }) => ({
    id: rest.id,
    name: rest.name,
    color: rest.color,
    iconUrl: rest.iconUrl,
  }));
});

const hoveredDisplayedRoleId = ref<string | null>(null);

function onDisplayedRoleMouseEnter(roleId: string) {
  hoveredDisplayedRoleId.value = roleId;
}

function onDisplayedRoleMouseLeave(roleId: string) {
  if (hoveredDisplayedRoleId.value === roleId)
    hoveredDisplayedRoleId.value = null;
}

function removeRole(
  role: {
    id: string;
    name: string;
    color: string;
    iconUrl?: string | null;
    darkColor?: string;
    lightColor?: string;
    separateThemeColors?: boolean;
  },
  ev?: Event,
) {
  ev?.stopPropagation();
  const rm = props.roleManagement;
  const p = props.profile;
  if (!rm || !p) return;
  // Only remove if currently assigned
  if (!assignedRoleIds.value.includes(role.id)) return;
  void rm.onToggleRole({ targetUserId: p.id, roleId: role.id, assign: false });
}

const rolePopupStyle = computed(() => {
  void rolePopupLayoutTick.value;
  const trigger = roleTriggerRef.value;
  const panelWidth = 288;
  const viewportWidth =
    typeof window !== 'undefined' ? window.innerWidth : 1440;
  const viewportHeight =
    typeof window !== 'undefined' ? window.innerHeight : 900;
  const padding = 12;
  const gap = 10;
  const maxPanelHeight = Math.min(360, viewportHeight - padding * 2);
  const measured = rolePopupPanelRef.value?.rolePopupPanelRef?.offsetHeight;
  const panelHeight =
    measured && measured > 0
      ? Math.min(measured, maxPanelHeight)
      : maxPanelHeight;

  if (rolesStandaloneUi.value && props.anchor) {
    const rect = props.anchor;
    const left = Math.min(
      Math.max(rect.left, padding),
      Math.max(padding, viewportWidth - panelWidth - padding),
    );
    const spaceBelow = viewportHeight - rect.bottom - padding;
    const spaceAbove = rect.top - padding;
    let top: number;
    if (spaceBelow >= panelHeight + gap) {
      top = Math.min(rect.bottom + gap, viewportHeight - panelHeight - padding);
    } else if (spaceAbove >= panelHeight + gap) {
      top = Math.max(rect.top - panelHeight - gap, padding);
    } else if (spaceBelow >= spaceAbove) {
      top = Math.min(
        Math.max(rect.bottom + gap, padding),
        viewportHeight - panelHeight - padding,
      );
    } else {
      top = Math.max(
        Math.min(
          rect.top - panelHeight - gap,
          viewportHeight - panelHeight - padding,
        ),
        padding,
      );
    }
    return {
      left: `${left}px`,
      top: `${top}px`,
    };
  }

  // Quick profile: pin the roles menu to the left edge of the popout card so
  // layout changes inside the card (role chips wrapping, etc.) do not shift the panel.
  const articleEl = popoutArticleRef.value;
  if (articleEl && !rolesStandaloneUi.value) {
    const profileRect = articleEl.getBoundingClientRect();
    const preferredLeft = profileRect.left - panelWidth - gap;
    const left = Math.min(
      Math.max(preferredLeft, padding),
      Math.max(padding, viewportWidth - panelWidth - padding),
    );
    let top = profileRect.top;
    if (top + panelHeight > viewportHeight - padding) {
      top = viewportHeight - padding - panelHeight;
    }
    top = Math.max(top, padding);
    return {
      left: `${left}px`,
      top: `${top}px`,
    };
  }

  if (!trigger) {
    return {
      left: `${Math.max(padding, viewportWidth / 2 - panelWidth / 2)}px`,
      top: `${padding}px`,
    };
  }
  const rect = trigger.getBoundingClientRect();
  const preferredLeft = rect.right - panelWidth;
  const left = Math.min(
    Math.max(preferredLeft, padding),
    Math.max(padding, viewportWidth - panelWidth - padding),
  );
  const spaceBelow = viewportHeight - rect.bottom - padding;
  const spaceAbove = rect.top - padding;

  let top: number;
  if (spaceBelow >= panelHeight + gap) {
    top = Math.min(rect.bottom + gap, viewportHeight - panelHeight - padding);
  } else if (spaceAbove >= panelHeight + gap) {
    top = Math.max(rect.top - panelHeight - gap, padding);
  } else if (spaceBelow >= spaceAbove) {
    top = Math.min(
      Math.max(rect.bottom + gap, padding),
      viewportHeight - panelHeight - padding,
    );
  } else {
    top = Math.max(
      Math.min(
        rect.top - panelHeight - gap,
        viewportHeight - panelHeight - padding,
      ),
      padding,
    );
  }

  return {
    left: `${left}px`,
    top: `${top}px`,
  };
});

watch(
  () => props.modelValue,
  (open) => {
    if (!open) {
      rolePanelOpen.value = false;
      roleTriggerRef.value = null;
      return;
    }
    if (props.openRolesPanelWithProfile && props.roleManagement?.enabled) {
      void nextTick(() => {
        rolePanelOpen.value = true;
      });
    }
  },
);
watch(
  () => props.profile?.id,
  (newId, oldId) => {
    if (oldId !== undefined && newId !== oldId && props.modelValue) {
      rolePanelOpen.value = false;
    }
  },
);

watch(rolePanelOpen, (open) => {
  if (!open) {
    disconnectPopoutResizeObserver();
    return;
  }
  void nextTick(() => {
    void nextTick(() => {
      disconnectPopoutResizeObserver();
      if (typeof ResizeObserver === 'undefined') return;
      const article = popoutArticleRef.value;
      const panel = rolePopupPanelRef.value?.rolePopupPanelRef;
      if (!article && !panel) return;
      popoutResizeObserver = new ResizeObserver(() => {
        rolePopupLayoutTick.value += 1;
      });
      if (article) popoutResizeObserver.observe(article);
      if (panel) popoutResizeObserver.observe(panel);
    });
  });
});

watch(
  () => props.modelValue,
  (v) => {
    if (!v) {
      disconnectPopoutResizeObserver();
      disconnectPopoutHeightResizeObserver();
      disconnectPopoutDisplayNameResizeObserver();
      popoutMeasuredHeight.value = 0;
      popoutDisplayNameOverflowPx.value = 0;
    }
  },
);

watch(
  () => [props.modelValue, props.profile?.id, rolesStandaloneUi.value] as const,
  ([open, _profileId, standalone]) => {
    disconnectPopoutHeightResizeObserver();
    disconnectPopoutDisplayNameResizeObserver();
    popoutMeasuredHeight.value = 0;
    popoutDisplayNameOverflowPx.value = 0;
    if (!open || standalone) return;
    if (typeof ResizeObserver === 'undefined') return;
    void nextTick(() => {
      const el = popoutArticleRef.value;
      if (!el) return;
      const apply = (h: number) => {
        if (h > 0) popoutMeasuredHeight.value = h;
      };
      apply(el.getBoundingClientRect().height);
      const ro = new ResizeObserver((entries) => {
        for (const e of entries) apply(e.contentRect.height);
      });
      ro.observe(el);
      popoutHeightResizeObserver = ro;
      const roDisplay = new ResizeObserver(() => {
        updateDisplayNameOverflowMeasure();
      });
      roDisplay.observe(el);
      popoutDisplayNameResizeObserver = roDisplay;
      updateDisplayNameOverflowMeasure();
    });
  },
  { flush: 'post' },
);

const placement = computed(() => {
  void popoutDisplayNameOverflowPx.value;
  const baseWidth = 308;
  const padding = 16;
  const arrowInset = 24;
  const viewportWidth =
    typeof window !== 'undefined' ? window.innerWidth : 1440;
  const viewportHeight =
    typeof window !== 'undefined' ? window.innerHeight : 900;
  const width = Math.min(baseWidth, Math.max(220, viewportWidth - padding * 2));
  const source = props.anchor?.source ?? 'generic';
  const maxPanelHeight = viewportHeight - padding * 2;
  /** Height for layout until ResizeObserver reports the real popout size (avoids a huge first-frame `top` for self-bar). */
  const layoutHeightEstimate = 400;
  const effectivePopoutHeight =
    popoutMeasuredHeight.value > 0
      ? Math.min(popoutMeasuredHeight.value, maxPanelHeight)
      : Math.min(layoutHeightEstimate, maxPanelHeight);
  const panelHeight = effectivePopoutHeight;
  const compactViewport = viewportWidth < 760 || viewportHeight < 560;

  if (isCompactShell.value && !rolesStandaloneUi.value) {
    return {
      side: 'right' as const,
      centered: true,
      sheet: true,
      style: {
        left: '0',
        right: '0',
        bottom: '0',
        top: 'auto',
        width: '100%',
        maxWidth: '100%',
        maxHeight: 'min(90dvh, 720px)',
        borderTopLeftRadius: '20px',
        borderTopRightRadius: '20px',
      },
      arrowStyle: {
        display: 'none',
      },
      offsetY: 0,
    };
  }

  const gap =
    source === 'member-list'
      ? 8
      : source === 'self-bar'
        ? 10
        : source === 'vc-panel'
          ? 4
          : 12;

  const snapPx = (n: number) => Math.round(n);

  if (!props.anchor) {
    return {
      side: 'right' as const,
      centered: true,
      sheet: false,
      style: {
        left: `${snapPx(Math.max(padding, viewportWidth / 2 - width / 2))}px`,
        top: `${snapPx(Math.max(padding, viewportHeight / 2 - effectivePopoutHeight / 2))}px`,
        maxHeight: `${maxPanelHeight}px`,
      },
      arrowStyle: {
        top: `${arrowInset}px`,
      },
      offsetY: -8,
    };
  }

  if (compactViewport) {
    return {
      side: 'right' as const,
      centered: true,
      sheet: false,
      style: {
        left: `${snapPx(Math.max(padding, viewportWidth / 2 - width / 2))}px`,
        top: `${snapPx(Math.max(padding, viewportHeight / 2 - panelHeight / 2))}px`,
        maxHeight: `${maxPanelHeight}px`,
      },
      arrowStyle: {
        top: `${arrowInset}px`,
      },
      offsetY: 0,
    };
  }

  const spaceRight = viewportWidth - props.anchor.right - padding;
  const spaceLeft = props.anchor.left - padding;
  const canFitRight = spaceRight >= width + gap;
  const canFitLeft = spaceLeft >= width + gap;

  let side: 'left' | 'right' = source === 'member-list' ? 'left' : 'right';

  if (side === 'left' && !canFitLeft && canFitRight) side = 'right';
  if (side === 'right' && !canFitRight && canFitLeft) side = 'left';
  if (!canFitLeft && !canFitRight) {
    side = spaceRight >= spaceLeft ? 'right' : 'left';
  }

  let left =
    side === 'right'
      ? Math.min(props.anchor.right + gap, viewportWidth - width - padding)
      : Math.max(props.anchor.left - width - gap, padding);

  const isMobileMemberQuickProfile =
    source === 'member-list' && viewportWidth <= 900;
  if (isMobileMemberQuickProfile && popoutDisplayNameOverflowPx.value > 0) {
    const maxLeft = Math.max(padding, viewportWidth - width - padding);
    const nudgeRightBy = Math.min(
      84,
      Math.ceil(popoutDisplayNameOverflowPx.value + 12),
    );
    left = Math.min(maxLeft, left + nudgeRightBy);
  }

  const anchorCenterY = props.anchor.top + props.anchor.height / 2;
  let desiredTop = anchorCenterY - 96;

  if (source === 'member-list') {
    desiredTop = props.anchor.top - 44;
  } else if (source === 'chat-avatar') {
    desiredTop = props.anchor.top - 24;
  } else if (source === 'chat-name') {
    desiredTop = props.anchor.top - 42;
  } else if (source === 'self-bar') {
    // Horizontal top rail: keep the panel below the avatar so it isn’t clipped under the window title bar.
    if (props.anchor.top < 96) {
      desiredTop = props.anchor.bottom + 10;
    } else {
      desiredTop = props.anchor.bottom - panelHeight + 116;
    }
  } else if (source === 'vc-panel') {
    // Slightly above the avatar center so it feels attached but outside the channel panel.
    desiredTop = props.anchor.top - 32;
  }

  const top = Math.min(
    Math.max(desiredTop, padding),
    viewportHeight - panelHeight - padding,
  );

  const arrowCenter = Math.min(
    Math.max(anchorCenterY - top, arrowInset),
    panelHeight - arrowInset,
  );

  return {
    side,
    centered: false,
    sheet: false,
    style: {
      left: `${snapPx(left)}px`,
      top: `${snapPx(top)}px`,
      maxHeight: `${maxPanelHeight}px`,
    },
    arrowStyle: {
      top: `${arrowCenter}px`,
    },
    offsetY: top - anchorCenterY,
  };
});

const bannerRefractionStyle = computed(() => {
  const p = props.profile;
  if (!p?.bannerRefractionEnabled) return {};
  return profileBannerRefractionBackdropStyle(
    p.bannerColor,
    p.bannerImage,
    p.bannerPositionY,
  );
});

function closePopout() {
  contentRef.value?.commitNote?.();
  emit('update:modelValue', false);
}

function handleOpenDm() {
  const p = props.profile;
  if (!p) return;
  closePopout();
  emit('open-dm', p.id);
}

function emitPopoutProfileBlock() {
  const p = props.profile;
  if (!p) return;
  emit('block-user', p.id);
}

function emitPopoutProfileUnblock() {
  const p = props.profile;
  if (!p) return;
  emit('unblock-user', p.id);
}

function emitPopoutProfileReport(payload: { reason: string }) {
  const p = props.profile;
  if (!p) return;
  emit('report-user', { userId: p.id, reason: payload.reason });
}

function onPopoutSurfaceClick(ev: MouseEvent) {
  if (!rolePanelOpen.value && !rolesStandaloneUi.value) return;
  const t = ev.target as HTMLElement | null;
  if (!t) return;
  if (t.closest('button.member-role--action')) return;
  if (t.closest('.member-role__remove-circle')) return;
  if (t.closest('textarea')) return;
  rolePanelOpen.value = false;
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    if (rolePanelOpen.value || rolesStandaloneUi.value) {
      if (rolesStandaloneUi.value) {
        closePopout();
      } else {
        rolePanelOpen.value = false;
      }
      event.preventDefault();
      return;
    }
    closePopout();
  }
}

function toggleRolePanel(ev?: MouseEvent) {
  const el = ev?.currentTarget;
  if (el instanceof HTMLElement) {
    roleTriggerRef.value = el;
  }
  rolePanelOpen.value = !rolePanelOpen.value;
  if (rolePanelOpen.value) {
    void nextTick(() => {
      rolePopupLayoutTick.value += 1;
    });
  }
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown);
  window.addEventListener('resize', handleViewportUpdate);
  window.addEventListener('scroll', handleViewportUpdate, true);
  void nextTick(() => updateDisplayNameOverflowMeasure());
});

onUnmounted(() => {
  disconnectPopoutResizeObserver();
  disconnectPopoutHeightResizeObserver();
  disconnectPopoutDisplayNameResizeObserver();
  window.removeEventListener('keydown', onKeydown);
  window.removeEventListener('resize', handleViewportUpdate);
  window.removeEventListener('scroll', handleViewportUpdate, true);
});

function handleViewportUpdate() {
  if (!rolePanelOpen.value) return;
  rolePopupLayoutTick.value += 1;
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="modelValue && profile"
      class="fixed inset-0 z-[160]"
      @click="closePopout"
    >
      <article
        v-if="!rolesStandaloneUi"
        ref="popoutArticleRef"
        class="member-popout member-popout--card custom-scrollbar fixed overflow-y-auto rounded-[24px] shadow-2xl"
        :class="[
          placement.side === 'right'
            ? 'member-popout--right'
            : 'member-popout--left',
          placement.sheet ? 'member-popout--sheet' : '',
        ]"
        :style="{
          ...placement.style,
          '--popout-offset-y': `${placement.offsetY}px`,
        }"
        @click.stop="onPopoutSurfaceClick"
      >
        <span
          v-if="!placement.centered && !placement.sheet"
          class="member-popout__arrow"
          :style="placement.arrowStyle"
          aria-hidden="true"
        />

        <MemberProfileHeader
          :profile="profile"
          :banner-refraction-style="bannerRefractionStyle"
          @open-full-profile="emit('open-full-profile')"
        >
          <template #banner-actions>
            <div
              v-if="showProfileMoreMenu || showBannerAddFriendButton"
              class="flex items-center gap-2"
              aria-label="Profile actions"
            >
              <button
                v-if="showBannerAddFriendButton"
                type="button"
                class="ep-profile-banner-friend-btn ep-profile-banner-friend-btn--labeled"
                title="Add friend"
                aria-label="Add friend"
                @click="emit('send-friend-request', profile.id)"
              >
                <img
                  :src="icons.friendAdd"
                  alt=""
                  class="ep-profile-banner-friend-btn__icon"
                  aria-hidden="true"
                />
                <span class="ep-profile-banner-friend-btn__text"
                  >Add friend</span
                >
              </button>
              <UserProfileMoreMenu
                v-if="showProfileMoreMenu"
                ref="profileMoreMenuRef"
                :user-id="profile.id"
                :mention-display-name="profile.displayName"
                :is-blocked="!!isTargetBlocked"
                :is-friend="!!isFriend"
                :can-send-friend-request="canSendFriendRequestInEllipsisMenu"
                :show-message-menu-item="!!quickDmEnabled"
                :message-menu-item-disabled="
                  !!isTargetBlocked || !!profile.isDiscordShadow
                "
                :show-trigger="!showCompactPersonSettingsRow"
                trigger-class="ep-profile-banner-more-btn"
                @block="emitPopoutProfileBlock"
                @unblock="emitPopoutProfileUnblock"
                @remove-friend="emit('remove-friend', profile.id)"
                @send-friend-request="emit('send-friend-request', profile.id)"
                @report="emitPopoutProfileReport"
                @message="handleOpenDm"
              />
            </div>
          </template>
        </MemberProfileHeader>

        <div
          v-if="showCompactPersonSettingsRow"
          class="member-popout__person-settings-wrap shrink-0 px-4"
        >
          <button
            type="button"
            class="member-popout__person-settings chat-focus-ring"
            data-profile-more-menu-anchor
            aria-haspopup="menu"
            aria-label="Person settings"
            @click.stop="onCompactPersonSettingsClick"
          >
            <img
              :src="icons.sliders"
              alt=""
              class="member-popout__person-settings-icon h-4 w-4 shrink-0 opacity-90"
              aria-hidden="true"
            />
            <span>Person settings</span>
          </button>
        </div>

        <MemberProfileContent
          ref="contentRef"
          :profile="profile"
          :show-friends-badge="showFriendsBadge"
          :note="note"
          :quick-dm-enabled="quickDmEnabled"
          :is-target-blocked="isTargetBlocked"
          :is-friend="isFriend"
          :hide-guild-roles-section="hideGuildRolesSection"
          :displayed-roles="displayedRoles"
          :assigned-role-ids="assignedRoleIds"
          :role-management-enabled="roleManagement?.enabled"
          :hovered-displayed-role-id="hoveredDisplayedRoleId"
          @update:note="emit('update:note', $event)"
          @toggle-role-panel="toggleRolePanel"
          @remove-role="removeRole"
          @role-mouseenter="onDisplayedRoleMouseEnter"
          @role-mouseleave="onDisplayedRoleMouseLeave"
          @quick-dm="emit('quick-dm', $event)"
          @send-friend-request="emit('send-friend-request', profile.id)"
          @block="emitPopoutProfileBlock"
          @unblock="emitPopoutProfileUnblock"
          @remove-friend="emit('remove-friend', profile.id)"
          @report="emitPopoutProfileReport"
          @open-dm="handleOpenDm"
        />
      </article>

      <MemberProfileRolePanel
        v-if="roleManagement && (rolePanelOpen || rolesStandaloneUi)"
        ref="rolePopupPanelRef"
        :profile="profile"
        :role-management="roleManagement"
        :assigned-role-ids="assignedRoleIds"
        :optimistic-assign="optimisticAssign"
        :pending-role-ids="pendingRoleIds"
        :popup-style="rolePopupStyle"
        @close="rolePanelOpen = false"
      />
    </div>
  </Teleport>
</template>

<style scoped lang="scss">
.member-popout {
  width: min(308px, calc(100vw - 32px));
}

.member-popout--sheet {
  width: 100%;
  max-width: 100%;
  left: 0 !important;
  right: 0;
  margin: 0 auto;
  border-radius: 20px 20px 0 0;
  max-height: min(90dvh, 720px) !important;
}

.member-popout--card {
  display: flex;
  flex-direction: column;
  background:
    radial-gradient(circle at top right, var(--vue-auto-182), transparent 36%),
    linear-gradient(180deg, var(--vue-auto-183), var(--vue-auto-184));
  backdrop-filter: blur(22px);
  -webkit-backdrop-filter: blur(22px);
  transform: translate3d(0, 0, 0);
  animation: member-popout-in 190ms cubic-bezier(0.16, 1, 0.3, 1);
  /*
   * `overflow-x: clip` (vs hidden) follows the border-radius mask more reliably on WebKit when
   * combined with backdrop-filter — avoids a 1px “step” where the banner layer snaps to a
   * different subpixel grid than the card body (Safari / some DPIs).
   */
  overflow-x: clip;
}

.member-popout--right {
  transform-origin: left center;
}

.member-popout--left {
  transform-origin: right center;
}

.member-popout__arrow {
  position: absolute;
  /* Above header strips (banner-line / hero) so the notch stays visible. */
  z-index: 20;
  width: 14px;
  height: 14px;
  margin-top: -7px;
  rotate: 45deg;
  background: var(--vue-auto-190);
  box-shadow: inset 0 0 0 1px var(--vue-auto-008);
}

.member-popout--right .member-popout__arrow {
  left: -7px;
}

.member-popout--left .member-popout__arrow {
  right: -7px;
}

@keyframes member-popout-in {
  from {
    opacity: 0;
    transform: translate3d(
        var(--popout-enter-x, 0),
        clamp(-18px, calc(var(--popout-offset-y, 0px) * -0.08), 18px),
        0
      )
      scale(0.965);
  }
  to {
    opacity: 1;
    transform: translate3d(0, 0, 0) scale(1);
  }
}

.member-popout--right {
  --popout-enter-x: -14px;
}

.member-popout--left {
  --popout-enter-x: 14px;
}

.member-popout__person-settings-wrap {
  margin-top: 2px;
  margin-bottom: 2px;
}

.member-popout__person-settings {
  display: flex;
  width: 100%;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 0.65rem 0.75rem;
  border: 0;
  border-radius: 14px;
  cursor: pointer;
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--vue-auto-044);
  background: color-mix(in srgb, white 5%, transparent);
  box-shadow:
    inset 0 0 0 1px color-mix(in srgb, white 10%, transparent),
    0 2px 10px color-mix(in srgb, black 18%, transparent);
  outline: none;
  transition:
    background-color 0.14s ease,
    transform 0.14s ease,
    box-shadow 0.14s ease;
}

.member-popout__person-settings:hover {
  background: color-mix(in srgb, white 8%, transparent);
  transform: translateY(-0.5px);
}

.member-popout__person-settings:focus-visible {
  box-shadow:
    inset 0 0 0 1px color-mix(in srgb, white 14%, transparent),
    0 0 0 2px color-mix(in srgb, var(--accent) 40%, transparent);
}

.member-popout__person-settings-icon {
  filter: invert(1);
  opacity: 0.88;
}

:global([data-theme='light'] .member-popout__person-settings-icon) {
  filter: brightness(0);
  opacity: 0.75;
}
</style>
