<script setup lang="ts">
import { computed, ref, watch, nextTick, withDefaults } from 'vue';
import { useEchoWorkspace } from '@/composables/useEchoWorkspace';
import { useServerStore } from '@/stores/server';
import type { MemberProfile } from '@/utils/memberProfiles';
import ProfileUserBadges from '@/components/member-profile/ProfileUserBadges.vue';
import ProfileFriendHeartBadge from '@/components/member-profile/ProfileFriendHeartBadge.vue';
import ProfileMemberSinceInline from '@/components/member-profile/ProfileMemberSinceInline.vue';
import ProfileVoiceActivityWidget from '@/components/member-profile/ProfileVoiceActivityWidget.vue';
import {
  memberPopoutRoleAccentColor,
  memberPopoutRoleChipStyle,
} from '@/utils/memberPopoutRoleChipStyle';
import { memberRoleIconImgSrc } from '@/utils/memberRoleIconDisplay';
import { useThemeStore } from '@/stores/theme';
import { useUserVoiceChannelPresenceForProfile } from '@/composables/useUserVoiceChannelPresenceForProfile';

const props = withDefaults(
  defineProps<{
    profile: MemberProfile;
    /** Red heart badge (name row) when viewer is friends with this profile. */
    showFriendsBadge?: boolean;
    note: string;
    /** When false, the quick DM row is hidden (self, blocked, etc.). */
    quickDmEnabled?: boolean;
    isTargetBlocked?: boolean;
    isFriend?: boolean;
    /** DM rail / inbox: hide guild role chips. */
    hideGuildRolesSection?: boolean;
    displayedRoles?: {
      id: string;
      name: string;
      color: string;
      darkColor?: string;
      lightColor?: string;
      separateThemeColors?: boolean;
      iconUrl?: string | null;
      iconEmojiId?: string | null;
    }[];
    assignedRoleIds?: string[];
    roleManagementEnabled?: boolean;
    hoveredDisplayedRoleId?: string | null;
  }>(),
  {
    hideGuildRolesSection: false,
    displayedRoles: () => [],
    assignedRoleIds: () => [],
    roleManagementEnabled: false,
    hoveredDisplayedRoleId: null,
  },
);

const workspace = useEchoWorkspace();
const serverStore = useServerStore();
const themeStore = useThemeStore();

/** Guild server quick profile only — matches AppLayoutModals guild-context gate. */
const showGuildRolesInline = computed(() => !props.hideGuildRolesSection);

const emit = defineEmits<{
  'update:note': [value: string];
  'quick-dm': [text: string];
  'send-friend-request': [];
  block: [];
  unblock: [];
  'remove-friend': [];
  report: [payload: { reason: string }];
  'open-dm': [];
  'toggle-role-panel': [ev: MouseEvent];
  'remove-role': [
    role: {
      id: string;
      name: string;
      color: string;
      iconUrl?: string | null;
      darkColor?: string;
      lightColor?: string;
      separateThemeColors?: boolean;
    },
    ev: Event,
  ];
  'role-mouseenter': [roleId: string];
  'role-mouseleave': [roleId: string];
}>();

const draftNote = ref(props.note);
const noteInputRef = ref<HTMLTextAreaElement | null>(null);
/** True after user opens the note editor while there is no saved note yet. */
const noteEditorOpen = ref(false);

const hasSavedNote = computed(() => props.note.trim().length > 0);
const showExpandedNoteUi = computed(
  () => hasSavedNote.value || noteEditorOpen.value,
);

watch(
  () => props.note,
  (newNote) => {
    draftNote.value = newNote;
    nextTick(() => resizeNoteInput());
  },
);

const ROLE_PREVIEW_LIMIT = 5;
const rolesExpanded = ref(false);

const hasRoleOverflow = computed(
  () => props.displayedRoles.length > ROLE_PREVIEW_LIMIT,
);

const rolesToRender = computed(() => {
  if (rolesExpanded.value || !hasRoleOverflow.value) {
    return props.displayedRoles;
  }
  return props.displayedRoles.slice(0, ROLE_PREVIEW_LIMIT);
});

const roleOverflowCount = computed(() =>
  Math.max(0, props.displayedRoles.length - ROLE_PREVIEW_LIMIT),
);

function roleIconImg(role: {
  iconUrl?: string | null;
  iconEmojiId?: string | null;
}): string {
  return memberRoleIconImgSrc({
    iconUrl: role.iconUrl,
    iconEmojiId: role.iconEmojiId,
  });
}

function memberRoleDotFilled(role: (typeof props.displayedRoles)[number]) {
  return !!memberPopoutRoleAccentColor(
    role,
    themeStore.canonicalTheme === 'light',
  );
}

function memberRoleDotStyle(
  role: (typeof props.displayedRoles)[number],
): Record<string, string> {
  const fill = memberPopoutRoleAccentColor(
    role,
    themeStore.canonicalTheme === 'light',
  );
  if (!fill) return {};
  return { backgroundColor: fill };
}

const badgesForNameRow = computed(() => props.profile.badges ?? []);

const quickDmDraft = ref('');
const quickDmInputRef = ref<HTMLInputElement | null>(null);

const communicationTimeoutUntilEpochMs = computed(() => {
  const serverId = serverStore.selectedServerId?.trim();
  const userId = props.profile.id?.trim();
  if (!serverId || serverId === 'echo' || !userId) return null;
  const epochMs = workspace.timeoutUntilByServerUser.value[serverId]?.[userId];
  if (!epochMs || epochMs <= Date.now()) return null;
  return epochMs;
});

const communicationTimeoutLabel = computed(() => {
  const epochMs = communicationTimeoutUntilEpochMs.value;
  if (!epochMs) return '';
  const seconds = Math.max(0, Math.ceil((epochMs - Date.now()) / 1000));
  if (seconds >= 86_400) return `Timed out for ${Math.ceil(seconds / 86_400)}d`;
  if (seconds >= 3_600) return `Timed out for ${Math.ceil(seconds / 3_600)}h`;
  if (seconds >= 60) return `Timed out for ${Math.ceil(seconds / 60)}m`;
  return `Timed out for ${seconds}s`;
});

const voiceActivities = useUserVoiceChannelPresenceForProfile(
  () => props.profile.id,
);

watch(
  () => props.profile.id,
  () => {
    noteEditorOpen.value = false;
    rolesExpanded.value = false;
    quickDmDraft.value = '';
    focusQuickDmInput();
  },
  { immediate: true },
);

function resizeNoteInput(el?: HTMLTextAreaElement | null) {
  const ta = el ?? noteInputRef.value;
  if (!ta) return;
  ta.style.height = 'auto';
  ta.style.height = `${Math.max(20, Math.min(ta.scrollHeight, 120))}px`;
}

function commitNote() {
  emit('update:note', draftNote.value);
}

function openNoteEditor() {
  noteEditorOpen.value = true;
  nextTick(() => {
    resizeNoteInput();
    noteInputRef.value?.focus();
  });
}

function onNoteBlur() {
  commitNote();
  if (!draftNote.value.trim()) {
    noteEditorOpen.value = false;
  }
}

function submitQuickDm() {
  const t = quickDmDraft.value.trim();
  if (!t) return;
  emit('quick-dm', t);
  quickDmDraft.value = '';
}

function focusQuickDmInput() {
  if (!props.quickDmEnabled) return;
  nextTick(() => {
    quickDmInputRef.value?.focus();
  });
}

defineExpose({
  resizeNoteInput,
  commitNote,
});
</script>

<template>
  <div class="member-popout__content mt-1 shrink-0 px-4 pb-6">
    <div
      class="member-popout__bubble rounded-[18px] bg-transparent pl-1.5 pr-3.5 py-3.5"
    >
      <div class="min-w-0">
        <div
          class="member-popout__identity-row flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1.5"
        >
          <div
            class="member-popout__identity-primary flex min-w-0 max-w-full items-center gap-2"
          >
            <h3
              class="member-popout__display-name min-w-0 truncate text-lg font-bold text-fg sm:max-w-[min(100%,14rem)]"
            >
              {{ profile.displayName }}
            </h3>
            <div
              v-if="badgesForNameRow.length || showFriendsBadge"
              class="flex min-w-0 shrink-0 flex-wrap items-center gap-1.5"
            >
              <ProfileUserBadges
                v-if="badgesForNameRow.length"
                :badges="badgesForNameRow"
                size="sm"
                class="shrink-0"
              />
              <ProfileFriendHeartBadge v-if="showFriendsBadge" />
            </div>
          </div>
        </div>
        <div
          class="mt-0.5 flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5"
        >
          <p class="shrink-0 text-[12px] leading-snug text-fg-subtle">
            @{{ profile.username }}
          </p>
        </div>
        <ProfileMemberSinceInline
          v-if="profile.joinedAt"
          class="mt-2.5"
          :date="profile.joinedAt"
          :server-name="profile.serverName"
          :server-image-url="profile.serverImageUrl"
        />
        <div
          v-if="communicationTimeoutLabel"
          class="mt-1.5 inline-flex w-fit items-center rounded-md bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-200 ring-1 ring-amber-400/20"
        >
          {{ communicationTimeoutLabel }}
        </div>
        <ProfileVoiceActivityWidget
          v-if="voiceActivities.length"
          class="mt-2"
          :activities="voiceActivities"
          compact
        />
      </div>

      <p
        v-if="profile.bio.trim()"
        class="mt-3 text-[13px] leading-5 text-fg-soft"
      >
        {{ profile.bio }}
      </p>
      <section v-if="!profile.isDiscordShadow" class="mt-3">
        <template v-if="showExpandedNoteUi">
          <div
            class="text-[10px] font-bold uppercase tracking-[0.2em] text-fg-subtle mb-1.5"
          >
            Note
          </div>
          <textarea
            ref="noteInputRef"
            v-model="draftNote"
            class="member-popout__note-input w-full resize-none overflow-hidden rounded px-0.5 py-0 text-[12px] text-fg-soft placeholder:text-fg-subtle focus:outline-none custom-scrollbar"
            rows="1"
            maxlength="256"
            placeholder="+"
            @blur="onNoteBlur"
            @input="resizeNoteInput($event.target as HTMLTextAreaElement)"
          />
        </template>
        <button
          v-else
          type="button"
          class="member-popout__note-compact"
          @click="openNoteEditor"
        >
          <span
            class="text-[10px] font-bold uppercase tracking-[0.2em] text-fg-subtle shrink-0"
            >Note</span
          >
          <span class="member-popout__note-compact__hint truncate text-left"
            >+</span
          >
        </button>
      </section>

      <section
        v-if="
          showGuildRolesInline &&
          (displayedRoles.length > 0 || roleManagementEnabled)
        "
        class="mt-3"
      >
        <div
          class="text-[10px] font-bold uppercase tracking-[0.2em] text-fg-subtle"
        >
          Roles
        </div>
        <div class="mt-2.5 flex flex-wrap gap-1.5 pb-1">
          <span
            v-for="role in rolesToRender"
            :key="role.id"
            class="member-role member-role--chip inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold relative"
            :style="memberPopoutRoleChipStyle(role.color)"
            @mouseenter="$emit('role-mouseenter', role.id)"
            @mouseleave="$emit('role-mouseleave', role.id)"
          >
            <span
              class="member-role__dot-wrap inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center"
            >
              <button
                v-if="
                  roleManagementEnabled &&
                  assignedRoleIds.includes(role.id) &&
                  hoveredDisplayedRoleId === role.id
                "
                type="button"
                class="member-role__remove-circle"
                title="Remove role"
                aria-label="Remove role"
                @click.stop="$emit('remove-role', role, $event)"
              >
                <svg
                  class="member-role__remove-circle-icon"
                  viewBox="0 0 16 16"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                  aria-hidden="true"
                >
                  <circle
                    cx="8"
                    cy="8"
                    r="7.5"
                    fill="rgba(255, 255, 255, 0.28)"
                  />
                  <path
                    d="M4.75 8h6.5"
                    stroke="rgba(255, 255, 255, 0.92)"
                    stroke-width="1.5"
                    stroke-linecap="round"
                  />
                </svg>
              </button>
              <span
                v-else
                class="member-role__dot-wrap inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center"
              >
                <img
                  v-if="roleIconImg(role)"
                  :src="roleIconImg(role)"
                  alt=""
                  class="member-role__icon"
                />
                <span
                  v-else
                  class="member-role__dot inline-block h-2 w-2 rounded-full"
                  :class="{
                    'member-role__dot--filled': memberRoleDotFilled(role),
                  }"
                  :style="memberRoleDotStyle(role)"
                />
              </span>
            </span>
            {{ role.name }}
          </span>
          <button
            v-if="hasRoleOverflow && !rolesExpanded"
            type="button"
            class="member-role member-role--overflow inline-flex items-center justify-center rounded-full px-2.5 py-1 text-[11px] font-semibold tabular-nums"
            :aria-label="`Show ${roleOverflowCount} more roles`"
            @click="rolesExpanded = true"
          >
            +{{ roleOverflowCount }}
          </button>
          <button
            v-if="hasRoleOverflow && rolesExpanded"
            type="button"
            class="member-role member-role--overflow member-role--overflow-collapse inline-flex items-center justify-center rounded-full px-2.5 py-1 text-[11px] font-semibold"
            aria-label="Show fewer roles"
            @click="rolesExpanded = false"
          >
            Show less
          </button>
          <button
            v-if="roleManagementEnabled"
            type="button"
            class="member-role member-role--action inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold"
            @click.stop="$emit('toggle-role-panel', $event)"
          >
            Add role
          </button>
        </div>
      </section>

      <section
        v-if="quickDmEnabled"
        class="member-popout__quick-dm mt-3 border-t border-border pt-3"
      >
        <form
          class="member-popout__quick-dm-form flex items-stretch gap-1.5"
          @submit.prevent="submitQuickDm"
        >
          <input
            ref="quickDmInputRef"
            v-model="quickDmDraft"
            type="text"
            class="member-popout__quick-dm-input min-w-0 flex-1 rounded-[10px] px-2.5 py-2 text-[13px] text-fg placeholder:text-fg-subtle outline-none"
            :placeholder="`Message @${profile.username}`"
            maxlength="2000"
            enterkeyhint="send"
            aria-label="Message user"
            @keydown.enter.exact.prevent="submitQuickDm"
          />
          <button
            type="submit"
            class="member-popout__quick-dm-send inline-flex shrink-0 items-center justify-center rounded-[10px] px-2.5 transition disabled:pointer-events-none disabled:opacity-35"
            :disabled="!quickDmDraft.trim()"
            aria-label="Send direct message"
          >
            <svg
              class="h-[18px] w-[18px] shrink-0 opacity-90"
              viewBox="0 0 24 24"
              fill="currentColor"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden="true"
            >
              <path
                d="M5 3a2 2 0 0 0-2 2v16l4-4h12a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2H5Z"
              />
            </svg>
          </button>
        </form>
      </section>
    </div>
  </div>
</template>

<style lang="scss">
@use '../expandedProfileShared.scss';
</style>

<style scoped lang="scss">
.member-popout__identity-primary {
  flex: 0 1 auto;
}

.member-popout__note-compact {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  width: 100%;
  padding: 0.4rem 0.35rem;
  margin: 0 -0.35rem;
  border: 0;
  border-radius: 0.5rem;
  background: transparent;
  text-align: left;
  cursor: pointer;
  outline: none;
  transition: background-color 0.14s ease;

  &:hover {
    background: color-mix(in srgb, white 4%, transparent);
  }

  &:focus-visible {
    background: color-mix(in srgb, white 6%, transparent);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 40%, transparent);
  }
}

.member-popout__note-compact__hint {
  flex: 1;
  min-width: 0;
  font-size: 0.75rem;
  color: var(--vue-auto-044);
  opacity: 0.88;
}

.member-popout__quick-dm-input {
  border: 1px solid var(--vue-auto-008);
  background: var(--vue-auto-007);
  transition:
    border-color 0.14s ease,
    box-shadow 0.14s ease;

  &:focus {
    border-color: var(--vue-auto-001);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 28%, transparent);
  }
}

.member-popout__quick-dm-send {
  border: 1px solid var(--vue-auto-008);
  background: var(--vue-auto-007);
  color: var(--vue-auto-044);

  &:hover:not(:disabled) {
    background: var(--vue-auto-002);
    border-color: var(--vue-auto-001);
    color: var(--vue-auto-006);
  }

  &:focus-visible {
    outline: none;
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 45%, transparent);
  }
}

.member-popout__note-input {
  min-height: 1.25rem;
  border: none;
  background: transparent;
}

.member-role {
  color: var(--vue-auto-044);
}

.member-role--chip {
  box-shadow: inset 0 1px 0 color-mix(in srgb, white 8%, transparent);
  transition:
    filter 0.14s ease,
    transform 0.14s ease;
}

.member-role--chip:hover {
  filter: brightness(1.12);
}

@media (prefers-reduced-motion: reduce) {
  .member-role--chip {
    transition: none;
  }
  .member-role--chip:hover {
    filter: none;
  }
}

.member-role--overflow,
.member-role--action {
  background: transparent;
  box-shadow: none;
}

.member-role--overflow:hover,
.member-role--action:hover {
  filter: none;
}

.member-role--action {
  cursor: pointer;
  transition:
    background-color 140ms ease,
    transform 140ms ease;
}

.member-role--action:hover {
  transform: translateY(-1px);
}

.member-role--overflow {
  cursor: pointer;
  border: 1px dashed var(--vue-auto-004);
  background: transparent;
  color: var(--vue-auto-044);
  transition:
    background-color 0.14s ease,
    border-color 0.14s ease,
    color 0.14s ease,
    transform 0.14s ease;
}

.member-role--overflow:hover {
  border-color: var(--vue-auto-001);
  color: var(--vue-auto-006);
  transform: translateY(-1px);
}

.member-role--overflow:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 45%, transparent);
}

.member-role--overflow-collapse {
  border-style: solid;
  opacity: 0.92;
}

.member-role__dot {
  width: 0.6rem;
  height: 0.6rem;
  display: inline-block;
  border-radius: 999px;
  background: transparent;
  border: 1px solid var(--vue-auto-004);
}

.member-role__dot--filled {
  border: none;
}

.member-role__icon {
  width: 0.8rem;
  height: 0.8rem;
  border-radius: 3px;
  object-fit: cover;
  display: block;
}

.member-role__remove-circle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 0.875rem;
  height: 0.875rem;
  padding: 0;
  border: 0;
  border-radius: 999px;
  cursor: pointer;
  background: transparent;
  transition:
    transform 120ms ease,
    opacity 120ms ease;
}

.member-role__remove-circle:hover {
  transform: scale(1.06);
  opacity: 0.95;
}

.member-role__remove-circle-icon {
  width: 0.875rem;
  height: 0.875rem;
  display: block;
}
</style>
