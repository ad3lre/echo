import { describe, expect, it } from 'vitest';
import {
  countMemberListGuests,
  filterMemberListUsersForPanel,
} from './memberListGuestFilter';

describe('memberListGuestFilter', () => {
  const users = [
    { id: 'self', isGuest: true },
    { id: 'a', isGuest: false },
    { id: 'g1', isGuest: true },
    { id: 'g2', isGuest: true },
  ] as const;

  it('hides guests by default but keeps the signed-in guest visible', () => {
    expect(
      filterMemberListUsersForPanel(users, {
        showGuests: false,
        currentUserId: 'self',
      }).map((u) => u.id),
    ).toEqual(['self', 'a']);
  });

  it('shows all guests when showGuests is true', () => {
    expect(
      filterMemberListUsersForPanel(users, {
        showGuests: true,
        currentUserId: 'self',
      }).map((u) => u.id),
    ).toEqual(['self', 'a', 'g1', 'g2']);
  });

  it('counts guest rows', () => {
    expect(countMemberListGuests(users)).toBe(3);
  });
});
