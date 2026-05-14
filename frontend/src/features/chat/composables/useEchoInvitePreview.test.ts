import { describe, it, expect, vi } from 'vitest';
import { nextTick, ref } from 'vue';
import { useEchoInvitePreview } from './useEchoInvitePreview';

const echoInvitePreviewMock = vi.hoisted(() => ({
  fetchInvitePreview: vi.fn(),
}));

vi.mock(
  '@/services/orchestration/fetchInvitePreview',
  () => echoInvitePreviewMock,
);

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

describe('useEchoInvitePreview', () => {
  it('keeps only the latest invite preview result', async () => {
    const first = deferred<{
      name: string;
      iconUrl: string;
      bannerUrl: string;
      description: string;
      memberCount: number;
    }>();
    const second = deferred<{
      name: string;
      iconUrl: string;
      bannerUrl: string;
      description: string;
      memberCount: number;
    }>();

    echoInvitePreviewMock.fetchInvitePreview
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);

    const token = ref('first-token');
    const state = useEchoInvitePreview(token);
    await nextTick();

    token.value = 'second-token';
    await nextTick();

    second.resolve({
      name: 'Second',
      iconUrl: '',
      bannerUrl: '',
      description: '',
      memberCount: 2,
    });
    await Promise.resolve();
    await nextTick();

    expect(state.preview.value?.name).toBe('Second');
    expect(state.loading.value).toBe(false);

    first.resolve({
      name: 'First',
      iconUrl: '',
      bannerUrl: '',
      description: '',
      memberCount: 1,
    });
    await Promise.resolve();
    await nextTick();

    expect(state.preview.value?.name).toBe('Second');
    expect(state.loading.value).toBe(false);
  });
});
