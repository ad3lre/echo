import { describe, expect, it } from 'vitest';
import {
  ECHO_LOCAL_UPLOAD_PUBLIC_PREFIX,
  extractStorageKeyFromEchoMediaUrl,
  hlsManifestStorageKeyForSourceKey,
  hlsPackPrefixForSourceKey,
  isEchoPublicServerBrandingStorageKey,
  isSafeEchoUploadStorageKeyPath,
  normalizeEchoUploadStorageKeyPath,
  stripExtension,
} from '@shared/echoUploadStorageKey';
import { ECHO_S3_PUBLIC_READ_THROUGH_PREFIX } from '@shared/echoS3ReadThrough';

describe('echoUploadStorageKey shared helpers', () => {
  it('stripExtension removes video suffix', () => {
    expect(stripExtension('echo/channels/c/u/clip.mp4')).toBe(
      'echo/channels/c/u/clip',
    );
  });

  it('derives hls pack prefix without sourceKey.mp4/hls shape', () => {
    const source = 'echo/channels/ch/u/uuid-clip.mp4';
    expect(hlsPackPrefixForSourceKey(source)).toBe(
      'echo/channels/ch/u/uuid-clip/hls/',
    );
    expect(hlsManifestStorageKeyForSourceKey(source)).toBe(
      'echo/channels/ch/u/uuid-clip/hls/master.m3u8',
    );
  });

  it('extracts storage key from read-through url', () => {
    expect(
      extractStorageKeyFromEchoMediaUrl(
        `${ECHO_S3_PUBLIC_READ_THROUGH_PREFIX}echo/channels/c/u/clip.mp4`,
      ),
    ).toBe('echo/channels/c/u/clip.mp4');
  });

  it('rejects traversal in normalizeEchoUploadStorageKeyPath', () => {
    expect(normalizeEchoUploadStorageKeyPath('echo/channels/x.png')).toBe(
      'echo/channels/x.png',
    );
    expect(normalizeEchoUploadStorageKeyPath('../etc/passwd')).toBeNull();
    expect(normalizeEchoUploadStorageKeyPath('echo/a/../b.png')).toBeNull();
    expect(normalizeEchoUploadStorageKeyPath('/echo/x.png')).toBeNull();
    expect(normalizeEchoUploadStorageKeyPath('echo\\..\\x.png')).toBeNull();
    expect(isSafeEchoUploadStorageKeyPath('data:text/html,x')).toBe(false);
  });

  it('extractStorageKeyFromEchoMediaUrl rejects traversal in local file URLs', () => {
    expect(
      extractStorageKeyFromEchoMediaUrl(
        `${ECHO_LOCAL_UPLOAD_PUBLIC_PREFIX}echo%2F..%2F..%2Fsecret.png`,
      ),
    ).toBeNull();
    expect(
      extractStorageKeyFromEchoMediaUrl(
        `${ECHO_LOCAL_UPLOAD_PUBLIC_PREFIX}echo/channels/c/u/ok.png`,
      ),
    ).toBe('echo/channels/c/u/ok.png');
  });

  it('detects public server branding storage keys', () => {
    expect(
      isEchoPublicServerBrandingStorageKey(
        'echo/server-icons/srv/uploader/icon.png',
      ),
    ).toBe(true);
    expect(
      isEchoPublicServerBrandingStorageKey(
        'echo/server-banners/srv/uploader/banner.webp',
      ),
    ).toBe(true);
    expect(
      isEchoPublicServerBrandingStorageKey('echo/channels/c/u/x.png'),
    ).toBe(false);
    expect(isEchoPublicServerBrandingStorageKey('echo/server-icons/')).toBe(
      false,
    );
  });
});
