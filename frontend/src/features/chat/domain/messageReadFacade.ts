import { computed, type Ref } from 'vue';
import type { RawMessage } from '@/features/chat/chatMessageTypes';
import { messageWindowAuthority } from '@/features/chat/domain/messageWindowAuthority';
import { resolverVersion } from '@/features/chat/domain/channelMessageIndex';

/**
 * Single facade for reading canonical message state.
 * Consumers (SFCs, view models, controllers) must use this instead of reaching
 * into `channelMessageIndex` or raw `messages` records directly.
 */
export const messageReadFacade = {
  /** The ordered message IDs for the currently active channel. */
  get activeOrderedIds(): Ref<string[]> {
    return messageWindowAuthority.orderedIds;
  },

  /** Map of message IDs to their RawMessage entities for the active channel. */
  get activeEntitiesById(): Ref<Map<string, RawMessage>> {
    return messageWindowAuthority.entitiesById;
  },

  /** ID of the oldest message currently in the active channel window */
  get activeTopCursor(): Ref<string | null> {
    return messageWindowAuthority.topCursor;
  },

  /** ID of the newest message currently in the active channel window */
  get activeBottomCursor(): Ref<string | null> {
    return messageWindowAuthority.bottomCursor;
  },

  /** Whether there are older messages to load for the active channel. */
  get activeHasMoreOlder(): Ref<boolean> {
    return messageWindowAuthority.hasMoreOlder;
  },

  /** Whether there are newer messages to load for the active channel. */
  get activeHasMoreNewer(): Ref<boolean> {
    return messageWindowAuthority.hasMoreNewer;
  },

  /** The current scroll anchor ID (if any). */
  get activeAnchorId(): Ref<string | null> {
    return messageWindowAuthority.anchorId;
  },

  /** The currently retained loaded range for the active channel. */
  get activeRetainedLoadedRange(): Ref<{ start: number; end: number } | null> {
    return messageWindowAuthority.retainedLoadedRange;
  },

  /** Currently active channel ID from the authority's perspective. */
  getActiveChannelId(): string | null {
    return messageWindowAuthority.getActiveChannelId();
  },

  /**
   * Retrieves all image URLs for a given channel (e.g. for the image viewer).
   * Relies on the underlying channel message index but does not expose it.
   */
  getChannelImageUrls(channelId: string): Ref<readonly string[]> {
    return messageWindowAuthority.getIndex(channelId).imageUrls;
  },

  /**
   * Retrieves an entity by ID for a given channel. Useful when looking up messages
   * that might not be in the active channel window (e.g. search results).
   */
  getChannelEntity(
    channelId: string,
    messageId: string,
  ): RawMessage | undefined {
    return messageWindowAuthority.getIndex(channelId).byId.get(messageId);
  },

  /**
   * Retrieves all sorted messages for a given channel (e.g. for local client-side search).
   * Relies on the underlying channel message index but does not expose it.
   */
  getChannelMessages(channelId: string): readonly RawMessage[] {
    return messageWindowAuthority.getIndex(channelId).sorted.value;
  },

  /** Channel ids that currently have at least one cached message row. */
  listCachedChannelIds(): readonly string[] {
    return messageWindowAuthority.listCachedChannelIds();
  },

  /**
   * Global version bumped when any channel index changes its authors/image URLs.
   * Useful for triggering search corpus rebuilds.
   */
  get globalResolverVersion(): Ref<number> {
    return resolverVersion;
  },
} as const;
