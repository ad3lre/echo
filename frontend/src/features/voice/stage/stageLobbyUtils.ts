import type { EchoWorkspaceEventSummary } from '@/api/echoClient';

const ONE_HOUR_MS = 60 * 60 * 1000;

export type StageMode = 'youtube_live' | 'voice_only';

/** Optional tags in event description: `[stage:youtube_live]` or `[stage:voice_only]`. */
export function parseStageModeFromDescription(
  description: string,
): StageMode | null {
  const m = description.match(/\[stage:([a-z_]+)\]/i);
  if (m?.[1] === 'youtube_live') return 'youtube_live';
  if (m?.[1] === 'voice_only' || m?.[1] === 'vc_only') return 'voice_only';
  /** Legacy VC watch-together tag — treat as YouTube live for stage events. */
  if (/\[activity:youtube\]/i.test(description)) return 'youtube_live';
  return null;
}

export function formatStageModeLabel(mode: StageMode): string {
  if (mode === 'youtube_live') return 'YouTube live';
  if (mode === 'voice_only') return 'Voice only';
  return '';
}

/** Append or strip stage mode tags in event description. */
export function withStageModeInDescription(
  description: string,
  mode: StageMode | boolean | null,
): string {
  let d = description
    .replace(/\[stage:[^\]]+\]/gi, '')
    .replace(/\[activity:youtube\]/gi, '')
    .trim();
  const resolvedMode =
    mode === true ? 'youtube_live' : mode === false ? null : mode;
  if (resolvedMode === 'youtube_live') {
    d = d ? `${d}\n\n[stage:youtube_live]` : '[stage:youtube_live]';
  } else if (resolvedMode === 'voice_only') {
    d = d ? `${d}\n\n[stage:voice_only]` : '[stage:voice_only]';
  }
  return d;
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

export function listUpcomingStageEvents(
  events: readonly EchoWorkspaceEventSummary[],
  channelId: string,
  nowMs: number,
): EchoWorkspaceEventSummary[] {
  const cid = channelId.trim();
  if (!cid) return [];
  return events
    .filter((ev) => {
      if (ev.channelId?.trim() !== cid) return false;
      const end = new Date(ev.endsAt).getTime();
      return !Number.isNaN(end) && end > nowMs;
    })
    .sort(
      (a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime(),
    );
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
