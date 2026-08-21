<script setup lang="ts">
import { nextTick, ref, watch, toRef } from 'vue';
import { useFocusTrap } from '@/features/layout/useFocusTrap';
import PausedGifAvatar from '@/components/PausedGifAvatar.vue';
import { safeImageUrl } from '@/features/layout/display/safeImageUrl';
import {
  clampEchoChannelName,
  ECHO_CHANNEL_NAME_MAX_LENGTH,
} from '@shared/echoChannelLimits';

const props = defineProps<{
  modelValue: boolean;
  groupId: string;
  name: string;
  pfp: string;
  members?: { id: string; name: string; pfp: string }[];
  currentUserId?: string;
  /** After open, move focus to the name field or the change-icon control. */
  initialFocus?: 'name' | 'icon' | null;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  'update-group': [payload: { name: string; pfp: string }];
  'remove-member': [payload: { groupId: string; userId: string }];
  'leave-group': [payload: { groupId: string }];
  'add-members': [];
}>();

const draftName = ref(clampEchoChannelName(props.name));
const draftPfp = ref(props.pfp);

function close() {
  emit('update:modelValue', false);
}

function onAvatarChange(event: Event) {
  const input = event.target as HTMLInputElement | null;
  const file = input?.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    if (typeof reader.result === 'string') {
      draftPfp.value = reader.result;
    }
  };
  reader.readAsDataURL(file);
}

function save() {
  emit('update-group', {
    name: draftName.value.trim() || props.name,
    pfp: draftPfp.value || props.pfp,
  });
  emit('update:modelValue', false);
}

function removeMember(userId: string) {
  const groupId = props.groupId.trim();
  if (!groupId || !userId.trim()) return;
  emit('remove-member', { groupId, userId });
}

function leaveGroup() {
  const groupId = props.groupId.trim();
  if (!groupId) return;
  emit('leave-group', { groupId });
}

const modalRef = ref<HTMLElement | null>(null);
const nameInputRef = ref<HTMLInputElement | null>(null);
const changeIconButtonRef = ref<HTMLButtonElement | null>(null);
const fileInputRef = ref<HTMLInputElement | null>(null);
useFocusTrap(modalRef, toRef(props, 'modelValue'));

watch(
  () => props.modelValue,
  async (open) => {
    if (!open) return;
    draftName.value = clampEchoChannelName(props.name);
    draftPfp.value = props.pfp;
    const focus = props.initialFocus;
    if (focus !== 'name' && focus !== 'icon') return;
    await nextTick();
    if (focus === 'name') {
      nameInputRef.value?.focus();
      nameInputRef.value?.select();
    } else {
      changeIconButtonRef.value?.focus();
    }
  },
);
</script>

<template>
  <div
    v-if="modelValue"
    class="fixed inset-0 z-[160] flex items-center justify-center modal-overlay-bg bg-overlay-heavy"
    @click.self="close"
  >
    <div
      ref="modalRef"
      role="dialog"
      aria-modal="true"
      aria-labelledby="group-settings-modal-title"
      class="real-glass-modal relative w-full max-w-md rounded-2xl text-foreground bg-transparent"
    >
      <div
        class="rounded-2xl bg-scrim-2 border border-border p-6 shadow-xl backdrop-blur-md"
      >
        <h2
          id="group-settings-modal-title"
          class="text-center text-2xl font-bold"
        >
          Group settings
        </h2>
        <p class="mt-1.5 text-center text-sm text-muted">
          Update this group DM’s name and picture.
        </p>

        <div class="mt-5 flex items-center gap-4">
          <div
            class="relative h-16 w-16 overflow-hidden rounded-2xl ring-2 ring-border"
          >
            <PausedGifAvatar
              :src="safeImageUrl(draftPfp || pfp)"
              alt="Group avatar"
              session-key="group-dm-settings-icon"
              img-class="rounded-2xl object-cover"
            />
            <button
              ref="changeIconButtonRef"
              type="button"
              class="absolute -bottom-1 -right-1 flex h-7 w-7 cursor-pointer items-center justify-center rounded-full bg-overlay-heavy text-[11px] font-semibold text-foreground border border-border hover:bg-overlay-heavy"
              title="Change icon"
              aria-label="Change group icon"
              @click="fileInputRef?.click()"
            >
              ✎
            </button>
            <input
              ref="fileInputRef"
              type="file"
              accept="image/*"
              class="hidden"
              @change="onAvatarChange"
            />
          </div>
          <div class="flex-1">
            <label
              for="group-settings-name"
              class="block text-xs font-semibold uppercase tracking-wider text-gray-400"
            >
              Group name
            </label>
            <input
              id="group-settings-name"
              ref="nameInputRef"
              v-model="draftName"
              type="text"
              :maxlength="ECHO_CHANNEL_NAME_MAX_LENGTH"
              class="mt-2 w-full rounded-lg border border-border bg-elevated p-2.5 text-sm text-foreground outline-none"
            />
          </div>
        </div>

        <div v-if="(members?.length ?? 0) > 0" class="mt-5">
          <div class="mb-2 flex items-center justify-between">
            <p
              class="text-xs font-semibold uppercase tracking-wider text-gray-400"
            >
              Members
            </p>
            <button
              type="button"
              class="text-xs font-semibold text-indigo-200 hover:text-indigo-100"
              @click="emit('add-members')"
            >
              Add members
            </button>
          </div>
          <div class="max-h-44 space-y-1 overflow-y-auto pr-1 custom-scrollbar">
            <div
              v-for="member in members"
              :key="member.id"
              class="flex items-center gap-2 rounded-lg bg-scrim-1 px-2.5 py-2"
            >
              <div class="h-7 w-7 overflow-hidden rounded-full">
                <PausedGifAvatar
                  :src="safeImageUrl(member.pfp)"
                  :alt="member.name"
                  :session-key="`group-settings-${member.id}`"
                  img-class="rounded-full object-cover"
                />
              </div>
              <p class="min-w-0 flex-1 truncate text-sm text-fg">
                {{ member.name }}
              </p>
              <button
                v-if="member.id !== currentUserId"
                type="button"
                class="rounded px-2 py-1 text-[11px] font-semibold text-orange-200 hover:bg-orange-500/15"
                @click="removeMember(member.id)"
              >
                Remove
              </button>
            </div>
          </div>
        </div>

        <div v-if="currentUserId" class="mt-5">
          <button
            type="button"
            class="w-full rounded-lg border border-red-500/35 bg-red-500/10 px-3 py-2.5 text-sm font-semibold text-red-200 hover:bg-red-500/20"
            @click="leaveGroup"
          >
            Leave group
          </button>
        </div>

        <div class="mt-6 flex items-center justify-between">
          <button
            type="button"
            class="text-sm font-semibold text-fg-soft hover:text-foreground"
            @click="close"
          >
            Cancel
          </button>
          <button
            type="button"
            class="rounded-md bg-glass-2 px-5 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-glass-hover"
            @click="save"
          >
            Save Changes
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
