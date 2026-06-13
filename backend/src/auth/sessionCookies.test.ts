import { describe, expect, it } from 'vitest';
import type { FastifyRequest } from 'fastify';
import { requestOriginsForDesktopCookiePolicy } from './sessionCookies';

function mockRequest(
  headers: Record<string, string | undefined>,
): FastifyRequest {
  return { headers } as FastifyRequest;
}

describe('requestOriginsForDesktopCookiePolicy', () => {
  it('returns Origin when present', () => {
    expect(
      requestOriginsForDesktopCookiePolicy(
        mockRequest({ origin: 'https://tauri.localhost' }),
      ),
    ).toEqual(['https://tauri.localhost']);
  });

  it('falls back to Referer origin when Origin is missing (WKWebView simple POST)', () => {
    expect(
      requestOriginsForDesktopCookiePolicy(
        mockRequest({
          referer: 'https://tauri.localhost/index.html',
        }),
      ),
    ).toEqual(['https://tauri.localhost']);
  });

  it('prefers both Origin and Referer when both are sent', () => {
    const origins = requestOriginsForDesktopCookiePolicy(
      mockRequest({
        origin: 'https://tauri.localhost',
        referer: 'https://tauri.localhost/app',
      }),
    );
    expect(origins).toEqual([
      'https://tauri.localhost',
      'https://tauri.localhost',
    ]);
  });
});
