import { describe, expect, it } from 'vitest';
import { parseAuthLoginResult } from './authClient';

describe('parseAuthLoginResult', () => {
  it('parses full session payload (Option A: cookies hold tokens; body is user only)', () => {
    const out = parseAuthLoginResult({
      accessToken: 'a',
      refreshToken: 'r',
      user: {
        id: '1',
        username: 'u',
        displayName: 'U',
        pfp: '',
        status: 'online',
        createdAt: '',
      },
    });
    expect(out).toEqual({
      user: {
        id: '1',
        username: 'u',
        displayName: 'U',
        pfp: '',
        status: 'online',
        createdAt: '',
      },
    });
  });

  it('parses MFA challenge', () => {
    const out = parseAuthLoginResult({
      mfaRequired: true,
      mfaToken: 'tok',
      user: { id: '9', username: 'alice' },
    });
    expect(out).toEqual({
      mfaRequired: true,
      mfaToken: 'tok',
      user: { id: '9', username: 'alice' },
    });
  });

  it('throws on invalid payload', () => {
    expect(() => parseAuthLoginResult(null)).toThrow('INVALID_LOGIN_RESPONSE');
    expect(() => parseAuthLoginResult({})).toThrow('INVALID_LOGIN_RESPONSE');
    expect(() => parseAuthLoginResult({ mfaRequired: true })).toThrow(
      'INVALID_LOGIN_RESPONSE',
    );
  });
});
