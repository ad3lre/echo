import { echoFetch } from '@/api/echo/transport';
import type {
  PaperCommentPayload,
  PaperDocumentPayload,
} from '@shared/types/paper';
import type {
  PaperPublicDocumentPayload,
  PaperShareSettingsPayload,
  PaperShareVisibility,
} from '@shared/types/paperShare';

export async function fetchPaperDocument(
  channelId: string,
): Promise<PaperDocumentPayload> {
  return echoFetch<PaperDocumentPayload>(
    null,
    `/channels/${encodeURIComponent(channelId)}/paper`,
  );
}

export async function patchPaperDocument(
  channelId: string,
  body: { contentJson: Record<string, unknown>; expectedRevision: number },
): Promise<PaperDocumentPayload> {
  return echoFetch<PaperDocumentPayload>(
    null,
    `/channels/${encodeURIComponent(channelId)}/paper`,
    {
      method: 'PATCH',
      body: JSON.stringify(body),
    },
  );
}

export async function fetchPaperComments(channelId: string): Promise<{
  comments: PaperCommentPayload[];
}> {
  return echoFetch<{ comments: PaperCommentPayload[] }>(
    null,
    `/channels/${encodeURIComponent(channelId)}/paper/comments`,
  );
}

export async function createPaperComment(
  channelId: string,
  body: {
    anchorBlockId: string;
    anchorFrom?: number | null;
    anchorTo?: number | null;
    anchorQuote?: string;
    body: string;
    parentCommentId?: string | null;
  },
): Promise<{ comment: PaperCommentPayload }> {
  return echoFetch<{ comment: PaperCommentPayload }>(
    null,
    `/channels/${encodeURIComponent(channelId)}/paper/comments`,
    {
      method: 'POST',
      body: JSON.stringify(body),
    },
  );
}

export async function patchPaperComment(
  channelId: string,
  commentId: string,
  body: { body?: string; resolve?: boolean; unresolve?: boolean },
): Promise<{ comment: PaperCommentPayload }> {
  return echoFetch<{ comment: PaperCommentPayload }>(
    null,
    `/channels/${encodeURIComponent(channelId)}/paper/comments/${encodeURIComponent(commentId)}`,
    {
      method: 'PATCH',
      body: JSON.stringify(body),
    },
  );
}

export async function fetchPaperShareSettings(
  channelId: string,
): Promise<PaperShareSettingsPayload> {
  return echoFetch<PaperShareSettingsPayload>(
    null,
    `/channels/${encodeURIComponent(channelId)}/paper/share`,
  );
}

export async function patchPaperShareVisibility(
  channelId: string,
  visibility: PaperShareVisibility,
): Promise<PaperShareSettingsPayload> {
  return echoFetch<PaperShareSettingsPayload>(
    null,
    `/channels/${encodeURIComponent(channelId)}/paper/share`,
    {
      method: 'PATCH',
      body: JSON.stringify({ visibility }),
    },
  );
}

export async function fetchPublicPaperByToken(
  token: string,
): Promise<PaperPublicDocumentPayload> {
  return echoFetch<PaperPublicDocumentPayload>(
    null,
    `/public/paper/${encodeURIComponent(token)}`,
  );
}

export async function deletePaperComment(
  channelId: string,
  commentId: string,
): Promise<void> {
  await echoFetch<void>(
    null,
    `/channels/${encodeURIComponent(channelId)}/paper/comments/${encodeURIComponent(commentId)}`,
    { method: 'DELETE' },
  );
}
