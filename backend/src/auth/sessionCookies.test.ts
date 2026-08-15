import { describe, expect, it } from 'vitest';
import {
  decodeGuestBindingCookieValue,
  encodeGuestBindingCookieValue,
  sessionCookieBaseAttrs,
} from './sessionCookies';

describe('sessionCookieBaseAttrs', () => {
  it('keeps browser session cookies same-site', () => {
    const attrs = sessionCookieBaseAttrs();
    expect(attrs.sameSite).toBe('lax');
    expect(attrs.path).toBe('/');
  });
});

describe('guest binding cookie', () => {
  it('round-trips the user id', () => {
    const encoded = encodeGuestBindingCookieValue('user_guest_1');
    expect(decodeGuestBindingCookieValue(encoded)?.userId).toBe('user_guest_1');
  });

  it('rejects a tampered signature', () => {
    const encoded = encodeGuestBindingCookieValue('user_guest_1');
    expect(decodeGuestBindingCookieValue(`${encoded.slice(0, -4)}ffff`)).toBe(
      null,
    );
  });

  it('rejects a malformed value', () => {
    expect(decodeGuestBindingCookieValue('not-a-cookie')).toBe(null);
  });
});
