import type { MentionEntity, MentionKind } from '@shared/types';

const MENTION_KINDS = new Set<MentionKind>([
  'user',
  'everyone',
  'active',
  'channel',
  'role',
]);
import { tryLocalStorageSetItem } from '@/features/layout/boot/localStoragePersist';

/** Persisted composer body for one channel (text, voice sidechat, DM, forum post box, etc.). */
export type ComposerDraftSnapshot = {
  content: string;
  mentions: MentionEntity[];
  contentJson?: Record<string, unknown> | null;
  updatedAt: number;
};

type ComposerDraftStore = Record<string, ComposerDraftSnapshot>;

export const COMPOSER_DRAFTS_STORAGE_KEY = 'echo-composer-drafts-v1';

const MAX_STORED_DRAFTS = 150;

let memoryCache: ComposerDraftStore | null = null;

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

function parseMentionEntity(raw: unknown): MentionEntity | null {
  if (!isRecord(raw)) return null;
  const kind = raw.kind;
  if (typeof kind !== 'string') return null;
  const start = raw.start;
  const end = raw.end;
  const label = raw.label;
  if (
    typeof start !== 'number' ||
    typeof end !== 'number' ||
    typeof label !== 'string'
  ) {
    return null;
  }
  const id = raw.id;
  if (typeof id !== 'string') return null;
  if (!MENTION_KINDS.has(kind as MentionKind)) return null;
  return {
    id,
    kind: kind as MentionKind,
    label,
    start,
    end,
  };
}

function parseStore(raw: string | null): ComposerDraftStore {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) return {};
    const out: ComposerDraftStore = {};
    for (const [channelId, entry] of Object.entries(parsed)) {
      if (!channelId.trim() || !isRecord(entry)) continue;
      const content = entry.content;
      if (typeof content !== 'string') continue;
      const mentionsRaw = entry.mentions;
      const mentions: MentionEntity[] = Array.isArray(mentionsRaw)
        ? mentionsRaw
            .map(parseMentionEntity)
            .filter((m): m is MentionEntity => m != null)
        : [];
      const updatedAt =
        typeof entry.updatedAt === 'number' && Number.isFinite(entry.updatedAt)
          ? entry.updatedAt
          : 0;
      const contentJson = isRecord(entry.contentJson)
        ? entry.contentJson
        : null;
      if (!isComposerDraftEmpty({ content, mentions })) {
        out[channelId] = { content, mentions, contentJson, updatedAt };
      }
    }
    return out;
  } catch {
    return {};
  }
}

function readStore(): ComposerDraftStore {
  if (memoryCache) return memoryCache;
  if (typeof localStorage === 'undefined') {
    memoryCache = {};
    return memoryCache;
  }
  try {
    memoryCache = parseStore(localStorage.getItem(COMPOSER_DRAFTS_STORAGE_KEY));
  } catch {
    memoryCache = {};
  }
  return memoryCache;
}

function writeStore(store: ComposerDraftStore): void {
  memoryCache = store;
  tryLocalStorageSetItem(COMPOSER_DRAFTS_STORAGE_KEY, JSON.stringify(store));
}

function pruneStore(store: ComposerDraftStore): ComposerDraftStore {
  const ids = Object.keys(store);
  if (ids.length <= MAX_STORED_DRAFTS) return store;
  const sorted = ids.sort(
    (a, b) => (store[b]?.updatedAt ?? 0) - (store[a]?.updatedAt ?? 0),
  );
  const keep = new Set(sorted.slice(0, MAX_STORED_DRAFTS));
  const next: ComposerDraftStore = {};
  for (const id of keep) {
    const row = store[id];
    if (row) next[id] = row;
  }
  return next;
}

export function isComposerDraftEmpty(snapshot: {
  content: string;
  mentions: MentionEntity[];
}): boolean {
  return snapshot.content.trim().length === 0 && snapshot.mentions.length === 0;
}

export function readComposerDraft(
  channelId: string,
): ComposerDraftSnapshot | null {
  const id = channelId.trim();
  if (!id) return null;
  const row = readStore()[id];
  return row ?? null;
}

export function writeComposerDraft(
  channelId: string,
  snapshot: Omit<ComposerDraftSnapshot, 'updatedAt'>,
): void {
  const id = channelId.trim();
  if (!id) return;
  if (isComposerDraftEmpty(snapshot)) {
    clearComposerDraft(id);
    return;
  }
  const store = { ...readStore() };
  store[id] = { ...snapshot, updatedAt: Date.now() };
  writeStore(pruneStore(store));
}

export function clearComposerDraft(channelId: string): void {
  const id = channelId.trim();
  if (!id) return;
  const store = readStore();
  if (!store[id]) return;
  const next = { ...store };
  delete next[id];
  writeStore(next);
}

/** Test helper: reset module cache between specs. */
export function resetComposerDraftStorageForTests(): void {
  memoryCache = null;
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem(COMPOSER_DRAFTS_STORAGE_KEY);
  }
}
