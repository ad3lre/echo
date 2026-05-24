import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ref } from 'vue';
import { usePaperShare } from '@/features/paper/composables/usePaperShare';

vi.mock('@/features/paper/api/paper', () => ({
  fetchPaperShareSettings: vi.fn(),
  patchPaperShareVisibility: vi.fn(),
}));

vi.mock('@/features/paper/editor/paperShareLinks', () => ({
  buildPaperGlobalShareUrl: (token: string) =>
    `https://app.example/paper/s/${token}`,
  buildPaperServerShareUrl: (serverId: string, channelId: string) =>
    `https://app.example/channels/${serverId}/${channelId}`,
}));

import { fetchPaperShareSettings } from '@/features/paper/api/paper';

describe('usePaperShare', () => {
  beforeEach(() => {
    vi.mocked(fetchPaperShareSettings).mockReset();
  });

  it('builds global share link from token on client', async () => {
    vi.mocked(fetchPaperShareSettings).mockResolvedValue({
      channelId: 'ch-1',
      serverId: 'srv-1',
      visibility: 'global',
      shareUrl: '',
      publicShareUrl: null,
      shareToken: 'tok-abc',
      audience: {
        visibility: 'global',
        headline: 'Anyone',
        detail: 'Public',
      },
      canManageShare: true,
    });
    const share = usePaperShare(ref('ch-1'), ref('srv-1'));
    await vi.waitFor(() => expect(share.settings.value).not.toBeNull());
    expect(share.shareLink.value).toBe('https://app.example/paper/s/tok-abc');
  });

  it('builds server link from serverId when not global', async () => {
    vi.mocked(fetchPaperShareSettings).mockResolvedValue({
      channelId: 'ch-2',
      serverId: 'srv-9',
      visibility: 'server',
      shareUrl: '',
      publicShareUrl: null,
      shareToken: null,
      audience: {
        visibility: 'server',
        headline: 'Server',
        detail: 'Members',
      },
      canManageShare: false,
    });
    const share = usePaperShare(ref('ch-2'), ref('srv-9'));
    await vi.waitFor(() => expect(share.settings.value).not.toBeNull());
    expect(share.shareLink.value).toBe(
      'https://app.example/channels/srv-9/ch-2',
    );
  });
});
