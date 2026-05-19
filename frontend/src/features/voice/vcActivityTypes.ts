export type VcActivityUiPhase =
  | 'closed'
  | 'pick'
  | 'youtube'
  | 'wordle'
  | 'hangman'
  | 'openguessr'
  | 'skribbl_io'
  | 'gartic_phone'
  | 'krunker'
  | 'codenames'
  | 'richup'
  | 'goober_dash'
  | 'smash_karts'
  | 'basketball_stars_2026'
  | 'cluster_rush'
  | 'tic_tac_toe';

/** Shown on VC avatars / channel list when a user has that activity surface open (LiveKit-broadcast). */
export type VcActivityPresenceKind =
  | 'youtube'
  | 'activities'
  | 'wordle'
  | 'hangman'
  | 'openguessr'
  | 'skribbl_io'
  | 'gartic_phone'
  | 'krunker'
  | 'codenames'
  | 'richup'
  | 'goober_dash'
  | 'smash_karts'
  | 'basketball_stars_2026'
  | 'cluster_rush'
  | 'tic_tac_toe';

/** OpenGuessr (GeoGuessr-style); embedded in the VC activity surface when allowed by the host. */
export const VC_OPENGUESSR_EMBED_URL = 'https://openguessr.com/';

/** Main lobby; room links use the same origin (e.g. `?room=…`). Response headers omit XFO / CSP frame-ancestors / COEP / CORP as of 2026-05-13 (`curl -sI`, Chrome UA). */
export const VC_SKRIBBL_IO_EMBED_URL = 'https://skribbl.io/';

export const VC_GARTIC_PHONE_EMBED_URL = 'https://garticphone.com/';

export const VC_KRUNKER_EMBED_URL = 'https://krunker.io/';

export const VC_RICHUP_EMBED_URL = 'https://richup.io/';

/** Winterpixel's browser build (same iframe-hosted activity pattern as other VC embeds). */
export const VC_GOOBER_DASH_EMBED_URL = 'https://gooberdash.winterpixel.io/';

/** Official Tall Team browser build. The response allows iframe embedding as of 2026-05-13. */
export const VC_SMASH_KARTS_EMBED_URL = 'https://smashkarts.io/';

/**
 * GameDistribution HTML5 player for MadPuffers' title (same id as OnlineGames.io embed).
 * `curl -sI` shows no X-Frame-Options / CSP frame-ancestors / COEP / CORP on this URL as of 2026-05-13.
 */
export const VC_BASKETBALL_STARS_2026_EMBED_URL =
  'https://html5.gamedistribution.com/516d6908fbc848bdb89e65a58a43a7dc/?gd_sdk_referrer_url=https://www.onlinegames.io/basketball-stars-2026/';

/**
 * Unity WebGL player path on clusterrush.io (not clusterrush.com — that host returns 403 + `X-Frame-Options: SAMEORIGIN`).
 * `curl -sSIL` (Chrome UA) on this URL: HTTP 200, no `X-Frame-Options`, CSP is only `upgrade-insecure-requests` as of 2026-05-13.
 */
export const VC_CLUSTER_RUSH_EMBED_URL =
  'https://clusterrush.io/game/cluster-rush/';

/** Third-party games loaded in an iframe (same pattern as OpenGuessr). */
export type VcIframeEmbedPhase =
  | 'openguessr'
  | 'skribbl_io'
  | 'gartic_phone'
  | 'krunker'
  | 'richup'
  | 'goober_dash'
  | 'smash_karts'
  | 'basketball_stars_2026'
  | 'cluster_rush';

export function isVcIframeEmbedPhase(
  p: VcActivityUiPhase,
): p is VcIframeEmbedPhase {
  return (
    p === 'openguessr' ||
    p === 'skribbl_io' ||
    p === 'gartic_phone' ||
    p === 'krunker' ||
    p === 'richup' ||
    p === 'goober_dash' ||
    p === 'smash_karts' ||
    p === 'basketball_stars_2026' ||
    p === 'cluster_rush'
  );
}

export function vcIframeEmbedUrl(p: VcIframeEmbedPhase): string {
  switch (p) {
    case 'openguessr':
      return VC_OPENGUESSR_EMBED_URL;
    case 'skribbl_io':
      return VC_SKRIBBL_IO_EMBED_URL;
    case 'gartic_phone':
      return VC_GARTIC_PHONE_EMBED_URL;
    case 'krunker':
      return VC_KRUNKER_EMBED_URL;
    case 'richup':
      return VC_RICHUP_EMBED_URL;
    case 'goober_dash':
      return VC_GOOBER_DASH_EMBED_URL;
    case 'smash_karts':
      return VC_SMASH_KARTS_EMBED_URL;
    case 'basketball_stars_2026':
      return VC_BASKETBALL_STARS_2026_EMBED_URL;
    case 'cluster_rush':
      return VC_CLUSTER_RUSH_EMBED_URL;
    default: {
      const _exhaustive: never = p;
      return _exhaustive;
    }
  }
}

export function vcIframeEmbedTitle(p: VcIframeEmbedPhase): string {
  switch (p) {
    case 'openguessr':
      return 'OpenGuessr';
    case 'skribbl_io':
      return 'skribbl.io';
    case 'gartic_phone':
      return 'Gartic Phone';
    case 'krunker':
      return 'Krunker';
    case 'richup':
      return 'Richup.io';
    case 'goober_dash':
      return 'Goober Dash';
    case 'smash_karts':
      return 'Smash Karts';
    case 'basketball_stars_2026':
      return 'Basketball Stars 2026';
    case 'cluster_rush':
      return 'Cluster Rush';
    default: {
      const _exhaustive: never = p;
      return _exhaustive;
    }
  }
}

/** One row in the shared YouTube queue (matches Echo API search item shape). */
export type YoutubePlaylistEntry = {
  id: string;
  title: string;
  channelTitle: string;
  thumbnailUrl: string | null;
};

/** Guild VC "activities" surface — fullscreen in the voice column (not a modal). */
export type VcActivityUiState = {
  phase: VcActivityUiPhase;
  /** Current embed id (derived from playlist[currentIndex] when possible). */
  youtubeVideoId: string | null;
  /**
   * When true: search / trending browser sidebar is visible (compact).
   * Collapses after picking a video so the player dominates.
   */
  youtubeBrowseOpen: boolean;
  /** Ordered queue; index 0 is "now playing" when non-empty. */
  playlist: YoutubePlaylistEntry[];
  /** Index into `playlist` for the active embed. */
  currentIndex: number;
};

export function youtubeNowPlaying(
  s: VcActivityUiState,
): YoutubePlaylistEntry | null {
  if (s.phase !== 'youtube' || !s.playlist.length) return null;
  const i = Math.min(Math.max(0, s.currentIndex), s.playlist.length - 1);
  return s.playlist[i] ?? null;
}

export function syncYoutubeVideoIdFromPlaylist(
  s: VcActivityUiState,
): string | null {
  const row = youtubeNowPlaying(s);
  return row?.id ?? null;
}

export function vcActivityPresenceKindsFromUi(
  s: VcActivityUiState,
): VcActivityPresenceKind[] {
  if (s.phase === 'closed') return [];
  if (s.phase === 'pick') return ['activities'];
  if (s.phase === 'wordle') return ['wordle'];
  if (s.phase === 'hangman') return ['hangman'];
  if (s.phase === 'openguessr') return ['openguessr'];
  if (s.phase === 'skribbl_io') return ['skribbl_io'];
  if (s.phase === 'gartic_phone') return ['gartic_phone'];
  if (s.phase === 'krunker') return ['krunker'];
  if (s.phase === 'codenames') return ['codenames'];
  if (s.phase === 'richup') return ['richup'];
  if (s.phase === 'goober_dash') return ['goober_dash'];
  if (s.phase === 'smash_karts') return ['smash_karts'];
  if (s.phase === 'basketball_stars_2026') return ['basketball_stars_2026'];
  if (s.phase === 'cluster_rush') return ['cluster_rush'];
  if (s.phase === 'tic_tac_toe') return ['tic_tac_toe'];
  return ['youtube'];
}
