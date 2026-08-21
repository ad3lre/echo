import { describe, expect, it } from 'vitest';
import {
  ECHO_PLAN_GROUP_DM_MAX_MEMBERS,
  resolveEchoGroupDmMaxMembers,
} from '@shared/echoPlanLimits';

describe('resolveEchoGroupDmMaxMembers', () => {
  it('returns free-tier default for invalid inputs', () => {
    const fb = ECHO_PLAN_GROUP_DM_MAX_MEMBERS.free;
    expect(resolveEchoGroupDmMaxMembers(undefined)).toBe(fb);
    expect(resolveEchoGroupDmMaxMembers(null)).toBe(fb);
    expect(resolveEchoGroupDmMaxMembers('50')).toBe(fb);
    expect(resolveEchoGroupDmMaxMembers(NaN)).toBe(fb);
    expect(resolveEchoGroupDmMaxMembers(Infinity)).toBe(fb);
    expect(resolveEchoGroupDmMaxMembers(2)).toBe(fb);
    expect(resolveEchoGroupDmMaxMembers(0)).toBe(fb);
  });

  it('returns the number when at least min-valid', () => {
    expect(resolveEchoGroupDmMaxMembers(50)).toBe(50);
    expect(resolveEchoGroupDmMaxMembers(250)).toBe(250);
  });

  it('honours explicit fallback', () => {
    expect(resolveEchoGroupDmMaxMembers(2, 99)).toBe(99);
  });
});
