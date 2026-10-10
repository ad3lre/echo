import { describe, expect, it } from 'vitest';
import { localUploadReadUrl } from './localUploadReadUrl';

describe('localUploadReadUrl', () => {
  it('returns a same-origin path for local upload routes', () => {
    expect(localUploadReadUrl('/api/v1/echo/uploads/files/key.webp')).toBe(
      '/api/v1/echo/uploads/files/key.webp',
    );
    expect(
      localUploadReadUrl(
        'https://attacker.example/api/v1/echo/uploads/files/key.webp',
      ),
    ).toBe('/api/v1/echo/uploads/files/key.webp');
  });

  it('rejects paths outside the local upload route', () => {
    expect(localUploadReadUrl('https://example.com/image.webp')).toBeNull();
  });
});
