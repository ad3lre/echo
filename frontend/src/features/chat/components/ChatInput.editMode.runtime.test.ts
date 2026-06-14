// @vitest-environment happy-dom

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
} from 'vitest';
import {
  createApp,
  defineComponent,
  h,
  nextTick,
  ref,
  type App,
  type Ref,
} from 'vue';
import type { EditingMessage } from '@shared/types';
import * as composerDraftStorage from '@/features/chat/composables/composerDraftStorage';

const { mockContent, mockMentions, mockClearPendingMedia, mockComposerFns } =
  vi.hoisted(() => {
    const content = { value: '' };
    const mentions = {
      value: [] as {
        id: string;
        kind: 'user';
        label: string;
        start: number;
        end: number;
      }[],
    };
    return {
      mockContent: content,
      mockMentions: mentions,
      mockClearPendingMedia: vi.fn(),
      mockComposerFns: {
        captureSnapshot: vi.fn(() => ({
          content: 'saved draft',
          mentions: [] as typeof mentions.value,
        })),
        restoreSnapshot: vi.fn((snap: { content: string }) => {
          content.value = snap.content;
        }),
        clear: vi.fn(() => {
          content.value = '';
        }),
        flushComposerSync: vi.fn(),
        getContentJson: vi.fn(() => ({ type: 'doc', content: [] })),
        getContent: vi.fn(() => content.value),
        getSelectionStart: vi.fn(() => 0),
        getSelectionEnd: vi.fn(() => 0),
        focus: vi.fn(),
        insertText: vi.fn(),
        setSerializedState: vi.fn(),
        replaceRange: vi.fn(),
        wrapSelection: vi.fn(),
        handleAtomicMentionKeydown: vi.fn(() => false),
        registerKeydownHandler: vi.fn(),
        setMarkdownDecorationsEnabled: vi.fn(),
        insertImageSlot: vi.fn(),
        insertChannelMention: vi.fn(),
        insertMention: vi.fn(),
        setEditable: vi.fn(),
        editor: { value: null },
        surfaceRef: { value: null },
      },
    };
  });

vi.mock('@/composables/useComposerState', () => ({
  useComposerState: () => ({
    content: mockContent,
    mentions: mockMentions,
    selectionStart: { value: 0 },
    selectionEnd: { value: 0 },
    ...mockComposerFns,
  }),
}));

vi.mock('@/composables/usePendingMedia', () => ({
  usePendingMedia: () => ({
    pendingImages: ref([]),
    pendingVideos: ref([]),
    pendingAudios: ref([]),
    pendingDocuments: ref([]),
    pendingExternalImages: ref([]),
    pendingGifs: ref([]),
    addFiles: vi.fn(),
    addGif: vi.fn(),
    addExternalImageUrl: vi.fn(),
    removeImage: vi.fn(),
    removeVideo: vi.fn(),
    removeAudio: vi.fn(),
    removeDocument: vi.fn(),
    removeExternalImage: vi.fn(),
    removeGif: vi.fn(),
    clearAll: mockClearPendingMedia,
  }),
}));

vi.mock('@/composables/usePendingVideoEagerUpload', () => ({
  usePendingVideoEagerUpload: vi.fn(),
}));

vi.mock('@/composables/useChatSend', () => ({
  useChatSend: () => ({ send: vi.fn() }),
}));

vi.mock('@/features/chat/composables/useChatInputSlowmode', () => ({
  useChatInputSlowmode: () => ({
    slowmodeInterval: ref(0),
    lastOwnMessageAt: ref(null),
    slowmodeActive: ref(false),
    slowmodeRemainingSeconds: ref(0),
    slowmodeProgressPercent: ref(0),
  }),
}));

vi.mock('@/composables/useChatPermissions', () => ({
  useChatPermissions: () => ({
    getSendState: vi.fn(() => ({ allowed: true })),
    assertCanSend: vi.fn(),
  }),
}));

vi.mock('@/composables/usePopoutStack', () => ({
  usePopoutStack: () => ({
    activePopout: ref(null),
    closePopout: vi.fn(),
    togglePopout: vi.fn(),
  }),
}));

vi.mock('@/composables/useServerEmojiLibrary', () => ({
  useServerEmojiLibrary: () => ({
    emojiLibrary: ref([]),
    loadEmojiLibrary: vi.fn(),
  }),
}));

vi.mock('@/composables/useEmojiAutocomplete', () => ({
  useEmojiAutocomplete: () => ({
    showPopup: ref(false),
    close: vi.fn(),
    handleKeydown: vi.fn(() => false),
    select: vi.fn(),
  }),
}));

vi.mock('@/composables/useMentionAutocomplete', () => ({
  useMentionAutocomplete: () => ({
    showPopup: ref(false),
    close: vi.fn(),
    handleKeydown: vi.fn(() => false),
    select: vi.fn(),
  }),
}));

vi.mock('@/composables/useChannelAutocomplete', () => ({
  useChannelAutocomplete: () => ({
    showPopup: ref(false),
    close: vi.fn(),
    handleKeydown: vi.fn(() => false),
    select: vi.fn(),
  }),
}));

vi.mock('@/features/chat/composables/useDebouncedMarkdownPreviewHtml', () => ({
  useDebouncedMarkdownPreviewHtml: () => ref(''),
}));

vi.mock('@/features/chat/composables/useChatInputMarkdownPreview', () => ({
  useChatInputMarkdownPreview: () => ({
    syncPreviewScrollWithTextarea: vi.fn(),
    expandMarkdownPreview: vi.fn(),
  }),
}));

vi.mock('@/features/chat/composables/useChatInputSelectionMenu', () => ({
  useChatInputSelectionMenu: () => ({
    selectionMenuPosition: ref(null),
    showSelectionMenu: ref(false),
    hideSelectionMenu: vi.fn(),
    updateSelectionMenuPosition: vi.fn(),
    handleComposerSelectionSync: vi.fn(),
    formatBold: vi.fn(),
    formatItalic: vi.fn(),
    formatCode: vi.fn(),
    formatSpoiler: vi.fn(),
    formatStrike: vi.fn(),
  }),
}));

vi.mock('@/features/chat/composables/useChatTypingComposer', () => ({
  useChatTypingComposer: () => ({ notifyTyping: vi.fn() }),
}));

vi.mock('@/composables/useCompactShell', () => ({
  useCompactShell: () => ({ isCompactShell: ref(true) }),
}));

vi.mock('@/stores/theme', () => ({
  useThemeStore: () => ({
    canonicalTheme: ref('dark'),
  }),
}));

vi.mock('@/observability/sessionDiagnostics', () => ({
  emitDiagnostic: vi.fn(),
}));

vi.mock('@/features/chat/components/ChatInputComposerBar.vue', () => ({
  default: {
    name: 'ChatInputComposerBarStub',
    template: '<div data-testid="composer-bar-stub" />',
  },
}));

vi.mock('@/features/chat/components/ChatInputMarkdownPreview.vue', () => ({
  default: { template: '<div />' },
}));

vi.mock('@/features/chat/components/PendingMediaPreview.vue', () => ({
  default: { template: '<div />' },
}));

vi.mock('@/features/chat/components/EmojiPopout.vue', () => ({
  default: { template: '<div />' },
}));

vi.mock('@/features/chat/components/GifPopout.vue', () => ({
  default: { template: '<div />' },
}));

vi.mock('@/features/chat/components/AttachPopout.vue', () => ({
  default: { template: '<div />' },
}));

vi.mock('@/features/chat/components/PollCreateModal.vue', () => ({
  default: { template: '<div />' },
}));

vi.mock('@/features/chat/components/ImageViewerModal.vue', () => ({
  default: { template: '<div />' },
}));

import ChatInput from './ChatInput.vue';

const editingSnapshot: EditingMessage = {
  messageId: 'msg-edit-1',
  previewContent: 'original body',
  content: 'original body',
  mentions: [],
  contentJson: null,
  attachments: [],
};

describe('ChatInput edit mode', () => {
  let app: App<Element> | null = null;
  let container: HTMLDivElement | null = null;
  let editingMessage: Ref<EditingMessage | null> | null = null;
  let clearEditEvents: string[];
  let scrollEvents: string[];
  let saveEdit: Mock<
    (
      messageId: string,
      newContent: string,
      attachments?: unknown[],
      composerBody?: {
        contentJson?: Record<string, unknown>;
        mentions?: unknown[];
      },
    ) => Promise<boolean>
  >;
  let setEditingMessage: (value: EditingMessage | null) => void;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(composerDraftStorage, 'writeComposerDraft');
    composerDraftStorage.resetComposerDraftStorageForTests();
    vi.stubGlobal(
      'localStorage',
      (() => {
        const map = new Map<string, string>();
        return {
          getItem: (k: string) => map.get(k) ?? null,
          setItem: (k: string, v: string) => {
            map.set(k, v);
          },
          removeItem: (k: string) => {
            map.delete(k);
          },
          clear: () => map.clear(),
        };
      })(),
    );
    mockContent.value = 'saved draft';
    clearEditEvents = [];
    scrollEvents = [];
    saveEdit = vi.fn(async () => true);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    app?.unmount();
    container?.remove();
    document.body.innerHTML = '';
    app = null;
    container = null;
  });

  async function mountInput(opts?: { editing?: EditingMessage | null }) {
    clearEditEvents = [];
    scrollEvents = [];
    const Host = defineComponent({
      setup() {
        editingMessage = ref<EditingMessage | null>(null);
        setEditingMessage = (value) => {
          editingMessage!.value = value;
        };
        return () =>
          h(ChatInput, {
            channelName: 'general',
            channelId: 'ch-edit-test',
            editingMessage: editingMessage!.value,
            onSaveEdit: saveEdit,
            onClearEdit: () => {
              clearEditEvents.push('clear');
              editingMessage!.value = null;
            },
            onScrollToEditTarget: (messageId: string) => {
              scrollEvents.push(messageId);
            },
          });
      },
    });
    container = document.createElement('div');
    document.body.appendChild(container);
    app = createApp(Host);
    app.mount(container);
    await nextTick();
    if (opts?.editing) {
      setEditingMessage(opts.editing);
      await nextTick();
      await nextTick();
    }
  }

  it('shows edit bar while editingMessage is set', async () => {
    await mountInput({ editing: editingSnapshot });
    expect(container?.textContent).toContain('Editing your message');
    expect(container?.textContent).toContain('original body');
  });

  it('does not persist channel draft while editing', async () => {
    await mountInput({ editing: editingSnapshot });
    mockContent.value = 'edited in composer';
    await nextTick();
    vi.advanceTimersByTime(500);
    expect(composerDraftStorage.writeComposerDraft).not.toHaveBeenCalled();
  });

  it('emits clear-edit when cancel is clicked', async () => {
    await mountInput({ editing: editingSnapshot });
    const cancel = container?.querySelector('[aria-label="Cancel edit"]');
    expect(cancel).toBeTruthy();
    (cancel as HTMLButtonElement).click();
    await nextTick();
    expect(clearEditEvents).toEqual(['clear']);
    expect(mockComposerFns.restoreSnapshot).toHaveBeenCalledWith({
      content: 'saved draft',
      mentions: [],
    });
  });

  it('emits scroll-to-edit-target when preview is clicked', async () => {
    await mountInput({ editing: editingSnapshot });
    const preview = container?.querySelector(
      '[aria-label="Scroll to message being edited"]',
    );
    expect(preview).toBeTruthy();
    (preview as HTMLElement).click();
    expect(scrollEvents).toEqual(['msg-edit-1']);
  });
});
