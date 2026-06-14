import type { VcActivityUiPhase } from '@/features/voice/vcActivityTypes';
import {
  parseEchoMediaPlaybackSyncV1,
  type EchoMediaPlaybackSyncV1,
} from './mediaPlaybackSync';

export type WatchTogetherTranscodeStatus =
  | 'uploading'
  | 'pending'
  | 'processing'
  | 'ready'
  | 'failed';

export type WatchTogetherPlaylistEntry = {
  id: string;
  storageKey: string;
  sourcePublicUrl: string;
  hlsManifestUrl: string | null;
  title: string;
  transcodeStatus: WatchTogetherTranscodeStatus;
  transcodeError?: string | null;
  byteLength: number;
};

export type EchoWatchTogetherActivityV1 = {
  v: 1;
  t: 'watch_together_activity';
  updatedAt: number;
  fromUserId: string;
  fromName?: string;
  sessionId: string;
  activityPhase: VcActivityUiPhase;
  sessionStarted: boolean;
  playlist: WatchTogetherPlaylistEntry[];
  currentIndex: number;
  browseOpen: boolean;
  wtPlayback?: EchoMediaPlaybackSyncV1 | null;
};

export function encodeEchoWatchTogetherActivity(
  p: EchoWatchTogetherActivityV1,
): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(p));
}

const VALID_PHASES = new Set<string>(['closed', 'pick', 'watch_together']);
const VALID_TRANSCODE = new Set<string>([
  'uploading',
  'pending',
  'processing',
  'ready',
  'failed',
]);

function parseWatchTogetherPlaylistEntry(
  row: unknown,
): WatchTogetherPlaylistEntry | null {
  if (!row || typeof row !== 'object') return null;
  const r = row as WatchTogetherPlaylistEntry;
  if (typeof r.id !== 'string') return null;
  if (typeof r.storageKey !== 'string') return null;
  if (typeof r.sourcePublicUrl !== 'string') return null;
  if (typeof r.title !== 'string') return null;
  if (typeof r.byteLength !== 'number') return null;
  const ts = (r as { transcodeStatus?: unknown }).transcodeStatus;
  if (typeof ts !== 'string' || !VALID_TRANSCODE.has(ts)) return null;
  const hls = (r as { hlsManifestUrl?: unknown }).hlsManifestUrl;
  if (hls != null && typeof hls !== 'string') return null;
  const err = (r as { transcodeError?: unknown }).transcodeError;
  if (err != null && typeof err !== 'string') return null;
  return {
    id: r.id,
    storageKey: r.storageKey,
    sourcePublicUrl: r.sourcePublicUrl,
    hlsManifestUrl: typeof hls === 'string' ? hls : null,
    title: r.title,
    transcodeStatus: ts as WatchTogetherTranscodeStatus,
    ...(typeof err === 'string' ? { transcodeError: err } : {}),
    byteLength: r.byteLength,
  };
}

export function decodeEchoWatchTogetherActivity(
  raw: Uint8Array,
): EchoWatchTogetherActivityV1 | null {
  try {
    const o = JSON.parse(
      new TextDecoder().decode(raw),
    ) as EchoWatchTogetherActivityV1;
    if (o?.v !== 1 || o?.t !== 'watch_together_activity') return null;
    if (typeof o.updatedAt !== 'number') return null;
    if (typeof o.fromUserId !== 'string' || !o.fromUserId.trim()) return null;
    if (typeof o.sessionId !== 'string' || !o.sessionId.trim()) return null;
    if (typeof o.sessionStarted !== 'boolean') return null;
    if (!Array.isArray(o.playlist)) return null;
    if (typeof o.currentIndex !== 'number') return null;
    if (typeof o.browseOpen !== 'boolean') return null;
    const ap = (o as { activityPhase?: unknown }).activityPhase;
    if (typeof ap !== 'string' || !VALID_PHASES.has(ap)) return null;

    const playlist: WatchTogetherPlaylistEntry[] = [];
    for (const row of o.playlist) {
      const parsed = parseWatchTogetherPlaylistEntry(row);
      if (parsed) playlist.push(parsed);
    }

    let currentIndex = o.currentIndex;
    if (
      !Number.isInteger(currentIndex) ||
      currentIndex < 0 ||
      (playlist.length > 0 && currentIndex >= playlist.length)
    ) {
      return null;
    }
    if (playlist.length === 0) currentIndex = 0;

    const rawWt = (o as { wtPlayback?: unknown }).wtPlayback;
    let wtPlaybackPart: { wtPlayback?: EchoMediaPlaybackSyncV1 | null } = {};
    if (rawWt === null) wtPlaybackPart = { wtPlayback: null };
    else if (rawWt !== undefined) {
      const parsed = parseEchoMediaPlaybackSyncV1(rawWt);
      if (parsed) wtPlaybackPart = { wtPlayback: parsed };
    }

    return {
      ...o,
      playlist,
      currentIndex,
      ...wtPlaybackPart,
    };
  } catch {
    return null;
  }
}
