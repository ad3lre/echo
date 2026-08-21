import { describe, expect, it } from 'vitest';
import { normalizeExternalUrlForOpen } from './desktopBridge';

describe('normalizeExternalUrlForOpen', () => {
  const base = 'https://app.example.com/shell/index.html';

  it('allows http and https URLs', () => {
    expect(
      normalizeExternalUrlForOpen('https://discord.com/oauth2', base),
    ).toBe('https://discord.com/oauth2');
    expect(normalizeExternalUrlForOpen('http://localhost:3000/x', base)).toBe(
      'http://localhost:3000/x',
    );
  });

  it('resolves relative URLs against the current app origin', () => {
    expect(
      normalizeExternalUrlForOpen('/api/v1/echo/uploads/files/a.png', base),
    ).toBe('https://app.example.com/api/v1/echo/uploads/files/a.png');
  });

  it('rejects script, file, data, and credential-bearing URLs', () => {
    expect(normalizeExternalUrlForOpen('javascript:alert(1)', base)).toBeNull();
    expect(
      normalizeExternalUrlForOpen('file:///C:/Windows/win.ini', base),
    ).toBeNull();
    expect(
      normalizeExternalUrlForOpen('data:text/html,<h1>x</h1>', base),
    ).toBeNull();
    expect(
      normalizeExternalUrlForOpen('https://user:pass@example.com/x', base),
    ).toBeNull();
  });
});
