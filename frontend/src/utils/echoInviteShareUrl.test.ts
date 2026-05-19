import { describe, expect, it } from 'vitest';
import { appendVoiceToEchoInviteShareUrl } from './echoInviteShareUrl';

describe('appendVoiceToEchoInviteShareUrl', () => {
  it('appends voice query for plain invite URLs', () => {
    expect(
      appendVoiceToEchoInviteShareUrl('https://echo.test/server-slug', 'vc-1'),
    ).toBe('https://echo.test/server-slug?voice=vc-1');
  });

  it('uses ampersand when URL already has a query string', () => {
    expect(
      appendVoiceToEchoInviteShareUrl(
        'https://echo.test/server-slug?foo=bar',
        'vc-2',
      ),
    ).toBe('https://echo.test/server-slug?foo=bar&voice=vc-2');
  });

  it('keeps original URL for non-voice invites', () => {
    expect(
      appendVoiceToEchoInviteShareUrl('https://echo.test/server-slug', null),
    ).toBe('https://echo.test/server-slug');
  });
});
