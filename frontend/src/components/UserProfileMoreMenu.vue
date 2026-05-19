<script setup lang="ts">
import {
  computed,
  inject,
  nextTick,
  onUnmounted,
  ref,
  watch,
  type Ref,
} from 'vue';
import { storeToRefs } from 'pinia';
import { icons } from '@/assets/icons';
import { useDevSettingsStore } from '@/stores/devSettings';
import { copyToClipboard } from '@/features/chat/composables/useMessageLinkActions';
import { linkTokenUser } from '@/utils/idTokens';
import {
  COMPOSER_INSERT_USER_MENTION_KEY,
  type InsertUserMentionFn,
} from '@/features/chat/chatComposerContext';

const props = withDefaults(
  defineProps<{
    userId: string;
    mentionDisplayName?: string;
    /** When `false`, hide the ⋮ trigger. Omitted defaults to `true` (see withDefaults — required so Vue does not coerce optional boolean to off). */
    enabled?: boolean;
    isBlocked: boolean;
    /** When true, offer unfriend action in the menu. */
    isFriend?: boolean;
    /** When true, show "Add friend" action in the menu. */
    canSendFriendRequest?: boolean;
    /** When true, show “Message” (opens DM) — e.g. member popout without a header Message button. */
    showMessageMenuItem?: boolean;
    /** When false, omit “Direct mention” (e.g. expanded profile surfaces). */
    showQuickMentionInMenu?: boolean;
    /** When true, hide the Message row (e.g. Discord shadow / blocked). */
    messageMenuItemDisabled?: boolean;
    /** Override trigger button classes (e.g. popout chrome). */
    triggerClass?: string;
    /** When false, omit the ⋮ control; parent opens the menu via `toggleMenu(anchor)` / `openMenu(anchor)`. */
    showTrigger?: boolean;
  }>(),
  {
    triggerClass: undefined,
    showTrigger: true,
    /** Boolean-ish props: omitting `enabled` must stay “on”; bare `boolean?` coerces to false in Vue. */
    enabled: true,
    isFriend: false,
    canSendFriendRequest: false,
    showMessageMenuItem: false,
    showQuickMentionInMenu: true,
    messageMenuItemDisabled: false,
  },
);

const emit = defineEmits<{
  block: [];
  unblock: [];
  'remove-friend': [];
  'send-friend-request': [];
  /** reason may be empty */
  report: [payload: { reason: string }];
  /** Open DM with this user (parent closes surfaces). */
  message: [];
}>();

const composerInsertUserMention =
  inject<Ref<InsertUserMentionFn | null> | null>(
    COMPOSER_INSERT_USER_MENTION_KEY,
    null,
  );
const quickMentionEnabled = computed(
  () =>
    props.showQuickMentionInMenu !== false &&
    !!composerInsertUserMention?.value &&
    !!props.userId.trim(),
);

const menuOpen = ref(false);
const reportOpen = ref(false);
const reportReason = ref('');
const moreBtnRef = ref<HTMLElement | null>(null);
/** While the menu is open, prefer this element for positioning (e.g. compact-shell full-width trigger). */
const menuPositionAnchorRef = ref<HTMLElement | null>(null);
const menuStyle = ref<{ left: string; top: string }>({
  left: '0px',
  top: '0px',
});

function positionMenu() {
  const el = menuPositionAnchorRef.value ?? moreBtnRef.value;
  if (!el) return;
  const r = el.getBoundingClientRect();
  const w = 200;
  const h = 200;
  const pad = 8;
  let left = r.right - w;
  let top = r.bottom + 4;
  if (left < pad) left = pad;
  if (left + w > window.innerWidth - pad)
    left = Math.max(pad, window.innerWidth - w - pad);
  if (top + h > window.innerHeight - pad) {
    top = Math.max(pad, r.top - h - 4);
  }
  menuStyle.value = { left: `${left}px`, top: `${top}px` };
}

function toggleMenu(anchorEl?: HTMLElement | null) {
  if (!props.enabled) return;
  if (menuOpen.value) {
    closeMenu();
    return;
  }
  const anchor = anchorEl ?? moreBtnRef.value;
  if (!anchor) return;
  menuPositionAnchorRef.value = anchor;
  menuOpen.value = true;
  void nextTick(() => positionMenu());
}

function openMenu(anchorEl?: HTMLElement | null) {
  if (!props.enabled) return;
  const anchor = anchorEl ?? moreBtnRef.value;
  if (!anchor) return;
  menuPositionAnchorRef.value = anchor;
  menuOpen.value = true;
  void nextTick(() => positionMenu());
}

function closeMenu() {
  menuOpen.value = false;
  menuPositionAnchorRef.value = null;
}

function onBlockClick() {
  closeMenu();
  emit('block');
}

function onUnblockClick() {
  closeMenu();
  emit('unblock');
}

function onRemoveFriendClick() {
  closeMenu();
  emit('remove-friend');
}

function onSendFriendRequestClick() {
  closeMenu();
  emit('send-friend-request');
}

function onReportClick() {
  closeMenu();
  reportReason.value = '';
  reportOpen.value = true;
}

function closeReport() {
  reportOpen.value = false;
}

function submitReport() {
  emit('report', { reason: reportReason.value.trim() });
  reportOpen.value = false;
  reportReason.value = '';
}

function onCopyIdClick() {
  closeMenu();
  const id = props.userId;
  if (!id) return;
  copyToClipboard(linkTokenUser(id));
}

function onQuickMentionClick() {
  const fn = composerInsertUserMention?.value;
  const userId = props.userId.trim();
  if (!fn || !userId) return;
  const displayName = props.mentionDisplayName?.trim() || 'user';
  closeMenu();
  fn({ userId, displayName });
}

function onMessageClick() {
  if (props.messageMenuItemDisabled) return;
  closeMenu();
  emit('message');
}

const devSettings = useDevSettingsStore();
const { devModeIdsEnabled } = storeToRefs(devSettings);

const MENU_ITEM =
  'echo-menu-item chat-focus-ring flex w-full items-center gap-2 rounded-sm px-3 py-2 text-left text-sm';

function onDocClick(ev: MouseEvent) {
  const t = ev.target as Node;
  if (moreBtnRef.value?.contains(t)) return;
  const el = t instanceof Element ? t : null;
  if (el?.closest?.('[data-profile-more-menu-anchor]')) return;
  const menu = document.querySelector('[data-profile-more-menu]');
  if (menu?.contains(t)) return;
  closeMenu();
}

watch(menuOpen, (open) => {
  if (open) {
    // Defer so the same click that opened the menu is not seen by capture `onDocClick`.
    void nextTick(() => {
      if (!menuOpen.value) return;
      window.addEventListener('click', onDocClick, true);
      window.addEventListener('resize', positionMenu);
    });
  } else {
    window.removeEventListener('click', onDocClick, true);
    window.removeEventListener('resize', positionMenu);
  }
});

onUnmounted(() => {
  window.removeEventListener('click', onDocClick, true);
  window.removeEventListener('resize', positionMenu);
});

/** Pass user id for copy — parent sets data-profile-user-id on a wrapper. */
defineExpose({ closeMenu, toggleMenu, openMenu });
</script>

<template>
  <div v-if="enabled" :class="showTrigger ? 'relative inline-flex' : 'hidden'">
    <button
      v-if="showTrigger"
      ref="moreBtnRef"
      type="button"
      :class="triggerClass ?? 'ep-header-btn ep-header-btn-more'"
      title="More options"
      aria-label="More options"
      aria-haspopup="menu"
      :aria-expanded="menuOpen"
      @click.stop="() => toggleMenu()"
    >
      <img
        :src="icons.moreVertical"
        alt=""
        class="ep-more-icon h-4 w-4 shrink-0 filter invert opacity-90"
      />
    </button>
    <Teleport to="body">
      <div
        v-if="menuOpen"
        data-profile-more-menu
        class="ellipsis-menu fixed z-[380] min-w-[200px] py-1"
        :style="menuStyle"
        role="menu"
        @click.stop
      >
        <button
          v-if="showMessageMenuItem"
          type="button"
          :class="[
            MENU_ITEM,
            messageMenuItemDisabled ? 'cursor-not-allowed opacity-45' : '',
          ]"
          :disabled="messageMenuItemDisabled"
          role="menuitem"
          @click="onMessageClick"
        >
          <img
            :src="icons.messageAlt"
            alt=""
            class="echo-menu-item-icon echo-menu-item-icon--img h-4 w-4 shrink-0 filter invert"
          />
          Message
        </button>
        <button
          v-if="quickMentionEnabled"
          type="button"
          :class="MENU_ITEM"
          role="menuitem"
          @click="onQuickMentionClick"
        >
          <span
            class="echo-menu-item-icon flex h-4 w-4 shrink-0 items-center justify-center text-[11px] font-bold text-foreground"
            aria-hidden="true"
            >@</span
          >
          Direct mention
        </button>
        <button
          v-if="devModeIdsEnabled"
          type="button"
          :class="MENU_ITEM"
          role="menuitem"
          @click="onCopyIdClick"
        >
          <img
            :src="icons.profileView"
            alt=""
            class="echo-menu-item-icon echo-menu-item-icon--img h-4 w-4 shrink-0 filter invert"
          />
          Copy user ID
        </button>
        <button
          v-if="canSendFriendRequest"
          type="button"
          :class="MENU_ITEM"
          role="menuitem"
          @click="onSendFriendRequestClick"
        >
          <img
            :src="icons.friendAdd"
            alt=""
            class="echo-menu-item-icon echo-menu-item-icon--img h-4 w-4 shrink-0 filter invert"
          />
          Add friend
        </button>
        <button
          v-if="isFriend"
          type="button"
          :class="[MENU_ITEM, 'echo-menu-item--destructive']"
          role="menuitem"
          @click="onRemoveFriendClick"
        >
          <img
            :src="icons.trash"
            alt=""
            class="echo-menu-item-icon echo-menu-item-icon--img h-4 w-4 shrink-0 filter invert"
          />
          Unfriend
        </button>
        <button
          type="button"
          :class="[MENU_ITEM, 'echo-menu-item--warning']"
          role="menuitem"
          @click="onReportClick"
        >
          <svg
            class="echo-menu-item-icon h-4 w-4 shrink-0"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            aria-hidden="true"
          >
            <path
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"
            />
            <path stroke-width="2" stroke-linecap="round" d="M4 22V4" />
          </svg>
          Report user
        </button>
        <button
          v-if="!isBlocked"
          type="button"
          :class="[MENU_ITEM, 'echo-menu-item--destructive']"
          role="menuitem"
          @click="onBlockClick"
        >
          <img
            :src="icons.banUser"
            alt=""
            class="echo-menu-item-icon echo-menu-item-icon--img h-4 w-4 shrink-0 filter invert"
          />
          Block user
        </button>
        <button
          v-else
          type="button"
          :class="MENU_ITEM"
          role="menuitem"
          @click="onUnblockClick"
        >
          <img
            :src="icons.shield"
            alt=""
            class="echo-menu-item-icon echo-menu-item-icon--img h-4 w-4 shrink-0 filter invert"
          />
          Unblock user
        </button>
      </div>
    </Teleport>
    <Teleport to="body">
      <div
        v-if="reportOpen"
        class="fixed inset-0 z-[390] flex items-center justify-center bg-scrim-2 px-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby="report-user-title"
        @click.self="closeReport"
      >
        <div
          class="w-full max-w-md rounded-xl border border-border bg-[var(--echo-modal-bg)] p-5 text-white shadow-xl"
          @click.stop
        >
          <h2 id="report-user-title" class="text-lg font-semibold">
            Report user
          </h2>
          <p class="mt-1 text-sm text-fg-soft">
            Tell us what happened. Trust and safety reviews these reports.
          </p>
          <textarea
            v-model="reportReason"
            class="mt-3 w-full resize-y rounded-lg border border-border bg-scrim-2 px-3 py-2 text-sm text-white placeholder:text-fg-subtle focus:border-white/25 focus:outline-none"
            rows="4"
            maxlength="2000"
            placeholder="Optional details…"
          />
          <div class="mt-4 flex justify-end gap-2">
            <button
              type="button"
              class="rounded-lg px-4 py-2 text-sm font-semibold text-fg-soft hover:bg-glass-hover"
              @click="closeReport"
            >
              Cancel
            </button>
            <button
              type="button"
              class="rounded-lg bg-rose-600/90 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-600"
              @click="submitReport"
            >
              Submit report
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>
