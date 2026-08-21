<script setup lang="ts">
import { ref, computed, watch, toRef } from 'vue';
import { useFocusTrap } from '@/features/layout/useFocusTrap';
import { useAutofocusOnOpen } from '@/features/layout/useAutofocusOnOpen';
import PausedGifAvatar from '@/components/PausedGifAvatar.vue';
import { safeImageUrl } from '@/features/layout/display/safeImageUrl';
import {
  ECHO_PLAN_GROUP_DM_MAX_MEMBERS,
  resolveEchoGroupDmMaxMembers,
} from '@shared/echoPlanLimits';
import {
  clampEchoChannelName,
  ECHO_CHANNEL_NAME_MAX_LENGTH,
} from '@shared/echoChannelLimits';

const props = withDefaults(
  defineProps<{
    modelValue: boolean;
    friends: { id: string; name: string; pfp: string; status?: string }[];
    /** Optional IDs that should start selected (e.g. current DM partner). */
    preselectedIds?: string[];
    /** Optional IDs that are locked and cannot be toggled off. */
    lockedIds?: string[];
    /** Total members including you (server enforces per plan). */
    maxGroupMembers?: number;
  }>(),
  { maxGroupMembers: ECHO_PLAN_GROUP_DM_MAX_MEMBERS.free },
);

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  'create-group': [payload: { name: string; memberIds: string[] }];
}>();

const selectedIds = ref<string[]>([]);
const groupName = ref('');
const submitError = ref<string | null>(null);

/** Sane cap aligned with {@link resolveEchoGroupDmMaxMembers} (bad payloads → free-tier default). */
const effectiveMaxGroupMembers = computed(() =>
  resolveEchoGroupDmMaxMembers(props.maxGroupMembers),
);

/** Friends selected; total headcount = 1 (you) + len(selected). */
const maxFriendSlots = computed(() =>
  Math.max(0, effectiveMaxGroupMembers.value - 1),
);

const friendIdSet = computed(
  () => new Set(props.friends.map((friend) => friend.id)),
);
const preselectedFriendIds = computed(() =>
  [...(props.preselectedIds ?? [])].filter((id) => friendIdSet.value.has(id)),
);
const isAddMembersMode = computed(() => (props.lockedIds?.length ?? 0) > 1);
const baseSelectedCount = computed(() => preselectedFriendIds.value.length);

const lockedIdSet = computed(() => new Set(props.lockedIds ?? []));

/** Locked rows (add-members: existing group) are not toggleable — show separately. */
const lockedFriendsInList = computed(() =>
  props.friends.filter((f) => lockedIdSet.value.has(f.id)),
);

const pickableFriends = computed(() =>
  props.friends.filter((f) => !lockedIdSet.value.has(f.id)),
);

const totalMembers = computed(() => 1 + selectedIds.value.length);

const overMaxMembers = computed(
  () => totalMembers.value > effectiveMaxGroupMembers.value,
);

/** Primary control stays enabled so min-size rules surface as submit-time messages. */
const isPrimaryDisabled = computed(() => overMaxMembers.value);

/**
 * Parent uses v-if on this modal, so the first time we mount, `modelValue` is already true.
 * A normal `watch` only runs when a value *changes*, so without `immediate: true` we never
 * copy `preselectedIds` into `selectedIds` on first paint; without `immediate: true` the
 * checklist would stay empty while props showed preselections (props ≠ local state).
 */
watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      selectedIds.value = [...preselectedFriendIds.value];
      groupName.value = '';
      submitError.value = null;
    }
  },
  { immediate: true },
);

watch(
  selectedIds,
  () => {
    submitError.value = null;
  },
  { deep: true },
);

function close() {
  emit('update:modelValue', false);
}

function toggleSelection(id: string) {
  if (props.lockedIds?.includes(id)) {
    return;
  }
  if (selectedIds.value.includes(id)) {
    selectedIds.value = selectedIds.value.filter((x) => x !== id);
  } else {
    if (selectedIds.value.length >= maxFriendSlots.value) {
      return;
    }
    selectedIds.value = [...selectedIds.value, id];
  }
}

function submit() {
  submitError.value = null;
  if (overMaxMembers.value) {
    submitError.value = `Groups can include at most ${effectiveMaxGroupMembers.value} people (including you).`;
    return;
  }
  if (isAddMembersMode.value) {
    if (selectedIds.value.length <= baseSelectedCount.value) {
      submitError.value = 'Select at least one person to add.';
      return;
    }
  } else if (totalMembers.value < 3) {
    submitError.value =
      'A group DM needs at least 3 people including you — pick at least two friends.';
    return;
  }
  const baseName =
    groupName.value.trim() ||
    (selectedIds.value.length === 1
      ? `Group with ${props.friends.find((f) => f.id === selectedIds.value[0])?.name ?? 'friend'}`
      : `Group with ${selectedIds.value.length} people`);
  const memberIds = [...selectedIds.value];
  emit('create-group', { name: clampEchoChannelName(baseName), memberIds });
  emit('update:modelValue', false);
}

const modalRef = ref<HTMLElement | null>(null);
const groupNameInputRef = ref<HTMLInputElement | null>(null);
useFocusTrap(modalRef, toRef(props, 'modelValue'));

useAutofocusOnOpen(toRef(props, 'modelValue'), groupNameInputRef);
</script>

<template>
  <Teleport to="body">
    <div
      v-if="modelValue"
      class="fixed inset-0 z-[240] flex items-center justify-center modal-overlay-bg px-4"
      @click.self="close"
    >
      <div
        ref="modalRef"
        role="dialog"
        aria-modal="true"
        aria-labelledby="group-dm-modal-title"
        class="real-glass-modal group-dm-create-modal pointer-events-auto relative w-full max-w-lg rounded-2xl p-6 text-foreground shadow-xl"
        @click.stop
      >
        <h2 id="group-dm-modal-title" class="text-center text-2xl font-bold">
          {{ isAddMembersMode ? 'Add members' : 'New group DM' }}
        </h2>
        <p class="mt-1.5 text-center text-sm text-muted">
          {{
            isAddMembersMode
              ? `Select friends to add to this group (up to ${effectiveMaxGroupMembers} people including you).`
              : `Choose friends to add to this private conversation (up to ${effectiveMaxGroupMembers} people including you; minimum 3).`
          }}
        </p>

        <div class="mt-5">
          <label
            for="group-dm-name"
            class="block text-xs font-semibold uppercase tracking-wider text-fg-subtle"
          >
            Group name
          </label>
          <input
            id="group-dm-name"
            ref="groupNameInputRef"
            v-model="groupName"
            type="text"
            placeholder="Group DM"
            :maxlength="ECHO_CHANNEL_NAME_MAX_LENGTH"
            class="chat-focus-ring mt-2 min-h-[44px] w-full rounded-lg border border-border bg-elevated px-3 py-2.5 text-sm text-foreground outline-none transition-colors placeholder:text-fg-subtle focus:border-[color-mix(in_srgb,var(--accent)_45%,var(--border))]"
          />
        </div>

        <div class="mt-5">
          <div class="mb-2 flex items-center justify-between">
            <span
              class="text-xs font-semibold uppercase tracking-wider text-fg-subtle"
            >
              Friends
            </span>
            <span class="text-xs text-muted">
              {{ selectedIds.length }} / {{ maxFriendSlots }} friends
            </span>
          </div>

          <div
            v-if="lockedFriendsInList.length > 0"
            class="mb-3 rounded-lg border border-border bg-glass-1 p-3"
          >
            <p
              class="mb-2 text-[10px] font-semibold uppercase tracking-wider text-fg-subtle"
            >
              Already in this conversation
            </p>
            <div class="space-y-2">
              <div
                v-for="friend in lockedFriendsInList"
                :key="`locked-${friend.id}`"
                class="flex items-center gap-3 opacity-95"
              >
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
                <div class="min-w-0 flex-1">
                  <p class="truncate text-sm font-semibold text-foreground">
                    {{ friend.name }}
                  </p>
                  <p
                    class="group-dm-create-included-hint text-[10px] font-semibold uppercase tracking-wide text-emerald-300"
                  >
                    Included · cannot remove
                  </p>
                </div>
                <div
                  class="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-emerald-400 bg-emerald-500"
                >
                  <span class="text-[10px] font-bold text-white">✓</span>
                </div>
              </div>
            </div>
          </div>

          <div
            v-if="pickableFriends.length > 0"
            class="custom-scrollbar max-h-64 space-y-1 overflow-y-auto"
            v-scrollbar-on-scroll
          >
            <button
              v-for="friend in pickableFriends"
              :key="friend.id"
              type="button"
              class="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors"
              :class="
                selectedIds.includes(friend.id)
                  ? 'bg-glass-3'
                  : 'bg-glass-1 hover:bg-glass-hover'
              "
              @click="toggleSelection(friend.id)"
            >
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
              <div class="min-w-0 flex-1">
                <p class="truncate text-sm font-semibold text-foreground">
                  {{ friend.name }}
                </p>
                <p v-if="friend.status" class="text-xs text-muted">
                  {{ friend.status }}
                </p>
              </div>
              <div
                class="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border"
                :class="
                  selectedIds.includes(friend.id)
                    ? 'border-emerald-400 bg-emerald-500'
                    : 'border-border bg-transparent'
                "
              >
                <span
                  v-if="selectedIds.includes(friend.id)"
                  class="text-[10px] font-bold text-white"
                  >✓</span
                >
              </div>
            </button>
          </div>
          <p
            v-else-if="friends.length === 0"
            class="mt-4 text-center text-xs text-muted"
          >
            You have no friends yet. Add some from the Friends tab first.
          </p>
          <p v-else class="mt-4 text-center text-xs text-muted">
            No additional friends to add yet. Add friends from the Friends tab,
            then open this dialog again.
          </p>
        </div>

        <p
          v-if="submitError"
          class="group-dm-create-submit-error mt-4 text-center text-sm font-medium text-amber-400"
          role="alert"
        >
          {{ submitError }}
        </p>

        <div class="mt-6 flex items-center justify-between">
          <button
            type="button"
            class="chat-focus-ring rounded-md px-1 py-0.5 text-sm font-semibold text-muted transition-colors hover:bg-glass-hover hover:text-foreground"
            @click="close"
          >
            Cancel
          </button>
          <button
            type="button"
            class="chat-focus-ring rounded-md bg-glass-2 px-5 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-glass-hover disabled:cursor-not-allowed disabled:opacity-40"
            :disabled="isPrimaryDisabled"
            @click="submit"
          >
            {{ isAddMembersMode ? 'Add Members' : 'Create Group DM' }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped lang="scss">
/* Backdrop: dim + blur (class names match other modals; this file had no styles before). */
.modal-overlay-bg {
  background-color: var(--vue-auto-011);
  backdrop-filter: blur(12px) saturate(1.05);
  -webkit-backdrop-filter: blur(12px) saturate(1.05);
}

/*
 * Opaque glass panel (was `bg-transparent` with no .real-glass-modal rules here, so chat
 * showed through the whole dialog).
 */
.real-glass-modal {
  background: var(--echo-modal-bg);
  border: 1px solid var(--border);
  box-shadow: var(--shadow-3);
  backdrop-filter: blur(24px) saturate(1.2);
  -webkit-backdrop-filter: blur(24px) saturate(1.2);
}
</style>

<style>
/* Pale modal surface: emerald-300 / amber-400 lack contrast on light glass */
html[data-theme='light'] .group-dm-create-included-hint {
  color: rgb(5 150 105);
}

html[data-theme='light'] .group-dm-create-submit-error {
  color: rgb(180 83 9);
}
</style>
