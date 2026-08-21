<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import PausedGifAvatar from '@/components/PausedGifAvatar.vue';
import StatusIndicator from '@/components/StatusIndicator.vue';
import {
  isTrustedMediaUrl,
  safeImageUrl,
} from '@/features/layout/display/safeImageUrl';
import { useSimpleContextMenu } from '@/features/layout/useSimpleContextMenu';
import {
  selectPresence,
  type PresenceSelection,
} from '@/features/layout/presence';
import { icons } from '@/assets/icons';
import { useCompactShell } from '@/features/layout/useCompactShell';
import {
  clampEchoChannelName,
  ECHO_CHANNEL_NAME_MAX_LENGTH,
} from '@shared/echoChannelLimits';

type GroupMember = { id: string; name: string; pfp: string; status?: string };

const props = defineProps<{
  group: {
    id: string;
    name: string;
    pfp?: string;
    description?: string;
  } | null;
  members: GroupMember[];
  /** When true, show an Edit button in the panel header. */
  canEdit?: boolean;
  /** Used to hide self-target actions (kick/block). */
  currentUserId?: string;
  /** Live presence overlay — merged with member row status (see {@link DMPanel}). */
  presenceByUserId?: Record<string, string | undefined>;
  presenceMobileByUserId?: Record<string, true>;
}>();

const emit = defineEmits<{
  close: [];
  /** Open group settings modal focused on icon upload. */
  'edit-avatar': [];
  /** Open group settings modal focused on name (mobile / compact panel). */
  'edit-name': [];
  /** Persist new name from inline edit (desktop overview). */
  'update-group-name': [name: string];
  'add-members': [];
  'open-profile': [userId: string];
  'open-dm': [userId: string];
  'block-user': [userId: string];
  'kick-member': [payload: { groupId: string; userId: string }];
}>();

const { isCompactShell } = useCompactShell();

const groupDescription = computed(() => {
  const explicit = props.group?.description?.trim();
  if (explicit) return explicit;

  const names = props.members.map((m) => m.name);
  if (!names.length) return 'Private group DM';
  if (names.length === 1) return `Private group with ${names[0]}`;
  if (names.length === 2)
    return `Private group with ${names[0]} and ${names[1]}`;
  return `Private group with ${names[0]}, ${names[1]} and ${names.length - 2} others`;
});

const groupAvatarSrc = computed(
  () => props.group?.pfp || props.members[0]?.pfp || '',
);

const membersSorted = computed(() => {
  const withPfp: GroupMember[] = [];
  const withoutPfp: GroupMember[] = [];
  for (const m of props.members) {
    if (isTrustedMediaUrl(m.pfp)) withPfp.push(m);
    else withoutPfp.push(m);
  }
  return [...withPfp, ...withoutPfp];
});

const MENU_ITEM =
  'chat-focus-ring flex w-full items-center gap-2 rounded-sm px-3 py-2 text-left text-sm text-muted hover:bg-glass-tint';
const MENU_ITEM_KICK =
  'chat-focus-ring w-full px-3 py-2 text-left text-sm text-orange-200 hover:bg-orange-500/15 flex items-center gap-2 rounded-sm';

const {
  menuOpen,
  menuRef,
  menuPosition,
  openAtEvent,
  closeMenu,
  fitMenuToViewport,
} = useSimpleContextMenu();

const contextMember = ref<GroupMember | null>(null);

const editingName = ref(false);
const draftName = ref('');
const nameInputRef = ref<HTMLInputElement | null>(null);

watch(menuOpen, async () => {
  await nextTick();
  requestAnimationFrame(() => fitMenuToViewport(menuRef.value));
});

watch(
  () => props.group?.name,
  (n) => {
    if (!editingName.value && n) draftName.value = clampEchoChannelName(n);
  },
);

function close() {
  emit('close');
}

function addMembers() {
  emit('add-members');
}

function openAvatarEdit() {
  emit('edit-avatar');
}

function startNameEdit() {
  if (!props.canEdit || !props.group) return;
  if (isCompactShell.value) {
    emit('edit-name');
    return;
  }
  draftName.value = clampEchoChannelName(props.group.name);
  editingName.value = true;
  void nextTick(() => nameInputRef.value?.focus());
}

function commitNameEdit() {
  if (!props.group) return;
  const next = clampEchoChannelName(draftName.value.trim() || props.group.name);
  editingName.value = false;
  if (next !== props.group.name) {
    emit('update-group-name', next);
  }
}

function cancelNameEdit() {
  if (props.group) {
    draftName.value = clampEchoChannelName(props.group.name);
  }
  editingName.value = false;
}

function onNameInputKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter') {
    e.preventDefault();
    commitNameEdit();
  } else if (e.key === 'Escape') {
    e.preventDefault();
    cancelNameEdit();
  }
}

function openProfile(userId: string) {
  closeMenu();
  emit('open-profile', userId);
}

function openDm(userId: string) {
  closeMenu();
  emit('open-dm', userId);
}

function blockUser(userId: string) {
  closeMenu();
  emit('block-user', userId);
}

function kickMember(payload: { groupId: string; userId: string }) {
  closeMenu();
  emit('kick-member', payload);
}

async function handleMemberContextMenu(member: GroupMember, e: MouseEvent) {
  if (!props.group) return;
  contextMember.value = member;
  await openAtEvent(e);
}

const showKick = computed(() => {
  if (!props.canEdit) return false;
  const g = props.group;
  const m = contextMember.value;
  if (!g || !m) return false;
  const cur = (props.currentUserId ?? '').trim();
  if (cur && m.id === cur) return false;
  return true;
});

function memberRowPresence(member: GroupMember): PresenceSelection {
  return selectPresence({
    authoritativeStatus: props.presenceByUserId?.[member.id],
    rowStatus: member.status,
    diagnosticsKey: `group-dm-overview:${member.id}`,
    mobileSurface: !!props.presenceMobileByUserId?.[member.id],
  });
}
</script>

<template>
  <aside
    v-if="group"
    class="group-dm-panel flex h-full min-h-0 min-w-0 flex-col"
  >
    <!-- Header -->
    <div class="flex items-center justify-between gap-3 px-4 py-3">
      <div class="min-w-0 flex-1">
        <p
          class="text-[10px] font-bold uppercase tracking-[0.2em] text-fg-subtle"
        >
          Group DM
        </p>
        <div class="mt-0.5 min-w-0">
          <input
            v-if="canEdit && editingName && !isCompactShell"
            id="group-overview-name-edit"
            ref="nameInputRef"
            v-model="draftName"
            type="text"
            :maxlength="ECHO_CHANNEL_NAME_MAX_LENGTH"
            class="group-overview-name-input w-full truncate rounded-md border border-border bg-scrim-1 px-2 py-1 text-base font-bold text-foreground outline-none focus-visible:ring-2 focus-visible:ring-border"
            aria-label="Edit group name"
            @keydown="onNameInputKeydown"
            @blur="commitNameEdit"
          />
          <button
            v-else-if="canEdit"
            type="button"
            class="chat-focus-ring max-w-full truncate text-left text-base font-bold text-foreground"
            :title="
              isCompactShell ? 'Edit group name' : 'Edit group name inline'
            "
            aria-label="Edit group name"
            @click="startNameEdit"
          >
            {{ group.name }}
          </button>
          <h2 v-else class="truncate text-base font-bold text-foreground">
            {{ group.name }}
          </h2>
        </div>
      </div>
      <div class="flex shrink-0 items-center gap-2">
        <button
          v-if="canEdit"
          type="button"
          class="group-dm-header-icon-btn"
          title="Add members"
          aria-label="Add members"
          @click="addMembers"
        >
          <img
            :src="icons.friendAdd"
            alt=""
            class="h-4 w-4 opacity-90 filter invert"
          />
        </button>
        <button
          type="button"
          class="group-dm-close-btn"
          title="Close"
          aria-label="Close"
          @click="close"
        >
          <span class="text-base leading-none">×</span>
        </button>
      </div>
    </div>

    <!-- Group avatar -->
    <div class="flex flex-col items-center px-4 pt-2 pb-4">
      <button
        v-if="canEdit"
        type="button"
        class="group-dm-avatar-btn chat-focus-ring relative h-20 w-20 rounded-2xl ring-2 ring-border transition-opacity hover:opacity-95"
        title="Change group icon"
        aria-label="Change group icon"
        @click="openAvatarEdit"
      >
        <div
          class="relative h-full w-full overflow-hidden rounded-2xl bg-glass-2"
        >
          <template v-if="groupAvatarSrc">
            <PausedGifAvatar
              :src="safeImageUrl(groupAvatarSrc)"
              :alt="group.name"
              :session-key="group.id"
              img-class="rounded-2xl object-cover"
            />
          </template>
          <div
            v-else
            class="flex h-full w-full items-center justify-center text-xl font-semibold text-fg-soft bg-gradient-to-br from-indigo-500/70 to-purple-500/70"
          >
            {{ group.name.slice(0, 2).toUpperCase() }}
          </div>
        </div>
      </button>
      <div
        v-else
        class="relative h-20 w-20 rounded-2xl overflow-hidden bg-glass-2 ring-2 ring-border"
      >
        <template v-if="groupAvatarSrc">
          <PausedGifAvatar
            :src="safeImageUrl(groupAvatarSrc)"
            :alt="group.name"
            :session-key="group.id"
            img-class="rounded-2xl object-cover"
          />
        </template>
        <div
          v-else
          class="flex h-full w-full items-center justify-center text-xl font-semibold text-fg-soft bg-gradient-to-br from-indigo-500/70 to-purple-500/70"
        >
          {{ group.name.slice(0, 2).toUpperCase() }}
        </div>
      </div>
      <p class="mt-3 text-xs text-fg-soft">
        {{ members.length }} member{{ members.length === 1 ? '' : 's' }}
      </p>
      <p class="mt-1 text-xs text-fg-subtle text-center max-w-xs">
        {{ groupDescription }}
      </p>
    </div>

    <!-- Members list -->
    <div class="custom-scrollbar flex-1 overflow-y-auto px-4 pb-4 pt-2">
      <p class="group-section-label">Members</p>
      <div class="mt-2 space-y-1.5">
        <div
          v-for="member in membersSorted"
          :key="member.id"
          class="flex items-center gap-3 rounded-lg px-2.5 py-2 hover:bg-glass-1 cursor-pointer"
          @click="openProfile(member.id)"
          @contextmenu.prevent="handleMemberContextMenu(member, $event)"
        >
          <div class="relative h-8 w-8 shrink-0">
            <div class="h-8 w-8 overflow-hidden rounded-full">
              <PausedGifAvatar
                :src="safeImageUrl(member.pfp)"
                :alt="member.name"
                :session-key="member.id"
                img-class="rounded-full object-cover"
              />
            </div>
            <StatusIndicator
              v-if="memberRowPresence(member).isLoaded"
              :status="memberRowPresence(member).status ?? 'offline'"
              :mobile-surface="memberRowPresence(member).indicatorMobileSurface"
              size="sm"
              class="pointer-events-none z-[5]"
            />
          </div>
          <div class="min-w-0 flex-1 flex items-center gap-1.5">
            <p
              class="truncate text-sm"
              :class="
                memberRowPresence(member).isOffline
                  ? 'text-fg-subtle'
                  : 'text-fg'
              "
            >
              {{ member.name }}
            </p>
          </div>
        </div>
      </div>
    </div>

    <Teleport to="body">
      <div
        v-if="menuOpen && contextMember && group"
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
          @click="openProfile(contextMember.id)"
        >
          <img
            :src="icons.profileView"
            alt=""
            class="h-4 w-4 shrink-0 opacity-80 filter invert"
          />
          Profile
        </button>
        <button
          type="button"
          :class="MENU_ITEM"
          role="menuitem"
          @click="openDm(contextMember.id)"
        >
          <img
            :src="icons.message"
            alt=""
            class="h-4 w-4 shrink-0 opacity-80 filter invert"
          />
          Direct message
        </button>
        <button
          type="button"
          :class="MENU_ITEM"
          role="menuitem"
          @click="blockUser(contextMember.id)"
        >
          <img
            :src="icons.block"
            alt=""
            class="h-4 w-4 shrink-0 opacity-80 filter invert"
          />
          Block
        </button>
        <div v-if="showKick" class="my-1 h-px bg-glass-2" />
        <button
          v-if="showKick"
          type="button"
          :class="MENU_ITEM_KICK"
          role="menuitem"
          @click="kickMember({ groupId: group.id, userId: contextMember.id })"
        >
          <img
            :src="icons.kick"
            alt=""
            class="h-4 w-4 shrink-0 opacity-80 filter invert"
          />
          Kick from group
        </button>
      </div>
    </Teleport>
  </aside>
</template>

<style scoped lang="scss">
.group-dm-panel {
  background:
    radial-gradient(circle at top left, var(--vue-auto-022), transparent 26%),
    radial-gradient(
      circle at bottom right,
      var(--vue-auto-027),
      transparent 30%
    ),
    linear-gradient(180deg, var(--vue-auto-023), var(--vue-auto-024));
}

.group-dm-close-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 9999px;
  border: none;
  background: var(--vue-auto-002);
  color: var(--vue-auto-020);
  cursor: pointer;
  transition:
    background 0.15s ease,
    color 0.15s ease;

  &:hover {
    background: var(--vue-auto-004);
    color: var(--vue-auto-009);
  }
}

.group-dm-header-icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 9999px;
  border: none;
  background: var(--vue-auto-002);
  color: var(--vue-auto-020);
  cursor: pointer;
  transition:
    background 0.15s ease,
    color 0.15s ease;

  &:hover {
    background: var(--vue-auto-004);
    color: var(--vue-auto-009);
  }
}

.group-dm-avatar-btn {
  padding: 0;
  border: none;
  background: transparent;
  cursor: pointer;
}

.group-overview-name-input {
  box-sizing: border-box;
}

.group-section-label {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--vue-auto-029);
}
</style>
