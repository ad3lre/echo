import {
  computed,
  onUnmounted,
  ref,
  shallowRef,
  unref,
  watch,
  type ComputedRef,
  type Ref,
} from 'vue';
import { Editor } from '@tiptap/core';
import Placeholder from '@tiptap/extension-placeholder';
import StarterKit from '@tiptap/starter-kit';
import type { MentionEntity, MentionKind } from '@shared/types';
import type { IdTokenResolvers } from '@/composables/useMarkdown';
import {
  AppIconNode,
  buildComposerDoc,
  ChannelMentionNode,
  CustomEmojiNode,
  MentionEntityNode,
  rawOffsetToEditorPos,
  serializeComposerDoc,
} from '@/features/chat/editor/composerModel';
import {
  ComposerBold,
  ComposerCode,
  ComposerItalic,
  ComposerStrike,
} from '@/features/chat/editor/composerTextualMarks';
import {
  ComposerMarkdownDecorations,
  composerMarkdownDecoKey,
} from '@/features/chat/editor/composerMarkdownDecorations';
import {
  replaceRangeTransform,
  insertMentionTransform,
  insertChannelMentionTransform,
  wrapSelectionTransform,
} from '@/services/domain/composer';
import { channelMentionRefLabel } from '@/utils/channelMentionLabel';
import { ECHO_COMPOSER_MAX_INPUT_CHARS } from '@shared/messageChunkLimits';

export interface ComposerMentionInsert {
  kind: MentionKind;
  label: string;
  userId?: string;
  channelId?: string;
  roleId?: string;
}

export type ComposerSnapshot = {
  content: string;
  mentions: MentionEntity[];
  contentJson?: Record<string, unknown> | null;
};

type KeydownHandler = (event: KeyboardEvent) => boolean;

export function useComposerState(
  overlayIdTokenResolvers?:
    | Ref<IdTokenResolvers | undefined>
    | ComputedRef<IdTokenResolvers | undefined>,
) {
  const content = ref('');
  const mentions = ref<MentionEntity[]>([]);
  const selectionStart = ref(0);
  const selectionEnd = ref(0);
  const editor = shallowRef<Editor | null>(null);
  const surfaceRef = ref<HTMLElement | null>(null);
  const keydownHandler = ref<KeydownHandler | null>(null);

  function getResolvers(): IdTokenResolvers | undefined {
    return overlayIdTokenResolvers ? unref(overlayIdTokenResolvers) : undefined;
  }

  function syncFromEditor(nextEditor = editor.value) {
    if (!nextEditor) return;
    const serialized = serializeComposerDoc(
      nextEditor.state.doc,
      nextEditor.state.selection,
    );
    content.value = serialized.content;
    mentions.value = serialized.mentions;
    selectionStart.value = serialized.selectionStart;
    selectionEnd.value = serialized.selectionEnd;
  }

  function setSerializedState(
    nextContent: string,
    nextMentions: MentionEntity[],
    nextSelectionStart = nextContent.length,
    nextSelectionEnd = nextSelectionStart,
  ) {
    const nextEditor = editor.value;
    if (!nextEditor) return;
    const doc = buildComposerDoc(nextContent, nextMentions, getResolvers());
    nextEditor.commands.setContent(doc, { emitUpdate: false });
    const from = rawOffsetToEditorPos(nextEditor.state.doc, nextSelectionStart);
    const to = rawOffsetToEditorPos(nextEditor.state.doc, nextSelectionEnd);
    nextEditor.commands.setTextSelection({ from, to });
    syncFromEditor(nextEditor);
  }

  const initialEditor = new Editor({
    extensions: [
      StarterKit.configure({
        blockquote: false,
        bold: false,
        bulletList: false,
        code: false,
        codeBlock: false,
        dropcursor: false,
        gapcursor: false,
        heading: false,
        horizontalRule: false,
        italic: false,
        orderedList: false,
        listItem: false,
        strike: false,
      }),
      ComposerBold,
      ComposerItalic,
      ComposerStrike,
      ComposerCode,
      Placeholder.configure({ placeholder: '' }),
      MentionEntityNode,
      ChannelMentionNode,
      CustomEmojiNode,
      AppIconNode,
      ComposerMarkdownDecorations,
    ],
    content: buildComposerDoc('', [], getResolvers()),
    editorProps: {
      attributes: {
        class: 'chat-input-editor-surface',
      },
      handleKeyDown: (_view, event) => keydownHandler.value?.(event) ?? false,
    },
    onCreate: ({ editor: createdEditor }) => {
      editor.value = createdEditor;
      syncFromEditor(createdEditor);
    },
    onUpdate: ({ editor: updatedEditor }) => {
      syncFromEditor(updatedEditor);
      if (content.value.length > ECHO_COMPOSER_MAX_INPUT_CHARS) {
        const cut = content.value.slice(0, ECHO_COMPOSER_MAX_INPUT_CHARS);
        const kept = mentions.value.filter((m) => m.end <= cut.length);
        const end = cut.length;
        setSerializedState(cut, kept, end, end);
      }
    },
    onSelectionUpdate: ({ editor: updatedEditor }) => {
      syncFromEditor(updatedEditor);
    },
  });

  editor.value = initialEditor;
  syncFromEditor(initialEditor);

  watch(
    () => getResolvers(),
    () => {
      setSerializedState(
        content.value,
        mentions.value,
        selectionStart.value,
        selectionEnd.value,
      );
    },
  );

  onUnmounted(() => {
    editor.value?.destroy();
    editor.value = null;
  });

  function getSelectionStart(): number {
    return selectionStart.value;
  }

  function getSelectionEnd(): number {
    return selectionEnd.value;
  }

  function setSelection(start: number, end = start) {
    setSerializedState(content.value, mentions.value, start, end);
  }

  function resizeTextarea() {
    /* Editor surface grows naturally with CSS. */
  }

  function syncOverlayScroll() {
    /* Legacy no-op: preview sync reads directly from the editor surface. */
  }

  function focus() {
    editor.value?.commands.focus();
  }

  function setEditable(editable: boolean) {
    editor.value?.setEditable(editable);
  }

  function replaceRange(start: number, end: number, text: string) {
    const { nextContent, nextMentions, nextSelectionStart } =
      replaceRangeTransform(content.value, mentions.value, start, end, text);
    setSerializedState(
      nextContent,
      nextMentions,
      nextSelectionStart,
      nextSelectionStart,
    );
  }

  function insertText(text: string) {
    replaceRange(getSelectionStart(), getSelectionEnd(), text);
  }

  function insertMention(
    start: number,
    end: number,
    mention: ComposerMentionInsert,
  ) {
    const { nextContent, nextMentions, nextSelectionStart } =
      insertMentionTransform(
        content.value,
        mentions.value,
        start,
        end,
        mention.kind,
        mention.label,
        mention.userId,
        mention.channelId,
        mention.roleId,
      );
    setSerializedState(
      nextContent,
      nextMentions,
      nextSelectionStart,
      nextSelectionStart,
    );
  }

  function insertChannelMention(
    start: number,
    end: number,
    channel: { id: string; name: string },
  ) {
    const { nextContent, nextMentions, nextSelectionStart } =
      insertChannelMentionTransform(
        content.value,
        mentions.value,
        start,
        end,
        channelMentionRefLabel(channel.name),
        channel.id,
      );
    setSerializedState(
      nextContent,
      nextMentions,
      nextSelectionStart,
      nextSelectionStart,
    );
  }

  function wrapSelection(prefix: string, suffix = prefix) {
    const start = getSelectionStart();
    const end = getSelectionEnd();
    const res = wrapSelectionTransform(
      content.value,
      mentions.value,
      start,
      end,
      prefix,
      suffix,
    );
    if (!res) return;
    setSerializedState(
      res.nextContent,
      res.nextMentions,
      res.nextSelectionStart,
      res.nextSelectionEnd,
    );
  }

  function handleAtomicMentionKeydown(_event: KeyboardEvent): boolean {
    return false;
  }

  function registerKeydownHandler(handler: KeydownHandler | null) {
    keydownHandler.value = handler;
  }

  function clear() {
    setSerializedState('', [], 0);
  }

  function captureSnapshot(): ComposerSnapshot {
    return {
      content: content.value,
      mentions: mentions.value.map((m) => ({ ...m })),
      contentJson: getContentJson(),
    };
  }

  function restoreSnapshot(snapshot: ComposerSnapshot) {
    const nextEditor = editor.value;
    if (!nextEditor) return;
    if (snapshot.contentJson && typeof snapshot.contentJson === 'object') {
      nextEditor.commands.setContent(snapshot.contentJson, {
        emitUpdate: false,
      });
      syncFromEditor(nextEditor);
      const end = content.value.length;
      setSerializedState(content.value, mentions.value, end, end);
      return;
    }
    const end = snapshot.content.length;
    setSerializedState(snapshot.content, snapshot.mentions, end, end);
  }

  /** compact: mute delimiters + style inside `**` / `` ` `` etc. (single document, no HTML overlay). */
  function setMarkdownDecorationsEnabled(enabled: boolean) {
    const ed = editor.value;
    if (!ed) return;
    ed.view.dispatch(ed.state.tr.setMeta(composerMarkdownDecoKey, { enabled }));
  }

  /** TipTap JSON for socket/API v2 body (text-only sends). */
  function getContentJson(): Record<string, unknown> | null {
    const ed = editor.value;
    if (!ed) return null;
    return ed.getJSON() as Record<string, unknown>;
  }

  const overlayHtml = computed(() => '');
  const segments = computed(() => []);

  return {
    content,
    mentions,
    selectionStart,
    selectionEnd,
    editor,
    surfaceRef,
    overlayHtml,
    segments,
    textareaRef: surfaceRef,
    overlayRef: ref<HTMLDivElement | null>(null),
    getSelectionStart,
    getSelectionEnd,
    setSelection,
    resizeTextarea,
    syncOverlayScroll,
    focus,
    setEditable,
    replaceRange,
    insertText,
    insertMention,
    insertChannelMention,
    wrapSelection,
    handleTextareaInput: (_nextValue: string) => {},
    handleAtomicMentionKeydown,
    registerKeydownHandler,
    clear,
    captureSnapshot,
    restoreSnapshot,
    getContentJson,
    setMarkdownDecorationsEnabled,
    setSerializedState,
  };
}
