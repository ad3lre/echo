import { computed, ref, unref, watch, type Ref } from 'vue';
import type { useAuthSessionStore } from '@/features/auth/authSession';
import type { useServerStore } from '@/features/layout/server';
import type { WorkspaceStateApi } from '@/features/layout/echoWorkspace/useEchoWorkspace';
import type { MainSurface } from '@/features/layout/mainSurface';
import type { ChannelSummary } from '@shared/types';
import type { EchoForumPostRow } from '@/api/echo/forums';
import {
  createForumPost as createForumPostOrchestration,
  fetchForumPosts as fetchForumPostsOrchestration,
  patchForumPost as patchForumPostOrchestration,
} from '@/features/forums/forumPosts';
import { dispatchAppToast } from '@/features/layout/failures/controllerMissingAction';

/**
 * Per-forum post store: fetch/create/patch orchestration with loading + error maps,
 * an auto-refresh when the active surface is a forum, workspace category re-hydrate
 * after create, and navigation to the created post. Manage capability is derived
 * from the active forum channel.
 *
 * Returned names match what AppLayout previously provided, so the injection
 * contract for the forum section is unchanged.
 */
export function useForumPostsController(deps: {
  authSession: Pick<ReturnType<typeof useAuthSessionStore>, 'accessToken'>;
  serverStore: Pick<ReturnType<typeof useServerStore>, 'selectedServer'>;
  workspace: Pick<WorkspaceStateApi, 'categoriesByServer'>;
  mainSurface: Readonly<Ref<MainSurface | null>>;
  isEchoGraphId: (id: string) => boolean;
  canManageThisChannel: (channel: ChannelSummary) => boolean;
  findChannelContextById: (
    id: string | null | undefined,
  ) => { channel: ChannelSummary } | null | undefined;
  handleGoToChannel: (channelId: string) => void;
  handleGoToMessage: (channelId: string, messageId: string) => void;
}) {
  const {
    authSession,
    serverStore,
    workspace,
    mainSurface,
    isEchoGraphId,
    canManageThisChannel,
    findChannelContextById,
    handleGoToChannel,
    handleGoToMessage,
  } = deps;

  const forumPostsByForumId = ref<Record<string, EchoForumPostRow[]>>({});
  const forumPostsLoadingByForumId = ref<Record<string, boolean>>({});
  const forumPostsErrorByForumId = ref<Record<string, string | null>>({});

  async function refreshForumPosts(
    forumChannelId: string,
    opts?: {
      sort?: 'latest_activity' | 'creation_date';
      includeArchived?: boolean;
      limit?: number;
    },
  ): Promise<void> {
    const forumId = forumChannelId.trim();
    if (!forumId) return;
    const token = authSession.accessToken?.trim() ?? '';
    forumPostsLoadingByForumId.value = {
      ...forumPostsLoadingByForumId.value,
      [forumId]: true,
    };
    forumPostsErrorByForumId.value = {
      ...forumPostsErrorByForumId.value,
      [forumId]: null,
    };
    try {
      const rows = await fetchForumPostsOrchestration({
        token,
        forumChannelId: forumId,
        sort: opts?.sort ?? 'latest_activity',
        includeArchived: opts?.includeArchived ?? false,
        limit: opts?.limit ?? 100,
      });
      forumPostsByForumId.value = {
        ...forumPostsByForumId.value,
        [forumId]: rows,
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      forumPostsErrorByForumId.value = {
        ...forumPostsErrorByForumId.value,
        [forumId]: msg,
      };
    } finally {
      forumPostsLoadingByForumId.value = {
        ...forumPostsLoadingByForumId.value,
        [forumId]: false,
      };
    }
  }

  async function createForumPost(payload: {
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
  }): Promise<void> {
    const forumId = payload.forumChannelId.trim();
    if (!forumId) return;
    const token = authSession.accessToken?.trim() ?? '';
    try {
      const sid =
        serverStore.selectedServer?.id &&
        isEchoGraphId(serverStore.selectedServer.id)
          ? serverStore.selectedServer.id
          : null;
      const res = await createForumPostOrchestration({
        token,
        forumChannelId: forumId,
        refreshCategoriesForServerId: sid ?? undefined,
        body: {
          content: payload.content,
          ...(payload.tagIds ? { tagIds: payload.tagIds } : {}),
          ...(payload.mentions !== undefined
            ? { mentions: payload.mentions }
            : {}),
          ...(payload.imageUrl ? { imageUrl: payload.imageUrl } : {}),
          ...(payload.videoUrl ? { videoUrl: payload.videoUrl } : {}),
          ...(payload.gif ? { gif: true } : {}),
          ...(payload.imageSpoiler ? { imageSpoiler: true } : {}),
          ...(payload.poll !== undefined ? { poll: payload.poll } : {}),
          ...(payload.attachments !== undefined
            ? { attachments: payload.attachments }
            : {}),
          ...(payload.stickers !== undefined
            ? { stickers: payload.stickers }
            : {}),
          ...(payload.contentJson !== undefined
            ? { contentJson: payload.contentJson }
            : {}),
          ...(payload.contentSchemaVersion !== undefined
            ? { contentSchemaVersion: payload.contentSchemaVersion }
            : {}),
          ...(payload.messageFormatVersion !== undefined
            ? { messageFormatVersion: payload.messageFormatVersion }
            : {}),
        },
      });
      if (sid && res.refreshedCategories) {
        workspace.categoriesByServer.value = {
          ...workspace.categoriesByServer.value,
          [sid]: res.refreshedCategories,
        };
      }
      await refreshForumPosts(forumId);
      if (res.created.channelId) {
        if (res.created.messageId) {
          handleGoToMessage(res.created.channelId, res.created.messageId);
        } else {
          handleGoToChannel(res.created.channelId);
        }
      }
    } catch (e) {
      dispatchAppToast(
        e instanceof Error && e.message.trim()
          ? e.message.trim()
          : 'Failed to create forum post',
        'warning',
      );
    }
  }

  async function patchForumPost(payload: {
    postChannelId: string;
    pinned?: boolean;
    locked?: boolean;
    archivedAt?: string | null;
    tagIds?: unknown;
  }): Promise<void> {
    const token = authSession.accessToken?.trim() ?? '';
    const postId = payload.postChannelId.trim();
    if (!postId) return;
    await patchForumPostOrchestration({
      token,
      postChannelId: postId,
      patch: {
        ...(payload.pinned !== undefined ? { pinned: payload.pinned } : {}),
        ...(payload.locked !== undefined ? { locked: payload.locked } : {}),
        ...(payload.archivedAt !== undefined
          ? { archivedAt: payload.archivedAt }
          : {}),
        ...(payload.tagIds !== undefined ? { tagIds: payload.tagIds } : {}),
      },
    });
  }

  watch(
    () => unref(mainSurface),
    (s) => {
      if (s?.type !== 'serverForum') return;
      void refreshForumPosts(s.forumChannelId);
    },
    { immediate: true },
  );

  const canManageForumPosts = computed(() => {
    const s = unref(mainSurface);
    if (s?.type !== 'serverForum') return false;
    const ctx = findChannelContextById(s.forumChannelId);
    const forumCh = ctx?.channel;
    if (!forumCh) return false;
    return canManageThisChannel(forumCh);
  });

  return {
    forumPostsByForumId,
    forumPostsLoadingByForumId,
    forumPostsErrorByForumId,
    refreshForumPosts,
    createForumPost,
    patchForumPost,
    canManageForumPosts,
  };
}
