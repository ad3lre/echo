import { describe, expect, it, vi } from 'vitest';
import { resolveGameServerConnectUrl } from './config';

describe('resolveGameServerConnectUrl', () => {
  it('uses minted URL when it matches the page host class', () => {
    expect(resolveGameServerConnectUrl('https://games.example.com')).toBe(
      'https://games.example.com',
    );
  });

  it('falls back to page host when minted URL is loopback but page is not', () => {
    vi.stubGlobal('window', {
      location: { hostname: '192.168.1.50' },
    });
    vi.stubEnv('DEV', true);
    vi.stubEnv('VITE_GAME_SERVER_URL', '');

    expect(resolveGameServerConnectUrl('http://127.0.0.1:3060')).toBe(
      'http://192.168.1.50:3060',
    );
  });
});
