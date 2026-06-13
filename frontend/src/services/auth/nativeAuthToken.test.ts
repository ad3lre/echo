import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({
  isTauri: vi.fn(() => true),
  invoke: vi.fn(),
}));

describe('nativeAuthToken desktop bearer', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('VITE_ECHO_TAURI', '1');
    vi.stubEnv('VITE_ECHO_DESKTOP', '1');
    vi.stubEnv('VITE_ECHO_IOS', '');
    vi.stubEnv('VITE_API_URL', 'https://api.example.com');
    vi.stubEnv('VITE_SOCKET_IO_URL', 'https://api.example.com');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('treats desktop Tauri builds as native bearer clients', async () => {
    const { isNativeBearerClient, nativeAuthRequestHeaders } =
      await import('./nativeAuthToken');
    expect(isNativeBearerClient()).toBe(true);
    expect(nativeAuthRequestHeaders()).toEqual({ 'X-Echo-Client': 'desktop' });
  });
});
