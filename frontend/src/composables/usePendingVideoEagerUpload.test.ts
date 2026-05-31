import { describe, expect, it, vi, beforeEach } from 'vitest';
import { effectScope, nextTick, ref } from 'vue';
import type { PendingVideo } from './usePendingMedia';
import { usePendingVideoEagerUpload } from './usePendingVideoEagerUpload';

vi.mock('@/api/echoClient', () => ({
  uploadChatAttachmentFile: vi.fn(),
}));

vi.mock('@/stores/authSession', () => ({
  useAuthSessionStore: vi.fn(() => ({
    isAuthenticated: true,
    accessToken: 'token',
  })),
}));

vi.mock('@/platform/syncCapabilities', () => ({
  echoSyncCapabilities: { isMockDataMode: false },
}));

vi.mock('@/utils/uploadFingerprint', () => ({
  sha256HexOfBlob: vi.fn(async () => 'abc123'),
}));

import { uploadChatAttachmentFile } from '@/api/echoClient';

function makePendingVideo(channelId: string, name = 'clip.mp4'): PendingVideo {
  const file = new File(['x'], name, { type: 'video/mp4' });
  return {
    url: 'blob:video',
    file,
    spoiler: false,
    attachChannelId: channelId,
    uploadStatus: 'idle',
    uploadPercent: null,
  };
}

function runWithUploadWatcher(
  channelId: Parameters<typeof usePendingVideoEagerUpload>[0],
  pendingVideos: Parameters<typeof usePendingVideoEagerUpload>[1],
) {
  const scope = effectScope();
  scope.run(() => {
    usePendingVideoEagerUpload(channelId, pendingVideos);
  });
  return scope;
}

describe('usePendingVideoEagerUpload', () => {
  beforeEach(() => {
    vi.mocked(uploadChatAttachmentFile).mockReset();
    vi.mocked(uploadChatAttachmentFile).mockResolvedValue({
      url: 'https://example.com/clip.mp4',
      storageKey: 'echo/ch/clip.mp4',
      kind: 'video',
    });
  });

  it('uploads to attachChannelId when it matches the active channel', async () => {
    const channelId = ref('channel-a');
    const pendingVideos = ref<PendingVideo[]>([makePendingVideo('channel-a')]);
    const scope = runWithUploadWatcher(channelId, pendingVideos);

    await vi.waitFor(() =>
      expect(uploadChatAttachmentFile).toHaveBeenCalledWith(
        'token',
        'channel-a',
        pendingVideos.value[0]!.file,
        expect.any(Object),
      ),
    );
    await vi.waitFor(() =>
      expect(pendingVideos.value[0]?.uploadStatus).toBe('done'),
    );
    scope.stop();
  });

  it('does not upload when attachChannelId differs from active channel', async () => {
    const channelId = ref('channel-b');
    const pendingVideos = ref<PendingVideo[]>([makePendingVideo('channel-a')]);
    const scope = runWithUploadWatcher(channelId, pendingVideos);

    await nextTick();
    await new Promise((r) => setTimeout(r, 20));

    expect(uploadChatAttachmentFile).not.toHaveBeenCalled();
    expect(pendingVideos.value[0]?.uploadStatus).toBe('idle');
    scope.stop();
  });

  it('passes cached sha256 to upload when already computed', async () => {
    const channelId = ref('channel-a');
    const video = makePendingVideo('channel-a');
    video.sha256Hex = 'precached-hash';
    const pendingVideos = ref<PendingVideo[]>([video]);
    const scope = runWithUploadWatcher(channelId, pendingVideos);

    await vi.waitFor(() =>
      expect(uploadChatAttachmentFile).toHaveBeenCalledWith(
        'token',
        'channel-a',
        video.file,
        expect.objectContaining({ cachedSha256Hex: 'precached-hash' }),
      ),
    );
    scope.stop();
  });

  it('skips state updates after the video is removed from pending list', async () => {
    let resolveUpload!: (value: {
      url: string;
      storageKey: string;
      kind: 'video';
    }) => void;
    vi.mocked(uploadChatAttachmentFile).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveUpload = resolve;
        }),
    );

    const channelId = ref('channel-a');
    const video = makePendingVideo('channel-a');
    const pendingVideos = ref<PendingVideo[]>([video]);
    const scope = runWithUploadWatcher(channelId, pendingVideos);

    await vi.waitFor(() =>
      expect(pendingVideos.value[0]?.uploadStatus).toBe('uploading'),
    );

    pendingVideos.value = [];
    resolveUpload({
      url: 'https://example.com/clip.mp4',
      storageKey: 'echo/ch/clip.mp4',
      kind: 'video',
    });
    await nextTick();

    expect(video.uploadStatus).toBe('uploading');
    scope.stop();
  });
});
