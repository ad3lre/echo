import { describe, expect, it } from 'vitest';
import {
  describeEchoUsernameFieldIssue,
  isUsernameUnchanged,
  validateUsernameForProfilePatch,
} from '@shared/usernamePolicy';

describe('usernamePolicy profile edits', () => {
  it('grandfathers unchanged legacy short usernames', () => {
    expect(isUsernameUnchanged('ab', 'ab')).toBe(true);
    expect(
      describeEchoUsernameFieldIssue('ab', { baselineUsername: 'ab' }),
    ).toBe(null);
    expect(validateUsernameForProfilePatch('ab', 'ab')).toEqual({
      ok: true,
      normalizedUsername: 'ab',
    });
  });

  it('still enforces minimum length when the handle changes', () => {
    expect(
      describeEchoUsernameFieldIssue('ab', { baselineUsername: 'legacy' }),
    ).toBe('Usernames must be at least 4 characters.');
    expect(validateUsernameForProfilePatch('ab', 'legacy').ok).toBe(false);
  });
});
