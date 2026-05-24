import type { MessageWithAuthor } from '@shared/types';
import type { EchoApiMessage } from '@/api/echoClient';
import { mapEchoMessageToRaw } from '@/services/domain/echoMessageSnapshots';
import type { EchoMessageSearchQueryInput } from '@/api/echoSearchParams';
import type {
  RawMessage,
  UserForAuthor,
} from '@/features/chat/chatMessageTypes';
import { buildMessageWithAuthor } from '@/features/chat/viewModel/messageWithAuthor';
import { isEchoGraphId } from '@/utils/echoIds';
import type {
  FilterChip,
  HasType,
  SearchFilters,
} from '@/features/chat/messageSearchTypes';
import type { ChannelCategory } from '@/composables/useChannels';
import { isGifHostLinkUrl, isInlineGifHostEmbed } from '@shared/gifHostLinks';

export const MESSAGES_PER_PAGE = 16;
export const API_BATCH_LIMIT = 24;
export const SEARCH_DEBOUNCE_MS = 320;
export const CLIENT_SEARCH_CORPUS_DEBOUNCE_MS = 64;

export function markApiSearchExhaustedFromBatch(
  rowsLength: number,
  batchLimit: number = API_BATCH_LIMIT,
): boolean {
  return rowsLength < batchLimit;
}

export type MessageWithOrder = MessageWithAuthor & {
  channelId?: string;
  channelName?: string;
  _order?: number;
};

const URL_REGEX = /https?:\/\/[^\s<>"{}|\\^`[\]]+/gi;

function isGifUrl(url: string): boolean {
  return isGifHostLinkUrl(url);
}

function messageHasInlineGifEmbed(
  m: MessageWithAuthor & {
    embeds?: { url?: string; image?: { url?: string } }[];
  },
): boolean {
  return m.embeds?.some(isInlineGifHostEmbed) ?? false;
}

function hasNonGifLink(content: string | undefined): boolean {
  if (!content) return false;
  const matches = content.match(URL_REGEX);
  if (!matches?.length) return false;
  return matches.some((url) => !isGifUrl(url));
}

export function messageMatchesHasType(
  m: MessageWithAuthor & {
    videoUrl?: string;
    audioUrl?: string;
    attachments?: { mimeType?: string }[];
  },
  type: HasType,
): boolean {
  switch (type) {
    case 'image':
      return !!(m.imageUrl && !m.gif && !isGifUrl(m.imageUrl));
    case 'gif':
      return !!(
        m.gif ||
        (m.imageUrl && isGifUrl(m.imageUrl)) ||
        messageHasInlineGifEmbed(m)
      );
    case 'link':
      return hasNonGifLink(m.content);
    case 'video':
      return !!(m as { videoUrl?: string }).videoUrl;
    case 'audio':
      return !!(m as { audioUrl?: string }).audioUrl;
    case 'docs': {
      const atts = (m as { attachments?: { mimeType?: string }[] }).attachments;
      return !!(
        atts?.length &&
        atts.some((a) => {
          const mime = (a.mimeType ?? '').toLowerCase();
          return (
            mime.startsWith('application/') ||
            mime.includes('pdf') ||
            mime.includes('document')
          );
        })
      );
    }
    default:
      return false;
  }
}

export function buildUserLookup(
  users: UserForAuthor[],
): Map<string, UserForAuthor> {
  const m = new Map<string, UserForAuthor>();
  for (const u of users) {
    m.set(u.id, u);
  }
  return m;
}

export function rawToSearchRow(
  msg: RawMessage,
  lookup: Map<string, UserForAuthor>,
  channelId: string,
  channelName: string,
  order: number,
): MessageWithOrder {
  const base = buildMessageWithAuthor(msg, lookup, {});
  return {
    ...base,
    channelId,
    channelName,
    _order: order,
  };
}

export function applyFilters(
  msgs: MessageWithOrder[],
  searchText: string,
  filters: SearchFilters,
): MessageWithOrder[] {
  let result = msgs;

  const q = searchText.trim().toLowerCase();

  if (filters.in) {
    const inVal = filters.in.toLowerCase().trim().replace(/^#/, '');
    result = result.filter((m) =>
      (m.channelName ?? '').toLowerCase().includes(inVal),
    );
  }
  if (filters.from) {
    const fromVal = filters.from.toLowerCase().trim().replace(/^@/, '');
    result = result.filter((m) =>
      m.author.name.toLowerCase().includes(fromVal),
    );
  }
  if (filters.mentions) {
    const needle = filters.mentions.toLowerCase().trim().replace(/^@/, '');
    result = result.filter((m) => {
      const ms = (m.mentions ?? []) as Array<{
        kind: string;
        label: string;
      }>;
      if (needle === 'everyone') {
        return ms.some((x) => x.kind === 'everyone');
      }
      if (needle === 'active') {
        return ms.some((x) => x.kind === 'active');
      }
      if (
        ms.some(
          (x) => x.kind === 'user' && x.label.toLowerCase().includes(needle),
        )
      ) {
        return true;
      }
      const mention = `@${needle}`;
      return (m.content ?? '').toLowerCase().includes(mention);
    });
  }
  if (filters.hasType) {
    result = result.filter((m) => messageMatchesHasType(m, filters.hasType!));
  }
  if (q) {
    result = result.filter((m) => (m.content ?? '').toLowerCase().includes(q));
  }

  return result;
}

/**
 * Strip trailing filter-command prefixes (in:, from:, mentions:, has:â€¦) from raw
 * input text so they are never sent as literal `q` content to the search API.
 */
const FILTER_PREFIX_TAIL_RE = /\b(?:in|from|mentions|has):\S*$/i;
const INLINE_FILTER_RE = /(^|\s)(in|from|mentions|has):(\S+)/gi;

function normalizeInlineFilterValue(
  key: 'in' | 'from' | 'mentions' | 'has',
  rawValue: string,
): string | HasType | undefined {
  const trimmed = rawValue.trim();
  if (!trimmed) return undefined;
  if (key === 'in') {
    return trimmed.replace(/^#/, '');
  }
  if (key === 'from' || key === 'mentions') {
    return trimmed.replace(/^@/, '');
  }
  const lowered = trimmed.toLowerCase();
  if (
    lowered === 'image' ||
    lowered === 'gif' ||
    lowered === 'link' ||
    lowered === 'video' ||
    lowered === 'audio' ||
    lowered === 'docs'
  ) {
    return lowered;
  }
  return undefined;
}

export function extractInlineSearchFilters(raw: string): {
  searchText: string;
  parsedFilters: Partial<SearchFilters>;
} {
  const parsedFilters: Partial<SearchFilters> = {};
  const searchText = raw
    .replace(
      INLINE_FILTER_RE,
      (match, leadingWs: string, key: string, value: string) => {
        const normalized = normalizeInlineFilterValue(
          key as 'in' | 'from' | 'mentions' | 'has',
          value,
        );
        if (normalized == null) return match;
        if (key === 'has') {
          parsedFilters.hasType = normalized as HasType;
        } else if (key === 'in') {
          parsedFilters.in = normalized as string;
        } else if (key === 'from') {
          parsedFilters.from = normalized as string;
        } else if (key === 'mentions') {
          parsedFilters.mentions = normalized as string;
        }
        return leadingWs;
      },
    )
    .replace(/\s+/g, ' ')
    .trim();

  return { searchText, parsedFilters };
}

export function stripFilterPrefixes(raw: string): string {
  return raw.replace(FILTER_PREFIX_TAIL_RE, '').trim();
}

export function resolveFilterChannelEchoId(
  filters: SearchFilters,
  allChannels: { id: string; name: string }[],
): string | undefined {
  if (!filters.in?.trim()) return undefined;
  const needle = filters.in.trim().toLowerCase();
  const hit = allChannels.find(
    (c) =>
      c.name.toLowerCase() === needle || `#${c.name}`.toLowerCase() === needle,
  );
  return hit?.id;
}

export function resolveAuthorIdFilter(
  filters: SearchFilters,
  users: UserForAuthor[],
): string | undefined {
  if (!filters.from?.trim()) return undefined;
  const needle = filters.from.trim().toLowerCase();
  const u = users.find((x) => x.name.toLowerCase().includes(needle));
  return u?.id;
}

export function apiMessagesToDisplay(
  apiMsgs: EchoApiMessage[],
  users: UserForAuthor[],
  channelNameById: Map<string, string>,
): MessageWithOrder[] {
  const lookup = buildUserLookup(users);
  const out: MessageWithOrder[] = [];
  let order = 0;
  for (const m of apiMsgs) {
    const raw = mapEchoMessageToRaw(m);
    const chName = channelNameById.get(m.channelId) ?? '';
    out.push(rawToSearchRow(raw, lookup, m.channelId, chName, order));
    order += 1;
  }
  return out;
}

export function isSearchActiveState(
  searchText: string,
  filters: SearchFilters,
): boolean {
  return (
    searchText.trim().length > 0 ||
    Object.keys(filters).filter(
      (k) => filters[k as keyof SearchFilters] !== undefined,
    ).length > 0
  );
}

export function categoriesToChannelList(
  categories: ChannelCategory[],
): { id: string; name: string }[] {
  const list: { id: string; name: string }[] = [];
  for (const cat of categories) {
    for (const ch of cat.channels) {
      list.push({ id: ch.id, name: ch.name });
    }
  }
  return list;
}

export function channelNameByIdFromList(
  channels: { id: string; name: string }[],
): Map<string, string> {
  const m = new Map<string, string>();
  for (const c of channels) {
    m.set(c.id, c.name);
  }
  return m;
}

export type SearchApiModeSnapshot = {
  echoSessionReady: boolean;
  selectedServerId: string | null | undefined;
  isInDMMode: boolean;
  activeChannelId: string;
  echoDmThreadIds: ReadonlySet<string>;
};

export function computeUseServerSearchApi(
  hasApiMode: boolean,
  snap: SearchApiModeSnapshot,
): boolean {
  return (
    hasApiMode &&
    snap.echoSessionReady &&
    !!snap.selectedServerId &&
    snap.selectedServerId !== 'echo' &&
    !snap.isInDMMode
  );
}

export function computeUseChannelSearchApi(
  hasApiMode: boolean,
  snap: SearchApiModeSnapshot,
): boolean {
  return (
    hasApiMode &&
    snap.echoSessionReady &&
    isEchoGraphId(snap.activeChannelId) &&
    snap.echoDmThreadIds.has(snap.activeChannelId)
  );
}

export function collectLocalSearchMessages(input: {
  searchActive: boolean;
  activeChannelId: string;
  allChannels: { id: string; name: string }[];
  users: UserForAuthor[];
  echoDmThreadIds: ReadonlySet<string>;
  hasApiMode: boolean;
  getIndexedMessages: (channelId: string) => readonly RawMessage[];
}): MessageWithOrder[] {
  if (!input.searchActive) return [];
  const lookup = buildUserLookup(input.users);
  const result: MessageWithOrder[] = [];
  let order = 0;
  const id = input.activeChannelId;

  if (id.startsWith('dm-group-')) {
    const channelMessages = input.getIndexedMessages(id);
    const chName = 'Group DM';
    for (const msg of channelMessages) {
      result.push(rawToSearchRow(msg, lookup, id, chName, order));
      order += 1;
    }
    return result;
  }
  if (input.hasApiMode && isEchoGraphId(id) && input.echoDmThreadIds.has(id)) {
    const channelMessages = input.getIndexedMessages(id);
    const chName = 'Direct message';
    for (const msg of channelMessages) {
      result.push(rawToSearchRow(msg, lookup, id, chName, order));
      order += 1;
    }
    return result;
  }
  if (id.startsWith('dm-')) {
    const channelMessages = input.getIndexedMessages(id);
    const otherUserId = id.replace(/^dm-/, '');
    const otherUser = input.users.find((u) => u.id === otherUserId);
    const chName = otherUser?.name ?? 'DM';
    for (const msg of channelMessages) {
      result.push(rawToSearchRow(msg, lookup, id, chName, order));
      order += 1;
    }
    return result;
  }
  for (const { id: chId, name: chName } of input.allChannels) {
    const channelMessages = input.getIndexedMessages(chId);
    for (const msg of channelMessages) {
      result.push(rawToSearchRow(msg, lookup, chId, chName, order));
      order += 1;
    }
  }
  return result;
}

export function buildEchoMessageSearchParams(input: {
  searchTextRaw: string;
  filters: SearchFilters;
  allChannels: { id: string; name: string }[];
  users: UserForAuthor[];
  before?: string;
}): EchoMessageSearchQueryInput {
  // Treat inline filters as commands anywhere in the input, not just at the end.
  // This keeps `q` focused on the remaining free-text content.
  const { searchText: normalizedText } = extractInlineSearchFilters(
    input.searchTextRaw,
  );
  const q = stripFilterPrefixes(normalizedText);
  const chEchoId = resolveFilterChannelEchoId(input.filters, input.allChannels);
  const authorId = resolveAuthorIdFilter(input.filters, input.users);
  const mentions = input.filters.mentions?.trim();
  const hasType = input.filters.hasType;
  return {
    limit: API_BATCH_LIMIT,
    ...(input.before ? { before: input.before } : {}),
    ...(q.length >= 1 ? { q } : {}),
    ...(chEchoId ? { channelId: chEchoId } : {}),
    ...(authorId ? { authorId } : {}),
    ...(mentions ? { mentions } : {}),
    ...(hasType ? { hasType } : {}),
  };
}

export function apiSearchCriteriaSatisfied(
  searchTextRaw: string,
  filters: SearchFilters,
  users: UserForAuthor[],
  allChannels: { id: string; name: string }[],
): boolean {
  const { searchText: normalizedText } =
    extractInlineSearchFilters(searchTextRaw);
  const q = stripFilterPrefixes(normalizedText);
  const hasQ = q.length >= 1;
  const hasIn = !!resolveFilterChannelEchoId(filters, allChannels);
  const hasAuthor = !!resolveAuthorIdFilter(filters, users);
  const hasMentions = !!filters.mentions?.trim();
  const hasHas = !!filters.hasType;
  return hasQ || hasIn || hasAuthor || hasMentions || hasHas;
}

export function buildFilterChips(filters: SearchFilters): FilterChip[] {
  const chips: FilterChip[] = [];
  if (filters.in) {
    const labelValue = filters.in.trim().replace(/^#/, '');
    chips.push({
      key: 'in',
      value: filters.in,
      label: `in: #${labelValue}`,
    });
  }
  if (filters.from) {
    const labelValue = filters.from.trim().replace(/^@/, '');
    chips.push({
      key: 'from',
      value: filters.from,
      label: `from: ${labelValue}`,
    });
  }
  if (filters.mentions) {
    const labelValue = filters.mentions.trim().replace(/^@/, '');
    chips.push({
      key: 'mentions',
      value: filters.mentions,
      label: `mentions: @${labelValue}`,
    });
  }
  if (filters.hasType) {
    chips.push({
      key: 'hasType',
      value: filters.hasType,
      label: `has:${filters.hasType}`,
    });
  }
  return chips;
}

export function searchScopeHintFromFlags(input: {
  hasApiMode: boolean;
  useServerSearchApi: boolean;
  useChannelSearchApi: boolean;
}): string {
  if (!input.hasApiMode) {
    return 'Search runs on message history loaded in this session.';
  }
  if (input.useServerSearchApi) {
    return 'Searching all text channels you can access in this server (live).';
  }
  if (input.useChannelSearchApi) {
    return 'Searching this DM thread (live).';
  }
  return 'Search runs on message history loaded in this session.';
}

export function computeTotalPagesApiMode(input: {
  accumulatedCount: number;
  exhausted: boolean;
  currentPage: number;
}): number {
  const pagesFromData = Math.max(
    1,
    Math.ceil(input.accumulatedCount / MESSAGES_PER_PAGE),
  );
  if (input.exhausted) return pagesFromData;
  return Math.max(pagesFromData, input.currentPage + 2);
}

export function computeTotalPagesClientMode(resultCount: number): number {
  return Math.max(1, Math.ceil(resultCount / MESSAGES_PER_PAGE));
}
