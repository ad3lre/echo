import { describe, expect, it } from 'vitest';
import {
  rsvpDeclinedButtonClass,
  rsvpDeclinedLabel,
  rsvpGoingButtonClass,
  rsvpGoingLabel,
  rsvpStatusBannerText,
} from '@/features/server-events/rsvpUi';

describe('rsvpUi', () => {
  it('highlights the active RSVP choice and mutes the other', () => {
    expect(rsvpGoingButtonClass('going')).toContain('bg-emerald-600');
    expect(rsvpGoingButtonClass('declined')).toContain('opacity-55');
    expect(rsvpDeclinedButtonClass('declined')).toContain('bg-rose-600');
    expect(rsvpDeclinedButtonClass('going')).toContain('opacity-55');
  });

  it('uses explicit selected labels', () => {
    expect(rsvpGoingLabel('going', 'md')).toBe("You're going");
    expect(rsvpDeclinedLabel('declined', 'md')).toBe("You're not going");
    expect(rsvpStatusBannerText('declined')).toContain('not going');
  });
});
