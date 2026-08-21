import { ECHO_CHANNEL_INITIAL_MESSAGE_PAGE_SIZE } from '@/features/chat/echoHistoryPageSize';
import type { RawMessage } from '@/features/chat/chatMessageTypes';
import { applyEchoHistoryInitialPageFromApi } from '@/features/chat/domain/echoHistoryChannelApply';
import { messageWindowAuthority } from '@/features/chat/domain/messageWindowAuthority';

const CACHE_KEY = 'echo_message_cache_v1';
const MAX_CACHED_CHANNELS = 8;

export type CachedChannelMessages = {
  channelId: string;
  messages: RawMessage[];
  hasMoreOlder: boolean;
  ts: number;
};

type MessageSessionCachePayload = {
  userId: string;
  channels: CachedChannelMessages[];
};

function trimMessagesForCache(messages: RawMessage[]): RawMessage[] {
  if (messages.length <= ECHO_CHANNEL_INITIAL_MESSAGE_PAGE_SIZE)
    return messages;
  return messages.slice(-ECHO_CHANNEL_INITIAL_MESSAGE_PAGE_SIZE);
}

function readPayload(userId: string): MessageSessionCachePayload | null {
  if (typeof sessionStorage === 'undefined' || !userId.trim()) return null;
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as MessageSessionCachePayload;
    if (
      !parsed ||
      parsed.userId !== userId ||
      !Array.isArray(parsed.channels)
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writePayload(payload: MessageSessionCachePayload): void {
  if (typeof sessionStorage === 'undefined' || !payload.userId.trim()) return;
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(payload));
  } catch {
    /* quota / private mode */
  }
}

export function clearMessageSessionCache(): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.removeItem(CACHE_KEY);
  } catch {
    /* ignore */
  }
}

export function readMessageSessionCacheForChannel(
  userId: string,
  channelId: string,
): CachedChannelMessages | null {
  const cid = channelId.trim();
  if (!cid) return null;
  const payload = readPayload(userId);
  if (!payload) return null;
  return payload.channels.find((entry) => entry.channelId === cid) ?? null;
}

export function writeMessageSessionCacheForChannel(
  userId: string,
  channelId: string,
  messages: RawMessage[],
  hasMoreOlder: boolean,
): void {
  const uid = userId.trim();
  const cid = channelId.trim();
  if (!uid || !cid || messages.length === 0) return;

  const payload = readPayload(uid) ?? { userId: uid, channels: [] };
  const trimmed = trimMessagesForCache(messages);
  const nextEntry: CachedChannelMessages = {
    channelId: cid,
    messages: trimmed,
    hasMoreOlder,
    ts: Date.now(),
  };
  const without = payload.channels.filter((entry) => entry.channelId !== cid);
  const merged = [nextEntry, ...without]
    .sort((a, b) => b.ts - a.ts)
    .slice(0, MAX_CACHED_CHANNELS);
  writePayload({ userId: uid, channels: merged });
}

export function persistMessageSessionCacheFromChannel(
  userId: string,
  channelId: string,
): void {
  const cid = channelId.trim();
  if (!cid) return;
  const index = messageWindowAuthority.getIndex(cid);
  const messages = index.sorted.value;
  if (messages.length === 0) return;
  writeMessageSessionCacheForChannel(
    userId,
    cid,
    [...messages],
    messageWindowAuthority.getHasMoreOlderForChannel(cid),
  );
}

/**
 * Synchronously seed an empty channel bucket from sessionStorage so the message
 * surface can paint cached history before the network round-trip.
 */
export function trySeedChannelFromMessageSessionCache(
  userId: string,
  channelId: string,
  activeChannelIdForCap: string,
): boolean {
  const cid = channelId.trim();
  if (!cid || !userId.trim()) return false;
  const index = messageWindowAuthority.getIndex(cid);
  if (index.sorted.value.length > 0) return false;

  const cached = readMessageSessionCacheForChannel(userId, cid);
  if (!cached?.messages.length) return false;

  applyEchoHistoryInitialPageFromApi(
    cid,
    cached.messages,
    cached.messages.length,
    activeChannelIdForCap,
    ECHO_CHANNEL_INITIAL_MESSAGE_PAGE_SIZE,
  );
  messageWindowAuthority.setHasMoreOlder(cid, cached.hasMoreOlder);
  return true;
}
