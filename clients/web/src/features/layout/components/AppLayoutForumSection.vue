<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import ChatView from '@/features/chat/components/ChatView.vue';
import ChatInput from '@/features/chat/components/ChatInput.vue';
import { icons } from '@/assets/icons';
import { useSimpleContextMenu } from '@/features/layout/useSimpleContextMenu';
import { copyToClipboard } from '@/features/chat/copyToClipboard';
import { linkTokenChannel } from '@/features/layout/ids/idTokens';
import type { MainSurface } from '@/features/layout/mainSurface';
import type { ReactionFavorite } from '@/features/chat/emoji/useReactionFavorites';
import type {
  MemberRole,
  PopoutAnchorRect,
} from '@/features/member-profile/memberProfiles';
import type {
  ChannelSummary,
  MessageWithAuthor,
  MentionEntity,
  PollData,
  ReplyTo,
} from '@shared/types';
import { normalizeForumCreatorDefaultPerms } from '@shared/types';
import EchoDropdown from '@/components/EchoDropdown.vue';

type ForumPostRow = {
  id: string;
  forumChannelId: string;
  title: string;
  tagIds: string[];
  pinned: boolean;
  locked: boolean;
  archivedAt: string | null;
  createdAt: string;
  lastActivityAt: string;
  lastMessagePreview: string;
  messageCount: number;
  coverImageUrl: string | null;
  createdByUserId: string | null;
};

const props = defineProps<{
  mainSurface: MainSurface;
  selectedServerId: string;
  users: { id: string; name: string; pfp: string; status?: string }[];
  mentionUsers?: {
    id: string;
    name: string;
    pfp: string;
    status?: string;
    username?: string;
    nickname?: string;
  }[];
  mentionRoles?: { id: string; name: string; color?: string }[];
  allChannels: ChannelSummary[];
  effectiveActiveChannel: ChannelSummary | null;
  activeChannelMessagesMap: Map<
    string,
    MessageWithAuthor & { channelName?: string }
  >;
  sendMessage: (
    channelId: string,
    content: string,
    mentions?: MentionEntity[],
    imageUrl?: string,
    poll?: PollData,
    gif?: boolean,
    replyTo?: ReplyTo,
    imageSpoiler?: boolean,
    videoUrl?: string,
    attachments?: import('@shared/types').MessageAttachmentPayload[],
  ) => void;
  onRequestForward?: (
    message: MessageWithAuthor & { channelName?: string },
  ) => void;
  onPollVote?: (messageId: string, optionId: string) => void;
  onSaveEdit?: (
    messageId: string,
    newContent: string,
    attachments?: import('@shared/types').MessageAttachmentPayload[],
  ) => boolean | void | Promise<boolean | void>;
  onDelete?: (messageId: string) => void;
  onReact?: (messageId: string, emoji: string) => void;
  onGoToChannel?: (channelId: string) => void;
  onGoToMessage?: (channelId: string, messageId: string) => void;
  onOpenProfile?: (userId: string, anchorRect: PopoutAnchorRect | null) => void;
  onOpenProfileFromContextMenu?: (userId: string) => void;
  canModerateAuthor?: (authorId: string) => boolean;
  onModerateUser?: (payload: {
    action: 'kick' | 'ban' | 'timeout';
    targetUserId: string;
    timeoutMinutes?: number;
  }) => void;
  resolveAuthorRole?: (userId: string) => MemberRole;
  showNsfwGate?: boolean;
  onNsfwAcknowledge?: () => void;
  onNsfwDecline?: () => void;
  canShowDiscordChannelImport?: boolean;
  onOpenExplore?: () => void;
  transitionLoading?: boolean;
  guildShellSettling?: boolean;

  forumPostsByForumId: Record<string, ForumPostRow[]>;
  forumPostsLoadingByForumId: Record<string, boolean>;
  forumPostsErrorByForumId: Record<string, string | null>;
  refreshForumPosts: (
    forumChannelId: string,
    opts?: {
      sort?: 'latest_activity' | 'creation_date';
      includeArchived?: boolean;
      limit?: number;
    },
  ) => void | Promise<void>;
  createForumPost: (payload: {
    forumChannelId: string;
    content: string;
    tagIds?: string[];
    mentions?: unknown;
    imageUrl?: string;
    videoUrl?: string;
    gif?: boolean;
    imageSpoiler?: boolean;
    poll?: unknown;
    attachments?: unknown;
    stickers?: unknown;
    contentJson?: unknown;
    contentSchemaVersion?: number;
    messageFormatVersion?: number;
  }) => void | Promise<void>;
  patchForumPost: (payload: {
    postChannelId: string;
    pinned?: boolean;
    locked?: boolean;
    archivedAt?: string | null;
    tagIds?: unknown;
  }) => void | Promise<void>;
  /** Lock / archive — requires manage permission on the parent forum channel. */
  canManageForumPosts?: boolean;
  currentUserId?: string;
  linkedDiscordUserId?: string | null;
  topReactions?: ReactionFavorite[];
  removeReactionFavorite?: (emoji: string) => void;
}>();

const surface = computed(() =>
  props.mainSurface.type === 'serverForum' ? props.mainSurface : null,
);
const forumChannelId = computed(() => surface.value?.forumChannelId ?? '');
const selectedPostId = computed(() => surface.value?.postChannelId ?? '');

const posts = computed(
  () => props.forumPostsByForumId[forumChannelId.value] ?? [],
);
const loading = computed(
  () => props.forumPostsLoadingByForumId[forumChannelId.value] === true,
);
const error = computed(
  () => props.forumPostsErrorByForumId[forumChannelId.value] ?? null,
);

const forumChannelName = computed(() => {
  const id = forumChannelId.value;
  const found = props.allChannels.find((c) => c.id === id);
  return found?.name?.trim() || id;
});
const forumChannelForFormat = computed(
  () => props.allChannels.find((c) => c.id === forumChannelId.value) ?? null,
);
const selectedPost = computed(
  () => posts.value.find((p) => p.id === selectedPostId.value) ?? null,
);

const canManageForumPosts = computed(() => props.canManageForumPosts === true);

function forumCreatorDefaultsResolved() {
  const id = forumChannelId.value;
  const ch = props.allChannels.find((c) => c.id === id);
  return normalizeForumCreatorDefaultPerms(ch?.forumCreatorDefaultPerms);
}

function viewerCanModerateForumPost(p: ForumPostRow | null): boolean {
  if (!p) return false;
  if (canManageForumPosts.value) return true;
  const uid = props.currentUserId?.trim();
  if (!uid || p.createdByUserId !== uid) return false;
  return forumCreatorDefaultsResolved().managePostFlags;
}

const sortMode = ref<'latest_activity' | 'creation_date'>('latest_activity');
const viewMode = ref<'list' | 'grid'>('grid');
const searchQuery = ref('');
const createMode = ref(false);
const postContext = ref<ForumPostRow | null>(null);

const { menuOpen, menuRef, menuPosition, openAtEvent, closeMenu } =
  useSimpleContextMenu();

const normalizedSearchQuery = computed(() =>
  searchQuery.value.trim().toLowerCase(),
);
const visiblePosts = computed(() => {
  const q = normalizedSearchQuery.value;
  if (!q) return posts.value;
  return posts.value.filter((p) => {
    const title = p.title?.toLowerCase?.() ?? '';
    const preview = p.lastMessagePreview?.toLowerCase?.() ?? '';
    return title.includes(q) || preview.includes(q);
  });
});
const sortModeLabel = computed(() =>
  sortMode.value === 'latest_activity' ? 'Latest activity' : 'Creation date',
);

const forumSortDropdownOptions = [
  { value: 'latest_activity', label: 'Latest activity' },
  { value: 'creation_date', label: 'Creation date' },
] as const;
const viewModeLabel = computed(() =>
  viewMode.value === 'grid' ? 'Grid' : 'List',
);

function handlePostComposerSend(
  _channelId: string,
  content: string,
  mentions?: MentionEntity[],
  imageUrl?: string,
  poll?: PollData,
  gif?: boolean,
  _replyTo?: ReplyTo,
  imageSpoiler?: boolean,
  videoUrl?: string,
  attachments?: import('@shared/types').MessageAttachmentPayload[],
  contentJson?: unknown,
  contentSchemaVersion?: number,
) {
  const forumId = forumChannelId.value;
  if (!forumId) return;
  const c = content.trim();
  if (!c) return;
  void props.createForumPost({
    forumChannelId: forumId,
    content: c,
    ...(mentions?.length ? { mentions } : {}),
    ...(imageUrl ? { imageUrl } : {}),
    ...(videoUrl ? { videoUrl } : {}),
    ...(gif ? { gif: true } : {}),
    ...(imageSpoiler ? { imageSpoiler: true } : {}),
    ...(poll ? { poll } : {}),
    ...(attachments && attachments.length > 0 ? { attachments } : {}),
    ...(contentJson !== undefined ? { contentJson } : {}),
    ...(typeof contentSchemaVersion === 'number'
      ? { contentSchemaVersion }
      : {}),
    ...(contentJson !== undefined ? { messageFormatVersion: 2 } : {}),
  });
  createMode.value = false;
}

function openPost(postId: string) {
  props.onGoToChannel?.(postId);
}

function openPostContextMenu(e: MouseEvent, p: ForumPostRow) {
  postContext.value = p;
  void openAtEvent(e);
}

async function refreshCurrentForum() {
  const id = forumChannelId.value;
  if (!id) return;
  await props.refreshForumPosts(id, {
    sort: sortMode.value,
    includeArchived: false,
    limit: 100,
  });
}

function closePost() {
  if (!forumChannelId.value) return;
  props.onGoToChannel?.(forumChannelId.value);
}

async function togglePinned(p: ForumPostRow) {
  await props.patchForumPost({ postChannelId: p.id, pinned: !p.pinned });
  await props.refreshForumPosts(forumChannelId.value);
}

async function toggleLocked(p: ForumPostRow) {
  await props.patchForumPost({ postChannelId: p.id, locked: !p.locked });
  await props.refreshForumPosts(forumChannelId.value);
}

async function toggleArchived(p: ForumPostRow) {
  await props.patchForumPost({
    postChannelId: p.id,
    archivedAt: p.archivedAt ? null : new Date().toISOString(),
  });
  await props.refreshForumPosts(forumChannelId.value);
}

function copyPostId(p: ForumPostRow) {
  copyToClipboard(p.id);
}

function copyPostLink(p: ForumPostRow) {
  copyToClipboard(linkTokenChannel(p.id));
}

/** Split-view sidebar: prefer post cover, then creator avatar, then icon. */
function forumSplitListThumb(
  p: ForumPostRow,
): { kind: 'image'; src: string } | { kind: 'icon' } {
  const cover = p.coverImageUrl?.trim();
  if (cover) return { kind: 'image', src: cover };
  const uid = p.createdByUserId?.trim();
  if (uid) {
    const u = props.users.find((x) => x.id === uid);
    const pfp = u?.pfp?.trim();
    if (pfp) return { kind: 'image', src: pfp };
  }
  return { kind: 'icon' };
}

const splitViewPostRows = computed(() =>
  posts.value.map((p) => ({ p, thumb: forumSplitListThumb(p) })),
);

watch(
  () => forumChannelId.value,
  (id) => {
    if (!id) return;
    void refreshCurrentForum();
  },
  { immediate: true },
);

watch(
  () => sortMode.value,
  () => {
    if (!forumChannelId.value) return;
    void refreshCurrentForum();
  },
);

watch(
  () => selectedPostId.value,
  (id) => {
    if (!id) return;
  },
);
</script>

<template>
  <div
    v-if="!selectedPostId"
    class="relative min-h-0 min-w-0 flex-1 pt-12 flex flex-col"
  >
    <div class="min-h-0 flex-1 overflow-y-auto">
      <div class="mx-auto w-full max-w-[1180px] px-6">
        <div class="sticky top-0 z-20 backdrop-blur-xl pt-5 pb-4">
          <div class="rounded-2xl bg-glass-1">
            <div v-if="!createMode" class="flex items-center gap-2 px-4 py-3">
              <img
                :src="icons.search"
                alt=""
                class="h-4 w-4 shrink-0 opacity-70 filter invert"
              />
              <input
                v-model="searchQuery"
                type="search"
                class="w-full bg-transparent px-1 py-2 text-sm font-semibold text-fg placeholder:text-fg-subtle outline-none"
                placeholder="Search posts…"
              />
              <button
                v-if="normalizedSearchQuery"
                type="button"
                class="chat-focus-ring forum-creator-btn flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors"
                aria-label="Clear search"
                @click="searchQuery = ''"
              >
                <svg
                  viewBox="0 0 24 24"
                  width="18"
                  height="18"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.8"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  class="opacity-85"
                >
                  <path d="M18 6L6 18" />
                  <path d="M6 6l12 12" />
                </svg>
              </button>
              <button
                type="button"
                class="chat-focus-ring forum-creator-btn flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors"
                aria-label="Create post"
                @click="createMode = true"
              >
                <img
                  :src="icons.plus"
                  alt=""
                  class="h-4 w-4 opacity-90 filter invert"
                />
              </button>
            </div>

            <div v-else>
              <div class="flex items-center justify-between gap-2 px-4 pt-3">
                <div
                  class="flex min-w-0 items-center gap-2 text-xs font-semibold text-fg-soft"
                >
                  <img
                    :src="icons.pen"
                    alt=""
                    class="h-3.5 w-3.5 shrink-0 opacity-75 filter invert"
                  />
                  <span class="truncate">New post</span>
                </div>
                <button
                  type="button"
                  class="chat-focus-ring forum-creator-btn flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors"
                  aria-label="Cancel"
                  @click="createMode = false"
                >
                  <svg
                    viewBox="0 0 24 24"
                    width="18"
                    height="18"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.8"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    class="opacity-85"
                  >
                    <path d="M18 6L6 18" />
                    <path d="M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <ChatInput
                class="pt-1"
                placeholder="Start a post..."
                popout-direction="down"
                popout-theme="forum"
                :channel-name="forumChannelName"
                :channel-id="forumChannelId"
                :server-id="selectedServerId"
                :users="users"
                :mention-users="mentionUsers"
                :mention-roles="mentionRoles"
                :channels="allChannels"
                :send-message="handlePostComposerSend"
                :message-format-template="
                  forumChannelForFormat?.messageFormatTemplate
                "
                :message-format-hard="
                  forumChannelForFormat?.messageFormatHard === true
                "
              />
            </div>
          </div>

          <div
            v-if="!createMode && normalizedSearchQuery"
            class="mt-1.5 px-1 text-[11px] font-semibold text-fg-subtle"
          >
            Showing {{ visiblePosts.length }} results
          </div>
        </div>

        <div class="pb-5">
          <div
            v-if="error"
            class="mt-4 rounded-xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-200"
          >
            {{ error }}
          </div>

          <div
            v-else-if="!loading && posts.length === 0"
            class="mt-6 rounded-xl bg-glass-1 px-6 py-10 text-center"
          >
            <div class="text-base font-semibold text-fg-soft">
              Make the first post
            </div>
            <div class="mt-2 text-sm text-fg-subtle">
              Start the conversation and get things going.
            </div>
          </div>

          <div
            v-else-if="!loading && visiblePosts.length === 0"
            class="mt-6 rounded-xl bg-glass-1 px-6 py-10 text-center"
          >
            <div class="text-base font-semibold text-fg-soft">
              No matching posts
            </div>
            <div class="mt-2 text-sm text-fg-subtle">
              Try a different search, or clear it to see everything.
            </div>
            <button
              type="button"
              class="forum-creator-btn mt-4 rounded-lg px-4 py-2 text-sm font-semibold transition-colors"
              @click="searchQuery = ''"
            >
              Clear search
            </button>
          </div>

          <div
            v-else
            class="mt-4"
            :class="
              viewMode === 'grid'
                ? 'grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3'
                : 'space-y-2'
            "
          >
            <button
              v-for="p in visiblePosts"
              :key="p.id"
              type="button"
              class="group w-full rounded-xl bg-glass-1 text-left transition-colors hover:bg-glass-hover overflow-hidden"
              @click="openPost(p.id)"
              @contextmenu.stop.prevent="openPostContextMenu($event, p)"
            >
              <div
                v-if="viewMode === 'grid' && p.coverImageUrl"
                class="relative"
              >
                <img
                  :src="p.coverImageUrl"
                  alt=""
                  class="h-44 w-full object-cover"
                  loading="lazy"
                />
                <div
                  class="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/85 via-black/35 to-transparent"
                />
                <div class="absolute inset-x-0 bottom-0 p-4">
                  <div class="flex items-center gap-2">
                    <div class="truncate text-sm font-semibold text-fg">
                      {{ p.title }}
                    </div>
                    <span
                      v-if="p.pinned"
                      class="text-[10px] font-semibold text-amber-300"
                      >PIN</span
                    >
                    <span
                      v-if="p.locked"
                      class="text-[10px] font-semibold text-fg-soft"
                      >LOCK</span
                    >
                    <span
                      v-if="p.archivedAt"
                      class="text-[10px] font-semibold text-fg-soft"
                      >ARCH</span
                    >
                  </div>
                  <div
                    class="mt-0.5 flex items-center justify-between gap-3 text-[11px] text-fg-soft"
                  >
                    <span>{{ p.messageCount }} messages</span>
                    <span class="shrink-0">{{
                      new Date(p.lastActivityAt).toLocaleString()
                    }}</span>
                  </div>
                </div>
              </div>

              <div v-else class="p-4">
                <div class="flex items-start gap-3">
                  <span
                    v-if="viewMode === 'list' && p.coverImageUrl"
                    class="mt-0.5 flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-glass-1"
                  >
                    <img
                      :src="p.coverImageUrl"
                      alt=""
                      class="h-full w-full object-cover"
                      loading="lazy"
                    />
                  </span>
                  <span
                    v-else
                    class="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-glass-1"
                  >
                    <img
                      :src="icons.message"
                      alt=""
                      class="h-4 w-4 opacity-70 filter invert"
                    />
                  </span>
                  <div class="min-w-0 flex-1">
                    <div class="flex items-center gap-2">
                      <div class="truncate text-sm font-semibold text-fg">
                        {{ p.title }}
                      </div>
                      <span
                        v-if="p.pinned"
                        class="text-[10px] font-semibold text-amber-300"
                        >PIN</span
                      >
                      <span
                        v-if="p.locked"
                        class="text-[10px] font-semibold text-fg-subtle"
                        >LOCK</span
                      >
                      <span
                        v-if="p.archivedAt"
                        class="text-[10px] font-semibold text-fg-subtle"
                        >ARCH</span
                      >
                    </div>
                    <div class="mt-1 line-clamp-2 text-[12px] text-fg-subtle">
                      {{ p.lastMessagePreview || 'No messages yet' }}
                    </div>
                    <div
                      class="mt-2 flex items-center justify-between gap-3 text-[11px] text-fg-subtle"
                    >
                      <span>{{ p.messageCount }} messages</span>
                      <span class="shrink-0">{{
                        new Date(p.lastActivityAt).toLocaleString()
                      }}</span>
                    </div>
                  </div>
                </div>
              </div>
            </button>
          </div>
        </div>
      </div>
    </div>

    <Teleport to="body">
      <div
        v-if="menuOpen && postContext"
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
          class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-200 hover:bg-glass-hover"
          role="menuitem"
          @click="
            openPost(postContext.id);
            closeMenu();
          "
        >
          <img
            :src="icons.message"
            alt=""
            class="h-4 w-4 shrink-0 opacity-80 filter invert"
          />
          Open post
        </button>
        <div class="my-1 h-px bg-glass-2" role="separator" />
        <div
          class="px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-fg-subtle"
        >
          Channel list
        </div>
        <button
          type="button"
          class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-200 hover:bg-glass-hover"
          role="menuitem"
          @click="
            togglePinned(postContext);
            closeMenu();
          "
        >
          <img
            :src="icons.thumbtack"
            alt=""
            class="h-4 w-4 shrink-0 opacity-80 filter invert"
          />
          {{
            postContext.pinned
              ? 'Unpin from channel sidebar'
              : 'Pin to channel sidebar'
          }}
        </button>
        <template v-if="viewerCanModerateForumPost(postContext)">
          <div class="my-1 h-px bg-glass-2" role="separator" />
          <div
            class="px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-fg-subtle"
          >
            Moderation
          </div>
          <button
            type="button"
            class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-200 hover:bg-glass-hover"
            role="menuitem"
            @click="
              toggleLocked(postContext);
              closeMenu();
            "
          >
            <img
              :src="icons.shield"
              alt=""
              class="h-4 w-4 shrink-0 opacity-80 filter invert"
            />
            {{ postContext.locked ? 'Unlock post' : 'Lock post' }}
          </button>
          <button
            type="button"
            class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-200 hover:bg-glass-hover"
            role="menuitem"
            @click="
              toggleArchived(postContext);
              closeMenu();
            "
          >
            <img
              :src="icons.stopwatch"
              alt=""
              class="h-4 w-4 shrink-0 opacity-80 filter invert"
            />
            {{ postContext.archivedAt ? 'Restore post' : 'Archive post' }}
          </button>
        </template>
        <div class="my-1 h-px bg-glass-2" role="separator" />
        <button
          type="button"
          class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-200 hover:bg-glass-hover"
          role="menuitem"
          @click="
            copyPostLink(postContext);
            closeMenu();
          "
        >
          <svg
            class="h-4 w-4 shrink-0 text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
            />
          </svg>
          Copy link
        </button>
        <button
          type="button"
          class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-200 hover:bg-glass-hover"
          role="menuitem"
          @click="
            copyPostId(postContext);
            closeMenu();
          "
        >
          <svg
            class="h-4 w-4 shrink-0 text-gray-400"
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
          Copy post channel ID
        </button>
      </div>
    </Teleport>

    <div
      class="pointer-events-none absolute bottom-5 right-5 z-30 flex flex-col items-end gap-2"
    >
      <div
        v-if="loading"
        class="pointer-events-none rounded-full bg-scrim-2 px-3 py-1.5 text-xs font-semibold text-fg-soft backdrop-blur-xl"
      >
        Loading…
      </div>
      <button
        type="button"
        class="chat-focus-ring forum-creator-pill pointer-events-auto rounded-full px-4 py-2 text-xs font-semibold backdrop-blur-xl transition-colors"
        @click="
          sortMode =
            sortMode === 'latest_activity' ? 'creation_date' : 'latest_activity'
        "
      >
        Sort: {{ sortModeLabel }}
      </button>
      <button
        type="button"
        class="chat-focus-ring forum-creator-pill pointer-events-auto rounded-full px-4 py-2 text-xs font-semibold backdrop-blur-xl transition-colors"
        @click="viewMode = viewMode === 'grid' ? 'list' : 'grid'"
      >
        View: {{ viewModeLabel }}
      </button>
      <button
        type="button"
        class="chat-focus-ring forum-creator-pill pointer-events-auto rounded-full px-4 py-2 text-xs font-semibold backdrop-blur-xl transition-colors"
        @click="refreshCurrentForum"
      >
        Refresh
      </button>
    </div>
  </div>

  <div v-else class="flex min-h-0 flex-1 min-w-0 overflow-hidden">
    <aside
      class="flex w-[380px] shrink-0 flex-col min-h-0 border-r border-border bg-gradient-to-b from-black/35 via-black/20 to-black/30 pt-12 backdrop-blur-sm"
    >
      <div class="shrink-0 border-b border-border px-4 py-3.5">
        <div class="flex items-center justify-between gap-2">
          <div class="min-w-0">
            <div
              class="text-[10px] font-bold uppercase tracking-[0.12em] text-fg-subtle"
            >
              Forum
            </div>
            <div class="truncate text-sm font-semibold text-fg">
              {{ forumChannelName }}
            </div>
          </div>
          <button
            type="button"
            class="shrink-0 rounded-lg border border-border bg-glass-1 px-3 py-1.5 text-xs font-semibold text-fg-soft transition-colors hover:border-border hover:bg-glass-hover hover:text-white"
            @click="closePost"
          >
            Back
          </button>
        </div>
      </div>

      <div class="shrink-0 px-3 pb-3 pt-3">
        <div
          class="flex items-center justify-between gap-2 rounded-xl border border-border bg-scrim-2 px-3 py-2 shadow-inner shadow-black/20"
        >
          <EchoDropdown
            v-model="sortMode"
            class="forum-sort-dropdown min-w-0 flex-1"
            :options="[...forumSortDropdownOptions]"
            :trigger-label="sortModeLabel"
            compact
          />
          <button
            type="button"
            class="shrink-0 rounded-lg px-2 py-1 text-[10px] font-semibold text-fg-soft transition-colors hover:bg-glass-hover hover:text-white"
            @click="refreshCurrentForum"
          >
            Refresh
          </button>
        </div>
      </div>

      <div class="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-2.5 pb-4">
        <div
          v-if="loading"
          class="px-2 py-3 text-xs font-medium text-fg-subtle"
        >
          Loading…
        </div>
        <div
          v-else-if="error"
          class="rounded-lg border border-rose-500/20 bg-rose-500/10 px-3 py-2.5 text-xs text-rose-200"
        >
          {{ error }}
        </div>
        <div v-else class="flex flex-col gap-1.5">
          <button
            v-for="{ p, thumb } in splitViewPostRows"
            :key="p.id"
            type="button"
            class="group flex w-full items-stretch gap-3 rounded-xl border px-2.5 py-2.5 text-left transition-all duration-150"
            :class="
              selectedPostId === p.id
                ? 'forum-split-post--active border-border bg-glass-3 shadow-sm shadow-[rgba(15,23,42,0.12)]'
                : 'border-transparent bg-glass-1 hover:border-border hover:bg-glass-hover'
            "
            @click="openPost(p.id)"
            @contextmenu.stop.prevent="openPostContextMenu($event, p)"
          >
            <span
              class="relative mt-0.5 h-[52px] w-[52px] shrink-0 overflow-hidden rounded-lg bg-gradient-to-br from-white/10 to-white/[0.04] ring-1 ring-border"
            >
              <img
                v-if="thumb.kind === 'image'"
                :src="thumb.src"
                alt=""
                class="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.03]"
                loading="lazy"
              />
              <span
                v-else
                class="flex h-full w-full items-center justify-center bg-glass-1"
              >
                <img
                  :src="icons.message"
                  alt=""
                  class="h-5 w-5 opacity-55 filter invert"
                />
              </span>
            </span>
            <span class="min-w-0 flex-1 py-0.5">
              <span class="flex min-w-0 items-center gap-1.5">
                <span
                  class="truncate text-[13px] font-semibold leading-snug text-fg"
                  >{{ p.title }}</span
                >
                <span
                  v-if="p.pinned"
                  class="shrink-0 text-[9px] font-bold text-amber-300/95"
                  >PIN</span
                >
                <span
                  v-if="p.locked"
                  class="shrink-0 text-[9px] font-bold text-fg-subtle"
                  >LOCK</span
                >
                <span
                  v-if="p.archivedAt"
                  class="shrink-0 text-[9px] font-bold text-fg-subtle"
                  >ARCH</span
                >
              </span>
              <span
                class="mt-1 block line-clamp-2 text-[11.5px] leading-relaxed text-fg-subtle"
              >
                {{ p.lastMessagePreview || 'No messages yet' }}
              </span>
              <span
                class="mt-1.5 flex items-center gap-2 text-[10.5px] font-medium tabular-nums text-fg-subtle"
              >
                <span class="shrink-0">{{ p.messageCount }} messages</span>
                <span class="text-fg-subtle">·</span>
                <span class="min-w-0 truncate">{{
                  new Date(p.lastActivityAt).toLocaleString()
                }}</span>
              </span>
            </span>
          </button>
        </div>
      </div>
    </aside>

    <div class="min-h-0 min-w-0 flex-1 pt-12">
      <div class="flex h-full min-h-0 min-w-0 flex-col">
        <div
          class="flex items-center justify-between gap-2 border-b border-border px-4 py-2"
        >
          <div class="min-w-0">
            <div class="truncate text-sm font-semibold text-fg">
              {{ selectedPost?.title || 'Post' }}
            </div>
            <div
              class="mt-0.5 flex items-center gap-2 text-[11px] text-fg-subtle"
            >
              <span v-if="selectedPost?.pinned" class="text-amber-300"
                >Pinned</span
              >
              <span v-if="selectedPost?.locked">Locked</span>
              <span v-if="selectedPost?.archivedAt">Archived</span>
              <span
                v-if="
                  selectedPost &&
                  !selectedPost.locked &&
                  !selectedPost.archivedAt
                "
                class="text-emerald-300/90"
                >Open</span
              >
              <span v-if="selectedPost"
                >· {{ selectedPost.messageCount }} messages</span
              >
            </div>
          </div>
          <button
            type="button"
            class="shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold text-fg-soft hover:bg-glass-hover hover:text-white"
            @click="closePost"
          >
            Back to forum
          </button>
        </div>
        <ChatView
          class="min-h-0 min-w-0 flex-1"
          compact-top
          hide-floating-forum-back-button
          :active-channel="effectiveActiveChannel"
          :active-channel-messages="activeChannelMessagesMap"
          :server-id="selectedServerId"
          :resolve-author-role="resolveAuthorRole"
          :users="users"
          :mention-users="mentionUsers"
          :mention-roles="mentionRoles"
          :channels="allChannels"
          :send-message="sendMessage"
          :on-request-forward="onRequestForward"
          :current-user-id="currentUserId"
          :linked-discord-user-id="linkedDiscordUserId ?? null"
          :current-user-name="undefined"
          :current-user-pfp="undefined"
          :on-poll-vote="onPollVote"
          :on-save-edit="onSaveEdit"
          :on-delete="onDelete"
          :on-react="onReact"
          :top-reactions="topReactions"
          :remove-reaction-favorite="removeReactionFavorite"
          :on-go-to-channel="onGoToChannel"
          :on-go-to-message="onGoToMessage"
          :on-open-profile="onOpenProfile"
          :on-open-profile-from-context-menu="onOpenProfileFromContextMenu"
          :can-moderate-author="canModerateAuthor"
          :on-moderate-user="onModerateUser"
          :show-nsfw-gate="showNsfwGate"
          :on-nsfw-acknowledge="onNsfwAcknowledge"
          :on-nsfw-decline="onNsfwDecline"
          :transition-loading="transitionLoading"
          :guild-shell-settling="guildShellSettling"
          :can-show-discord-channel-import="canShowDiscordChannelImport"
          :on-open-explore="onOpenExplore"
        />
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.forum-creator-btn {
  background: color-mix(in srgb, var(--accent) 18%, transparent);
  color: var(--accent-contrast-fg);
}

.forum-creator-btn:hover {
  background: color-mix(in srgb, var(--accent) 24%, transparent);
}

.forum-creator-pill {
  background: color-mix(in srgb, var(--accent) 18%, transparent);
  color: var(--accent-contrast-fg);
}

.forum-creator-pill:hover {
  background: color-mix(in srgb, var(--accent) 24%, transparent);
}

.forum-split-post--active {
  box-shadow:
    inset 3px 0 0 0 color-mix(in srgb, var(--accent) 72%, transparent),
    0 1px 0 0 color-mix(in srgb, white 6%, transparent);
}

:deep(.forum-sort-dropdown .echo-dropdown-container) {
  min-width: 0;
  gap: 0;
}

:deep(.forum-sort-dropdown .echo-dropdown-trigger) {
  background: transparent;
  box-shadow: none;
  border-radius: 0.5rem;
  padding: 0.25rem 0.5rem;
}

:deep(.forum-sort-dropdown .echo-dropdown-trigger:hover) {
  background: var(--glass-hover);
}

:deep(.forum-sort-dropdown .echo-dropdown-trigger.echo-dropdown-trigger--open) {
  background: var(--glass-hover);
  box-shadow: none;
}

:deep(.forum-sort-dropdown .echo-dropdown-trigger-text) {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--fg-soft);
}

:deep(.forum-sort-dropdown .echo-dropdown-chevron) {
  width: 0.875rem;
  height: 0.875rem;
}
</style>
