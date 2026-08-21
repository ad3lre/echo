/** Paper document link visibility (who can open the share URL). */

export type PaperShareVisibility = 'server' | 'private' | 'global';

export type PaperShareAudienceSummary = {
  visibility: PaperShareVisibility;
  headline: string;
  detail: string;
};

export type PaperShareSettingsPayload = {
  channelId: string;
  serverId: string;
  visibility: PaperShareVisibility;
  shareUrl: string;
  publicShareUrl: string | null;
  shareToken: string | null;
  audience: PaperShareAudienceSummary;
  canManageShare: boolean;
};

export type PaperPublicDocumentPayload = {
  channelId: string;
  channelName: string;
  contentJson: Record<string, unknown>;
  contentSchemaVersion: number;
  revision: number;
  updatedAt: string;
};
