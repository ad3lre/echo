// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  clearAllPendingDesktopOAuthHandoffState,
  createPendingDesktopOAuthHandoffNonce,
  readPendingDesktopOAuthHandoffNonce,
  setPendingDesktopOAuthReturnPath,
  readPendingDesktopOAuthReturnPath,
} from './desktopOAuthHandoff';

describe('desktopOAuthHandoff persistence', () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
  });

  afterEach(() => {
    clearAllPendingDesktopOAuthHandoffState();
  });

  it('persists nonce in localStorage for cold-start redeem', () => {
    const nonce = createPendingDesktopOAuthHandoffNonce();
    sessionStorage.clear();
    expect(readPendingDesktopOAuthHandoffNonce()).toBe(nonce);
    expect(localStorage.getItem('echo_desktop_oauth_handoff_nonce_v1')).toBe(
      nonce,
    );
  });

  it('persists return path in localStorage', () => {
    setPendingDesktopOAuthReturnPath('/explore?panel=login');
    sessionStorage.clear();
    expect(readPendingDesktopOAuthReturnPath()).toBe('/explore?panel=login');
  });
});
