export type EventRsvpStatus = 'going' | 'declined';
export type EventRsvpChoice = EventRsvpStatus | null | undefined;

type RsvpButtonSize = 'sm' | 'md';

const BASE: Record<RsvpButtonSize, string> = {
  sm: 'rounded-lg px-2 py-1 text-[11px] font-semibold transition-all duration-150 active:scale-[0.97]',
  md: 'rounded-lg px-3 py-2 text-sm font-semibold transition-all duration-150 active:scale-[0.98]',
};

const MUTED: Record<RsvpButtonSize, string> = {
  sm: 'border border-border/40 bg-transparent text-fg-subtle opacity-55 hover:opacity-75 hover:bg-glass-hover',
  md: 'border border-border/40 bg-transparent text-fg-subtle opacity-55 hover:opacity-75 hover:bg-glass-hover',
};

const NEUTRAL: Record<RsvpButtonSize, string> = {
  sm: 'border border-border bg-glass-2 text-fg-soft hover:bg-glass-hover hover:text-foreground',
  md: 'border border-border bg-glass-2 text-fg-soft hover:bg-glass-hover hover:text-foreground',
};

export function rsvpGoingButtonClass(
  userRsvp: EventRsvpChoice,
  size: RsvpButtonSize = 'md',
): string {
  const base = BASE[size];
  if (userRsvp === 'going') {
    return `${base} bg-emerald-600 text-white shadow-[0_0_0_2px_color-mix(in_srgb,var(--bg)_30%,transparent),0_0_0_4px_rgba(16,185,129,0.45)]`;
  }
  if (userRsvp === 'declined') {
    return `${base} ${MUTED[size]}`;
  }
  return `${base} ${NEUTRAL[size]}`;
}

export function rsvpDeclinedButtonClass(
  userRsvp: EventRsvpChoice,
  size: RsvpButtonSize = 'md',
): string {
  const base = BASE[size];
  if (userRsvp === 'declined') {
    return `${base} bg-rose-600 text-white shadow-[0_0_0_2px_color-mix(in_srgb,var(--bg)_30%,transparent),0_0_0_4px_rgba(244,63,94,0.42)]`;
  }
  if (userRsvp === 'going') {
    return `${base} ${MUTED[size]}`;
  }
  return `${base} ${NEUTRAL[size]}`;
}

export function rsvpGoingLabel(
  userRsvp: EventRsvpChoice,
  size: RsvpButtonSize = 'md',
): string {
  if (userRsvp === 'going') {
    return size === 'sm' ? 'Going ✓' : "You're going";
  }
  return 'Going';
}

export function rsvpDeclinedLabel(
  userRsvp: EventRsvpChoice,
  size: RsvpButtonSize = 'md',
): string {
  if (userRsvp === 'declined') {
    return size === 'sm' ? "Can't go ✓" : "You're not going";
  }
  return 'Not going';
}

export function rsvpStatusBannerClass(userRsvp: EventRsvpChoice): string {
  if (userRsvp === 'going') {
    return 'border border-emerald-500/40 bg-emerald-500/15 text-emerald-800 dark:text-emerald-100';
  }
  if (userRsvp === 'declined') {
    return 'border border-rose-500/40 bg-rose-500/15 text-rose-800 dark:text-rose-100';
  }
  return '';
}

export function rsvpStatusBannerText(userRsvp: EventRsvpChoice): string {
  if (userRsvp === 'going') return "You're going to this event.";
  if (userRsvp === 'declined') return "You marked that you're not going.";
  return '';
}
