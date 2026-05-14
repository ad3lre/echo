export interface Server {
  id: string;
  name: string;
  imageUrl: string;
  /** Optional wide banner image (server header). If omitted, fall back to `imageUrl`. */
  bannerImageUrl?: string;
  /** Vertical crop anchor for banner cover image (0 = top, 50 = center, 100 = bottom). */
  bannerPositionY?: number;
  /** When true (default), channel header applies the frosted blur layer over the banner. Client-side only. */
  bannerBlurEnabled?: boolean;
  /** When true, extra darkening overlay on the banner (blackout). Client-side only. */
  bannerBlackoutEnabled?: boolean;
  /** Echo: `echo_servers.owner_id` when loaded from API (not role-derived). */
  ownerId?: string;
  /** Echo: public invite path segment (`{PUBLIC_INVITE_BASE}/{vanityCode}`). */
  vanityCode?: string;
  /** Echo: Explore / server card blurb (`echo_servers.description`). */
  description?: string;
  /** Echo: public Explore tags (`echo_servers.tags`). */
  tags?: string[];
  /** Echo: include in public Explore directory listing. */
  listedInDirectory?: boolean;
  /** Echo: server-level chat spam protections for repeated messages and burst sends. */
  automodSpamEnabled?: boolean;
  createdAt?: string;
  updatedAt?: string;
  /** Echo: Discord Guild ID if this server was imported. */
  discordGuildId?: string;
}

export type EchoServerNotificationLevel =
  | 'all'
  | 'mentions'
  | 'mentions_direct'
  | 'none';
