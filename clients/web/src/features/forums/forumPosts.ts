import {
  createEchoForumPost,
  listEchoForumPosts,
  patchEchoForumPost,
  type EchoForumPostListSort,
  type EchoForumPostRow,
} from '@/api/echo/forums';
import { buildEchoChannelCategoriesForServer } from '@/api/echo/channels';
import type { ChannelCategory } from '@/features/layout/channels/useChannels';

export async function fetchForumPosts(opts: {
  token: string;
  forumChannelId: string;
  sort?: EchoForumPostListSort;
  includeArchived?: boolean;
  limit?: number;
}): Promise<EchoForumPostRow[]> {
  return listEchoForumPosts(opts.token, opts.forumChannelId, {
    sort: opts.sort,
    includeArchived: opts.includeArchived,
    limit: opts.limit,
  });
}

export async function createForumPost(opts: {
  token: string;
  forumChannelId: string;
  body: Parameters<typeof createEchoForumPost>[2];
  refreshCategoriesForServerId?: string;
}): Promise<{
  created: Awaited<ReturnType<typeof createEchoForumPost>>;
  refreshedCategories?: ChannelCategory[];
}> {
  const created = await createEchoForumPost(
    opts.token,
    opts.forumChannelId,
    opts.body,
  );
  if (opts.refreshCategoriesForServerId) {
    const refreshedCategories = await buildEchoChannelCategoriesForServer(
      opts.token,
      opts.refreshCategoriesForServerId,
    );
    return { created, refreshedCategories };
  }
  return { created };
}

export async function patchForumPost(opts: {
  token: string;
  postChannelId: string;
  patch: Parameters<typeof patchEchoForumPost>[2];
}): Promise<void> {
  await patchEchoForumPost(opts.token, opts.postChannelId, opts.patch);
}
