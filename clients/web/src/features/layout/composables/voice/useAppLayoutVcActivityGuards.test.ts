import { computed, ref } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  emptyWatchTogetherUiFields,
  type VcActivityUiState,
} from '@/features/voice/vcActivityTypes';
import { useAppLayoutVcActivityGuards } from './useAppLayoutVcActivityGuards';

const dispatchAppToast = vi.hoisted(() => vi.fn());

vi.mock('@/features/layout/failures/controllerMissingAction', () => ({
  dispatchAppToast: (...args: unknown[]) => dispatchAppToast(...args),
}));

describe('useAppLayoutVcActivityGuards', () => {
  beforeEach(() => {
    dispatchAppToast.mockClear();
  });

  it('calls ensureViewing before opening so text+VC jumps onto the voice surface', () => {
    const order: string[] = [];
    const ensureViewing = vi.fn(() => {
      order.push('ensure');
    });
    const openVcActivityPicker = vi.fn(() => {
      order.push('open');
    });
    const guards = useAppLayoutVcActivityGuards({
      isViewingVoiceChannel: computed(() => false),
      effectiveActiveChannel: computed(() => ({ type: 'text' })),
      vcActivityUi: ref({
        phase: 'closed' as const,
        youtubeVideoId: null,
        youtubeBrowseOpen: false,
        playlist: [],
        currentIndex: 0,
        ...emptyWatchTogetherUiFields(),
      }),
      closeVcActivity: vi.fn(),
      ensureViewingConnectedVoiceChannel: ensureViewing,
      openVcActivityPicker,
      openVcActivityYoutubeBrowse: vi.fn(),
      openVcActivityWordle: vi.fn(),
      openVcActivityHangman: vi.fn(),
      openVcActivitySkriggles: vi.fn(),
      openVcActivityTicTacToe: vi.fn(),
      openVcActivityOpenGuessr: vi.fn(),
      openVcActivitySkribblIo: vi.fn(),
      openVcActivityGarticPhone: vi.fn(),
      openVcActivityKrunker: vi.fn(),
      openVcActivityCodenames: vi.fn(),
      openVcActivityRichup: vi.fn(),
      openVcActivityGooberDash: vi.fn(),
      openVcActivitySmashKarts: vi.fn(),
      openVcActivityClusterRush: vi.fn(),
      openVcActivityWatchTogether: vi.fn(),
    });

    guards.openVcActivityPickerOnVoice();
    expect(order).toEqual(['ensure', 'open']);
  });

  it('opens the picker synchronously after ensureViewing (no nextTick deferral)', () => {
    const isViewingVoiceChannel = ref(false);
    const effectiveActiveChannel = ref<{ type?: string } | null>({
      type: 'text',
    });
    const vcActivityUi = ref<VcActivityUiState>({
      phase: 'closed',
      youtubeVideoId: null,
      youtubeBrowseOpen: false,
      playlist: [],
      currentIndex: 0,
      ...emptyWatchTogetherUiFields(),
    });
    const closeVcActivity = vi.fn();
    const ensureViewing = vi.fn(() => {
      isViewingVoiceChannel.value = true;
      effectiveActiveChannel.value = { type: 'voice' };
    });
    const openVcActivityPicker = vi.fn(() => {
      vcActivityUi.value = {
        ...vcActivityUi.value,
        phase: 'pick',
      };
    });

    const guards = useAppLayoutVcActivityGuards({
      isViewingVoiceChannel: computed(() => isViewingVoiceChannel.value),
      effectiveActiveChannel: computed(() => effectiveActiveChannel.value),
      vcActivityUi,
      closeVcActivity,
      ensureViewingConnectedVoiceChannel: ensureViewing,
      openVcActivityPicker,
      openVcActivityYoutubeBrowse: vi.fn(),
      openVcActivityWordle: vi.fn(),
      openVcActivityHangman: vi.fn(),
      openVcActivitySkriggles: vi.fn(),
      openVcActivityTicTacToe: vi.fn(),
      openVcActivityOpenGuessr: vi.fn(),
      openVcActivitySkribblIo: vi.fn(),
      openVcActivityGarticPhone: vi.fn(),
      openVcActivityKrunker: vi.fn(),
      openVcActivityCodenames: vi.fn(),
      openVcActivityRichup: vi.fn(),
      openVcActivityGooberDash: vi.fn(),
      openVcActivitySmashKarts: vi.fn(),
      openVcActivityClusterRush: vi.fn(),
      openVcActivityWatchTogether: vi.fn(),
    });

    guards.openVcActivityPickerOnVoice();

    expect(ensureViewing).toHaveBeenCalledTimes(1);
    expect(openVcActivityPicker).toHaveBeenCalledTimes(1);
    expect(vcActivityUi.value.phase).toBe('pick');
  });

  it('blocks stage channels without opening', () => {
    const openVcActivityPicker = vi.fn();
    const guards = useAppLayoutVcActivityGuards({
      isViewingVoiceChannel: computed(() => true),
      effectiveActiveChannel: computed(() => ({ type: 'stage' })),
      vcActivityUi: ref({
        phase: 'closed' as const,
        youtubeVideoId: null,
        youtubeBrowseOpen: false,
        playlist: [],
        currentIndex: 0,
        ...emptyWatchTogetherUiFields(),
      }),
      closeVcActivity: vi.fn(),
      ensureViewingConnectedVoiceChannel: vi.fn(),
      openVcActivityPicker,
      openVcActivityYoutubeBrowse: vi.fn(),
      openVcActivityWordle: vi.fn(),
      openVcActivityHangman: vi.fn(),
      openVcActivitySkriggles: vi.fn(),
      openVcActivityTicTacToe: vi.fn(),
      openVcActivityOpenGuessr: vi.fn(),
      openVcActivitySkribblIo: vi.fn(),
      openVcActivityGarticPhone: vi.fn(),
      openVcActivityKrunker: vi.fn(),
      openVcActivityCodenames: vi.fn(),
      openVcActivityRichup: vi.fn(),
      openVcActivityGooberDash: vi.fn(),
      openVcActivitySmashKarts: vi.fn(),
      openVcActivityClusterRush: vi.fn(),
      openVcActivityWatchTogether: vi.fn(),
    });

    guards.openVcActivityPickerOnVoice();

    expect(openVcActivityPicker).not.toHaveBeenCalled();
    expect(dispatchAppToast).toHaveBeenCalled();
  });
});
