import { describe, expect, it } from 'vitest';
import { mapPasskeyCeremonyError } from './passkeyClientSupport';
import { AuthApiError } from '@/api/authClient';
import { PasskeyCeremonyNotReadyError } from './passkeyWebCeremony';

describe('mapPasskeyCeremonyError', () => {
  it('maps NotAllowedError for registration', () => {
    const err = new DOMException('cancelled', 'NotAllowedError');
    expect(mapPasskeyCeremonyError(err, 'register')).toBe(
      'Passkey registration was cancelled.',
    );
  });

  it('maps PasskeyCeremonyNotReadyError for register', () => {
    expect(
      mapPasskeyCeremonyError(
        new PasskeyCeremonyNotReadyError('register'),
        'register',
      ),
    ).toContain('still loading');
  });

  it('maps AuthApiError NOT_AVAILABLE for register', () => {
    const err = new AuthApiError(503, {
      code: 'NOT_AVAILABLE',
      message: 'nope',
    });
    expect(mapPasskeyCeremonyError(err, 'register')).toBe(
      'Passkeys need a database-backed server.',
    );
  });
});
