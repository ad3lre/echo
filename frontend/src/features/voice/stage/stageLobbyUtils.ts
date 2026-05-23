import type { EchoWorkspaceEventSummary } from '@/api/echoClient';
import {
  isEchoVcActivityKey,
  type EchoVcActivityKey,
} from '@shared/vcActivityCatalog';

const ONE_HOUR_MS = 60 * 60 * 1000;

/** Optional tag in event description: `[activity:youtube]` */
export function parsePlannedActivityKeyFromDescription(
  description: string,
): EchoVcActivityKey | null {
  const m = description.match(/\[activity:([a-z0-9_]+)\]/i);
  if (!m?.[1] || !isEchoVcActivityKey(m[1])) return null;
  return m[1];
}

export function isStageEventLive(
  ev: EchoWorkspaceEventSummary,
  nowMs: number,
): boolean {
  const a = new Date(ev.startsAt).getTime();
  const b = new Date(ev.endsAt).getTime();
  return !Number.isNaN(a) && !Number.isNaN(b) && nowMs >= a && nowMs <= b;
}

/** Scheduled stage event starting within the next hour (or already live). */
export function isStageEventWithinPlanningWindow(
  ev: EchoWorkspaceEventSummary,
  nowMs: number,
): boolean {
  const start = new Date(ev.startsAt).getTime();
  const end = new Date(ev.endsAt).getTime();
  if (Number.isNaN(start) || Number.isNaN(end) || end <= nowMs) return false;
  if (nowMs >= start && nowMs <= end) return true;
  return start - nowMs <= ONE_HOUR_MS;
}

export function pickNearestStagePlanningEvent(
  events: readonly EchoWorkspaceEventSummary[],
  channelId: string,
  nowMs: number,
): EchoWorkspaceEventSummary | null {
  const cid = channelId.trim();
  if (!cid) return null;
  const matches = events.filter(
    (ev) =>
      ev.channelId?.trim() === cid &&
      isStageEventWithinPlanningWindow(ev, nowMs),
  );
  if (!matches.length) return null;
  matches.sort((a, b) => {
    const ta = new Date(a.startsAt).getTime();
    const tb = new Date(b.startsAt).getTime();
    return ta - tb;
  });
  return matches[0] ?? null;
}

const VC_ACTIVITY_DISPLAY_TITLES: Record<EchoVcActivityKey, string> = {
  youtube: 'YouTube',
  wordle: 'Wordle',
  hangman: 'Hangman',
  openguessr: 'OpenGuessr',
  skribbl_io: 'skribbl.io',
  gartic_phone: 'Gartic Phone',
  krunker: 'Krunker',
  codenames: 'Echoed Names',
  richup: 'Richup.io',
  goober_dash: 'Goober Dash',
  smash_karts: 'Smash Karts',
  basketball_stars_2026: 'Basketball Stars 2026',
  cluster_rush: 'Cluster Rush',
  tic_tac_toe: 'Tic-Tac-Toe',
};

export function formatVcActivityDisplayTitle(key: EchoVcActivityKey): string {
  return VC_ACTIVITY_DISPLAY_TITLES[key];
}

export function formatStageEventCountdown(
  ev: EchoWorkspaceEventSummary,
  nowMs: number,
): string {
  if (isStageEventLive(ev, nowMs)) return 'Live now';
  const start = new Date(ev.startsAt).getTime();
  const diff = Math.max(0, start - nowMs);
  const sec = Math.floor(diff / 1000);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h > 0) return `Starts in ${h}h ${m}m`;
  if (m > 0) return `Starts in ${m} min`;
  return 'Starting soon';
}
