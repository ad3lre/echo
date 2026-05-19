import { describe, expect, it, vi } from 'vitest';

vi.mock('@/config', () => ({
  API_BASE: 'https://app.example.com',
}));

import { rewriteR2EchoUploadUrlForReadThrough } from './rewriteR2EchoUploadUrlForReadThrough';

describe('rewriteR2EchoUploadUrlForReadThrough', () => {
  it('rewrites r2.dev echo keys to API read-through URL', () => {
    const out = rewriteR2EchoUploadUrlForReadThrough(
      'https://pub-abc123.r2.dev/echo/avatars/u1/file.gif',
    );
    expect(out).toBe(
      'https://app.example.com/api/v1/echo/uploads/s3/echo/avatars/u1/file.gif',
    );
  });

  it('leaves non-r2 URLs unchanged', () => {
    const u = 'https://cdn.discordapp.com/avatars/1/x.webp';
    expect(rewriteR2EchoUploadUrlForReadThrough(u)).toBe(u);
  });

  it('normalizes read-through URL to API_BASE origin', () => {
    expect(
      rewriteR2EchoUploadUrlForReadThrough(
        'https://legacy-api.example.com/api/v1/echo/uploads/s3/echo/avatars/u1/x.gif',
      ),
    ).toBe(
      'https://app.example.com/api/v1/echo/uploads/s3/echo/avatars/u1/x.gif',
    );
  });
});
