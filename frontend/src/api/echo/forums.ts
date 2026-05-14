import { echoFetch } from './transport';

export type EchoForumPostListSort = 'latest_activity' | 'creation_date';

export type EchoForumPostRow = {
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

export async function listEchoForumPosts(
  token: string,
  forumChannelId: string,
  opts?: {
    sort?: EchoForumPostListSort;
    includeArchived?: boolean;
    limit?: number;
  },
): Promise<EchoForumPostRow[]> {
  const qs = new URLSearchParams();
  if (opts?.sort) qs.set('sort', opts.sort);
  if (opts?.includeArchived) qs.set('includeArchived', 'true');
  if (typeof opts?.limit === 'number') qs.set('limit', String(opts.limit));
  const suffix = qs.toString() ? `?${qs.toString()}` : '';
  return echoFetch<EchoForumPostRow[]>(
    token,
    `/channels/${encodeURIComponent(forumChannelId)}/forum/posts${suffix}`,
    { method: 'GET' },
  );
}

export async function createEchoForumPost(
  token: string,
  forumChannelId: string,
  body: {
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
  },
): Promise<{ channelId: string; messageId?: string }> {
  return echoFetch<{ channelId: string; messageId?: string }>(
    token,
    `/channels/${encodeURIComponent(forumChannelId)}/forum/posts`,
    { method: 'POST', body: JSON.stringify(body) },
  );
}

export async function patchEchoForumPost(
  token: string,
  postChannelId: string,
  patch: {
    pinned?: boolean;
    locked?: boolean;
    archivedAt?: string | null;
    tagIds?: unknown;
  },
): Promise<void> {
  await echoFetch<{ ok: true }>(
    token,
    `/channels/${encodeURIComponent(postChannelId)}/forum/post`,
    { method: 'PATCH', body: JSON.stringify(patch) },
  );
}
