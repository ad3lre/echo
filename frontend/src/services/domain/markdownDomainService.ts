import { MentionEntity } from '@shared/types';
import { findAllIdTokenMatches, type ParsedIdToken } from '@/utils/idTokens';

export type IdTokenResolvers = {
  userLabel?: (id: string) => string;
  channelLabel?: (id: string) => string;
  roleLabel?: (id: string) => string;
  serverLabel?: (id: string) => string;
  messageLabel?: (id: string) => string;
  customEmojiImageUrl?: (
    id: string,
    name: string,
    animated: boolean,
  ) => string | undefined;
  appIconImageUrl?: (filename: string) => string | undefined;
  _cacheVersion?: number;
};

/**
 * Domain Authority for Markdown Content Meaning.
 * Decides what content "means" (who is pinged, what is valid, how labels resolve).
 */
export const MarkdownDomainService = {
  /**
   * Check if text contains a mention that would ping a given user.
   * Authority: Domain (Business Rules for Pings).
   */
  mentionsUser(
    text: string | undefined,
    mentions: MentionEntity[] | undefined,
    userId: string | undefined,
    username: string | undefined,
  ): boolean {
    if (!text) return false;
    if (
      mentions?.some(
        (mention) => mention.kind === 'everyone' || mention.kind === 'active',
      )
    )
      return true;
    if (
      userId &&
      mentions?.some(
        (mention) => mention.kind === 'user' && mention.userId === userId,
      )
    ) {
      return true;
    }
    if (
      username &&
      mentions?.some(
        (mention) =>
          mention.kind === 'user' &&
          (mention.userId === userId ||
            mention.label.toLowerCase() === username.toLowerCase()),
      )
    ) {
      return true;
    }
    return false;
  },

  /**
   * Sort and validate mentions.
   * Authority: Domain (Normalization/Invariants).
   */
  sortMentions(text: string, mentions: MentionEntity[]): MentionEntity[] {
    let lastEnd = -1;
    return [...mentions]
      .sort((a, b) => a.start - b.start || a.end - b.end)
      .filter((mention) => {
        if (
          mention.start < 0 ||
          mention.end <= mention.start ||
          mention.end > text.length
        )
          return false;
        if (mention.start < lastEnd) return false;
        lastEnd = mention.end;
        return true;
      });
  },

  /**
   * Resolve ID tokens to labels using provided resolvers.
   * Authority: Domain (Identity Coordination).
   */
  resolveIdTokenLabel(
    parsed: ParsedIdToken,
    resolvers: IdTokenResolvers,
  ): string {
    switch (parsed.kind) {
      case 'user':
        return resolvers.userLabel?.(parsed.id) ?? parsed.id;
      case 'channel':
        return resolvers.channelLabel?.(parsed.id) ?? parsed.id;
      case 'role':
        return resolvers.roleLabel?.(parsed.id) ?? parsed.id;
      case 'server':
        return resolvers.serverLabel?.(parsed.id) ?? parsed.id;
      case 'message':
        return resolvers.messageLabel?.(parsed.id) ?? parsed.id;
      case 'emoji':
        return `:${parsed.name}:`;
      case 'appIcon': {
        const stem = parsed.filename.replace(/\.svg$/i, '').trim();
        return `:${stem.replace(/\s+/g, '_').toLowerCase()}:`;
      }
      default:
        return '';
    }
  },

  /**
   * Determine overlapped intervals.
   * Authority: Domain (Geometry of Content).
   */
  rangesOverlap(a0: number, a1: number, b0: number, b1: number): boolean {
    return a0 < b1 && b0 < a1;
  },
};
