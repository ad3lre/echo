/** Paper channel document + margin comment wire types. */

export type PaperDocumentPayload = {
  channelId: string;
  contentJson: Record<string, unknown>;
  contentSchemaVersion: number;
  revision: number;
  updatedAt: string;
  updatedByUserId: string | null;
  paperCommentsEnabled: boolean;
  paperShowAuthorGutter: boolean;
  canAuthorPaper: boolean;
  canCommentOnPaper: boolean;
  canManagePaperComments: boolean;
  canDownloadPaper: boolean;
};

export type PaperCommentPayload = {
  id: string;
  channelId: string;
  anchorBlockId: string;
  anchorFrom: number | null;
  anchorTo: number | null;
  anchorQuote: string;
  authorId: string;
  body: string;
  parentCommentId: string | null;
  resolvedAt: string | null;
  resolvedByUserId: string | null;
  createdAt: string;
  updatedAt: string;
};

export const MAX_PAPER_COMMENT_BODY_CHARS = 4_000;
