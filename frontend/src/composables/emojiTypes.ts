/**
 * Shared emoji picker types (kept separate from `useEmojiData` so search index state
 * does not create a module cycle with emoji loading).
 */
export interface EmojiEntry {
  emoji: string;
  skin_tone_support: boolean;
  name: string;
  slug: string;
  html: string;
  /** Server (or personal) custom emoji — insert token is `emoji`. */
  kind?: 'custom' | 'appIcon';
  /** Catalog filename when `kind === 'appIcon'`. */
  iconFilename?: string;
  id?: string;
  serverId?: string;
  animated?: boolean;
  imageUrl?: string;
}

export interface EmojiCategory {
  name: string;
  slug: string;
  emojis: EmojiEntry[];
  navIconHtml: string;
  navIconImageUrl?: string;
  navIconImageAlt?: string;
}
