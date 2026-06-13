import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ref } from 'vue';
import { useServerBrandingUploads } from './useServerBrandingUploads';

vi.mock('@/api/echoClient', () => ({
  uploadServerBrandingFile: vi.fn(),
}));

vi.mock('@/platform/syncCapabilities', () => ({
  echoSyncCapabilities: { isMockDataMode: false },
}));

vi.mock('@/stores/authSession', () => ({
  useAuthSessionStore: () => ({
    accessToken: 'tok',
    isAuthenticated: true,
  }),
}));

vi.mock('@/services/orchestration/brandingUploadFallback', () => ({
  readBlobAsDataUrl: vi.fn(),
  uploadBrandingAssetWithInlineFallback: vi.fn(),
}));

vi.mock('@/utils/controllerMissingAction', () => ({
  dispatchAppToast: vi.fn(),
}));

import { uploadServerBrandingFile } from '@/api/echoClient';
import { uploadBrandingAssetWithInlineFallback } from '@/services/orchestration/brandingUploadFallback';
import { dispatchAppToast } from '@/utils/controllerMissingAction';

function makeFile(name = 'banner.png') {
  return new File(['x'], name, { type: 'image/png' });
}

function fileInputEvent(file: File) {
  return {
    target: { files: [file], value: '' },
  } as unknown as Event;
}

describe('useServerBrandingUploads', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    let blobCounter = 0;
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => `blob:preview-${++blobCounter}`),
      revokeObjectURL: vi.fn(),
    });
    vi.mocked(uploadBrandingAssetWithInlineFallback).mockImplementation(
      async ({ upload }) => upload(),
    );
    vi.mocked(uploadServerBrandingFile).mockResolvedValue(
      'https://cdn.example/banner.png',
    );
  });

  it('applies blob preview immediately then commits uploaded banner url', async () => {
    const serverId = ref('srv-1');
    const bannerPreviewUrl = ref('');
    const iconPreviewUrl = ref('');
    const storeBanner = ref('https://cdn.example/old.png');
    const applyCalls: string[] = [];
    const commitCalls: string[] = [];

    const { onServerBannerFileChange } = useServerBrandingUploads({
      serverId,
      bannerPreviewUrl,
      iconPreviewUrl,
      getServerBannerImageUrl: () => storeBanner.value,
      getServerIconImageUrl: () => '',
      applyServerBannerImageUrl: (_id, url) => {
        applyCalls.push(url);
        storeBanner.value = url;
      },
      applyServerIconImageUrl: vi.fn(),
      commitServerBannerImageUrl: async (_id, url) => {
        commitCalls.push(url);
      },
      commitServerIconImageUrl: vi.fn(),
    });

    const file = makeFile();
    const promise = onServerBannerFileChange(fileInputEvent(file));

    expect(applyCalls).toHaveLength(1);
    expect(applyCalls[0]).toBe('blob:preview-1');
    expect(bannerPreviewUrl.value).toBe('blob:preview-1');
    expect(storeBanner.value).toBe('blob:preview-1');

    await promise;

    expect(uploadServerBrandingFile).toHaveBeenCalledWith(
      'tok',
      'srv-1',
      'server_banner',
      file,
    );
    expect(storeBanner.value).toBe('https://cdn.example/banner.png');
    expect(bannerPreviewUrl.value).toBe('');
    expect(commitCalls).toEqual(['https://cdn.example/banner.png']);
  });

  it('rolls back optimistic banner when upload fails', async () => {
    vi.mocked(uploadServerBrandingFile).mockRejectedValue(new Error('network'));

    const serverId = ref('srv-1');
    const bannerPreviewUrl = ref('');
    const iconPreviewUrl = ref('');
    const storeBanner = ref('https://cdn.example/old.png');

    const { onServerBannerFileChange } = useServerBrandingUploads({
      serverId,
      bannerPreviewUrl,
      iconPreviewUrl,
      getServerBannerImageUrl: () => storeBanner.value,
      getServerIconImageUrl: () => '',
      applyServerBannerImageUrl: (_id, url) => {
        storeBanner.value = url;
      },
      applyServerIconImageUrl: vi.fn(),
      commitServerBannerImageUrl: vi.fn(),
      commitServerIconImageUrl: vi.fn(),
    });

    await onServerBannerFileChange(fileInputEvent(makeFile()));

    expect(storeBanner.value).toBe('https://cdn.example/old.png');
    expect(bannerPreviewUrl.value).toBe('');
    expect(dispatchAppToast).toHaveBeenCalled();
  });

  it('ignores stale upload when server changes mid-flight', async () => {
    let resolveUpload!: (url: string) => void;
    vi.mocked(uploadBrandingAssetWithInlineFallback).mockImplementation(
      ({ upload }) =>
        new Promise((resolve) => {
          resolveUpload = (url) => resolve(url);
        }),
    );

    const serverId = ref('srv-a');
    const bannerPreviewUrl = ref('');
    const iconPreviewUrl = ref('');
    const banners = new Map([
      ['srv-a', 'https://cdn.example/a-old.png'],
      ['srv-b', 'https://cdn.example/b-old.png'],
    ]);

    const { onServerBannerFileChange } = useServerBrandingUploads({
      serverId,
      bannerPreviewUrl,
      iconPreviewUrl,
      getServerBannerImageUrl: (id) => banners.get(id) ?? '',
      getServerIconImageUrl: () => '',
      applyServerBannerImageUrl: (id, url) => {
        banners.set(id, url);
      },
      applyServerIconImageUrl: vi.fn(),
      commitServerBannerImageUrl: vi.fn(),
      commitServerIconImageUrl: vi.fn(),
    });

    const pending = onServerBannerFileChange(fileInputEvent(makeFile()));
    expect(banners.get('srv-a')).toBe('blob:preview-1');

    serverId.value = 'srv-b';
    resolveUpload('https://cdn.example/a-new.png');
    await pending;

    expect(banners.get('srv-a')).toBe('https://cdn.example/a-old.png');
    expect(banners.get('srv-b')).toBe('https://cdn.example/b-old.png');
  });
});
