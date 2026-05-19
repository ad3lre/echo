import type { EchoAttentionPingKind } from '@shared/types';
import type { ServerPingChannelDotDisplay } from '@shared/attentionPing';

/** UI-facing label for the shared attention ping kind. */
export type ServerPingKind = EchoAttentionPingKind;

/** One channel’s ping on the server rail, with a resolved channel name. */
export type ServerPingChannelDotWithLabel = ServerPingChannelDotDisplay & {
  label: string;
};

/** Capped list of per-channel ping dots + how many additional channels were omitted. */
export type ServerPingChannelDotsForServerRail = {
  dots: ServerPingChannelDotWithLabel[];
  overflowCount: number;
};

export function describeServerPingKind(kind: ServerPingKind): string {
  switch (kind) {
    case 'personal':
      return 'Unread personal mention';
    case 'role':
      return 'Unread role mention';
    case 'broadcast':
      return 'Unread @everyone or @Active';
    default:
      return 'Unread mention';
  }
}

/** Tooltip for server rail ping bubble (count matches badge; may be capped at 99). */
export function describeServerPingBubbleLine(
  kind: ServerPingKind,
  count: number,
): string {
  const n = count >= 99 ? '99+' : String(count);
  switch (kind) {
    case 'personal':
      return `${n} unread direct mention${count === 1 ? '' : 's'}`;
    case 'role':
      return `${n} unread role mention${count === 1 ? '' : 's'}`;
    case 'broadcast':
      return `${n} unread broadcast mention${count === 1 ? '' : 's'}`;
    default:
      return `${n} unread mention${count === 1 ? '' : 's'}`;
  }
}

/** Server icon tooltip: which channels still have mention-tier unread. */
export function describeServerPingChannelDotsSummary(
  dots: ReadonlyArray<ServerPingChannelDotWithLabel>,
  overflowCount: number,
): string {
  if (!dots.length) return '';
  const body = dots
    .map((d) => `${d.label} — ${describeServerPingKind(d.kind)}`)
    .join('; ');
  if (overflowCount > 0) {
    return `${body}; +${overflowCount} more channel${overflowCount === 1 ? '' : 's'}`;
  }
  return body;
}
