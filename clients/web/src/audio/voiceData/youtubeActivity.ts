import type {
  VcActivityUiPhase,
  YoutubePlaylistEntry,
} from '@/features/voice/vcActivityTypes';

/** Wall-clock anchored playback sample for YouTube IFrame API sync (guild VC). */
export type EchoYoutubePlaybackSyncV1 = {
  playing: boolean;
  /** YouTube player media time in seconds at {@link wallMs}. */
  mediaTimeSec: number;
  /** `Date.now()` on the publisher when the sample was taken. */
  wallMs: number;
};

export type EchoYoutubeActivityV1 = {
  v: 1;
  t: 'youtube_activity';
  /** Wall-clock; receivers apply the newest payload to approximate shared “watch together” state. */
  updatedAt: number;
  fromUserId: string;
  fromName?: string;
  /** Guild VC activity surface — drives receiver UI phase (picker vs YouTube vs closed). */
  activityPhase: VcActivityUiPhase;
  playlist: YoutubePlaylistEntry[];
  currentIndex: number;
  youtubeBrowseOpen: boolean;
  /**
   * Optional: host publishes periodic samples; followers seek/play via the IFrame API.
   * Omitted on older clients and on non-YouTube phases.
   */
  ytPlayback?: EchoYoutubePlaybackSyncV1 | null;
};

function parseEchoYoutubePlaybackSyncV1(
  raw: unknown,
): EchoYoutubePlaybackSyncV1 | null {
  if (raw == null || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.playing !== 'boolean') return null;
  if (typeof o.mediaTimeSec !== 'number' || !Number.isFinite(o.mediaTimeSec)) {
    return null;
  }
  if (typeof o.wallMs !== 'number' || !Number.isFinite(o.wallMs)) return null;
  return {
    playing: o.playing,
    mediaTimeSec: o.mediaTimeSec,
    wallMs: o.wallMs,
  };
}

export function encodeEchoYoutubeActivity(
  p: EchoYoutubeActivityV1,
): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(p));
}

export function decodeEchoYoutubeActivity(
  raw: Uint8Array,
): EchoYoutubeActivityV1 | null {
  try {
    const o = JSON.parse(
      new TextDecoder().decode(raw),
    ) as EchoYoutubeActivityV1;
    if (o?.v !== 1 || o?.t !== 'youtube_activity') return null;
    if (typeof o.updatedAt !== 'number') return null;
    if (typeof o.fromUserId !== 'string' || !o.fromUserId.trim()) return null;
    if (!Array.isArray(o.playlist)) return null;
    if (typeof o.currentIndex !== 'number') return null;
    if (typeof o.youtubeBrowseOpen !== 'boolean') return null;
    const ap = (o as { activityPhase?: unknown }).activityPhase;
    if (
      ap !== 'closed' &&
      ap !== 'pick' &&
      ap !== 'youtube' &&
      ap !== 'wordle' &&
      ap !== 'hangman' &&
      ap !== 'skriggles' &&
      ap !== 'openguessr' &&
      ap !== 'skribbl_io' &&
      ap !== 'gartic_phone' &&
      ap !== 'krunker' &&
      ap !== 'codenames' &&
      ap !== 'richup' &&
      ap !== 'goober_dash' &&
      ap !== 'smash_karts' &&
      ap !== 'cluster_rush' &&
      ap !== 'tic_tac_toe'
    ) {
      return null;
    }
    const playlist: YoutubePlaylistEntry[] = [];
    for (const row of o.playlist) {
      if (!row || typeof row !== 'object') continue;
      if (typeof (row as YoutubePlaylistEntry).id !== 'string') continue;
      playlist.push(row as YoutubePlaylistEntry);
    }
    const rawYt = (o as { ytPlayback?: unknown }).ytPlayback;
    let ytPlaybackPart: { ytPlayback?: EchoYoutubePlaybackSyncV1 | null } = {};
    if (rawYt === null) ytPlaybackPart = { ytPlayback: null };
    else if (rawYt !== undefined) {
      const parsed = parseEchoYoutubePlaybackSyncV1(rawYt);
      if (parsed) ytPlaybackPart = { ytPlayback: parsed };
    }

    const merged = {
      ...o,
      playlist,
      ...ytPlaybackPart,
    } as EchoYoutubeActivityV1 & {
      codenamesRoomUrl?: unknown;
    };
    if ('codenamesRoomUrl' in merged) {
      delete (merged as { codenamesRoomUrl?: unknown }).codenamesRoomUrl;
    }
    return merged;
  } catch {
    return null;
  }
}
