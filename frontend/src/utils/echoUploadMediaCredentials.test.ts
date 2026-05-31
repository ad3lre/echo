/** @vitest-environment happy-dom */
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/config', () => ({
  API_BASE: 'https://api.example.com',
}));

import {
  applyEchoUploadMediaCrossOrigin,
  echoUploadMediaCrossOrigin,
  isEchoAuthenticatedUploadMediaUrl,
} from './echoUploadMediaCredentials';

describe('echoUploadMediaCredentials', () => {
  it('detects S3 read-through paths', () => {
    expect(
      isEchoAuthenticatedUploadMediaUrl(
        'https://api.example.com/api/v1/echo/uploads/s3/echo/channels/c/v.mp4',
      ),
    ).toBe(true);
    expect(
      isEchoAuthenticatedUploadMediaUrl(
        '/api/v1/echo/uploads/s3/echo/channels/c/v.mp4',
      ),
    ).toBe(true);
  });

  it('detects local upload file paths', () => {
    expect(
      isEchoAuthenticatedUploadMediaUrl(
        '/api/v1/echo/uploads/files/echo/channels/c/v.mp4',
      ),
    ).toBe(true);
  });

  it('ignores public CDN URLs', () => {
    expect(
      isEchoAuthenticatedUploadMediaUrl(
        'https://pub-abc.r2.dev/echo/channels/c/v.mp4',
      ),
    ).toBe(false);
    expect(
      isEchoAuthenticatedUploadMediaUrl('https://cdn.discordapp.com/x.mp4'),
    ).toBe(false);
  });

  it('returns use-credentials only for authenticated routes', () => {
    expect(
      echoUploadMediaCrossOrigin(
        'https://api.example.com/api/v1/echo/uploads/s3/echo/x.mp4',
      ),
    ).toBe('use-credentials');
    expect(
      echoUploadMediaCrossOrigin('https://pub-abc.r2.dev/echo/x.mp4'),
    ).toBeNull();
  });

  it('applyEchoUploadMediaCrossOrigin sets or clears the attribute', () => {
    const video = document.createElement('video');
    applyEchoUploadMediaCrossOrigin(
      video,
      'https://api.example.com/api/v1/echo/uploads/s3/echo/x.mp4',
    );
    expect(video.crossOrigin).toBe('use-credentials');

    applyEchoUploadMediaCrossOrigin(video, 'https://pub-abc.r2.dev/echo/x.mp4');
    expect(video.hasAttribute('crossorigin')).toBe(false);
  });
});
