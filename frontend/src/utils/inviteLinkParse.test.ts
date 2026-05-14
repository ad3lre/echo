import { describe, expect, it } from 'vitest';
import {
  extractInviteTokenFromUserInput,
  extractVoiceChannelIdFromInviteUserInput,
} from './inviteLinkParse';

describe('extractInviteTokenFromUserInput', () => {
  it('returns empty for whitespace-only', () => {
    expect(extractInviteTokenFromUserInput('  \n  ')).toBe('');
  });

  it('pulls token after /invite/ in full URL', () => {
    expect(
      extractInviteTokenFromUserInput('https://app.test/invite/abc123'),
    ).toBe('abc123');
  });

  it('pulls token from invite share HTML path', () => {
    expect(
      extractInviteTokenFromUserInput(
        'https://app.test/api/v1/echo/invites/my-slug/share',
      ),
    ).toBe('my-slug');
  });

  it('uses last path segment when no invite segment', () => {
    expect(
      extractInviteTokenFromUserInput('https://x.test/foo/bar/token'),
    ).toBe('token');
  });

  it('strips leading slashes for non-URL input', () => {
    expect(extractInviteTokenFromUserInput('//raw-code')).toBe('raw-code');
  });
});

describe('extractVoiceChannelIdFromInviteUserInput', () => {
  it('returns voice id from full invite URL query', () => {
    expect(
      extractVoiceChannelIdFromInviteUserInput(
        'https://echo.test/invite/abc?voice=vc-123',
      ),
    ).toBe('vc-123');
  });

  it('returns voice id from relative query input', () => {
    expect(
      extractVoiceChannelIdFromInviteUserInput('/invite/abc?voice=vc-456'),
    ).toBe('vc-456');
  });

  it('returns null when voice param is absent', () => {
    expect(
      extractVoiceChannelIdFromInviteUserInput('https://echo.test/invite/abc'),
    ).toBeNull();
  });
});
